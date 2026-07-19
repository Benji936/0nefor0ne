"""Shared helpers for the OTS store and event scrapers.

Centralizes the pieces both scrapers need:
  * a requests Session with a descriptive User-Agent,
  * network retry logic (3 attempts, 5s delay),
  * a polite delay between requests,
  * region derivation from latitude/longitude,
  * atomic JSON output with a "fail on empty, don't overwrite" guard,
  * a simple added/removed diff log against the previous run.
"""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any, Callable, Iterable

import requests

# --- Configuration -----------------------------------------------------------

# Descriptive User-Agent so the request is identifiable and less likely to be
# treated as an anonymous bot. Includes a contact URL per common scraping etiquette.
USER_AGENT = (
    "OneForOne-YGODataBot/1.0 "
    "(+https://0nefor.one; weekly OTS store & event sync; contact: ygo-data-bot)"
)

# Retry policy for every network call.
MAX_RETRIES = 3
RETRY_DELAY_SECONDS = 5

# Polite delay inserted between successive requests to the same host.
POLITE_DELAY_SECONDS = 2.5

# Per-request network timeout (connect, read) in seconds.
REQUEST_TIMEOUT = 30

# Directory that holds the generated JSON files (repo-root/data).
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")


# --- Logging -----------------------------------------------------------------

def get_logger(name: str) -> logging.Logger:
    """Return a configured logger that prints to stdout.

    Using a plain stdout logger keeps the output readable in GitHub Actions logs.
    """
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
    return logger


log = get_logger("ygo-scraper")


# --- HTTP --------------------------------------------------------------------

def build_session() -> requests.Session:
    """Create a requests Session pre-loaded with the descriptive User-Agent header."""
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/json,*/*",
            "Accept-Language": "en-US,en;q=0.9",
        }
    )
    return session


def _request_with_retry(
    session: requests.Session, url: str, params: dict | None, polite: bool
) -> requests.Response:
    """Perform a GET with retry logic and (optionally) a polite delay first.

    Retries up to MAX_RETRIES times with RETRY_DELAY_SECONDS between attempts,
    on any network error or non-2xx status. Raises the last error if all fail.
    """
    if polite:
        # Sleep before the request so we never hammer the host, even on the first call.
        time.sleep(POLITE_DELAY_SECONDS)

    last_error: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = session.get(url, params=params, timeout=REQUEST_TIMEOUT)
            response.raise_for_status()
            return response
        except requests.RequestException as error:  # network error or bad status
            last_error = error
            log.warning(
                "Request failed (attempt %d/%d) for %s: %s",
                attempt,
                MAX_RETRIES,
                url,
                error,
            )
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY_SECONDS)

    # Every attempt failed: surface the error so the caller can abort the run.
    raise RuntimeError(f"Giving up on {url} after {MAX_RETRIES} attempts") from last_error


def fetch_html(session: requests.Session, url: str, polite: bool = True) -> str:
    """Fetch a URL and return its decoded HTML/text body (with retries)."""
    return _request_with_retry(session, url, None, polite).text


def fetch_json(
    session: requests.Session, url: str, params: dict | None = None, polite: bool = True
) -> Any:
    """Fetch a URL and return its parsed JSON body (with retries)."""
    return _request_with_retry(session, url, params, polite).json()


# --- Region derivation -------------------------------------------------------

# Canadian provinces/territories, used to distinguish Canada from the US when the
# store API only gives a "state" string.
_CANADIAN_PROVINCES = {
    "alberta", "british columbia", "manitoba", "new brunswick",
    "newfoundland and labrador", "northwest territories", "nova scotia",
    "nunavut", "ontario", "prince edward island", "quebec", "saskatchewan",
    "yukon",
}


def region_for(lat: float | None, lng: float | None, state: str | None = None) -> str:
    """Derive a coarse region code (NA / LATAM / EU / EMEA / APAC / OTHER).

    This is a best-effort heuristic based on latitude/longitude bounding boxes,
    because the OTS store API does not return an explicit country or region.
    """
    if lat is None or lng is None:
        return "OTHER"

    # Europe (and nearby): mid-to-high latitudes, longitudes roughly -25..45.
    if 34 <= lat <= 72 and -25 <= lng <= 45:
        return "EU"
    # Western hemisphere.
    if -170 <= lng <= -34:
        # North America: US/Canada sit at higher latitudes.
        if lat >= 24:
            return "NA"
        # Everything below (Mexico, Central & South America, Caribbean).
        return "LATAM"
    # Africa / Middle East band.
    if -35 <= lng <= 60 and -38 <= lat < 34:
        return "EMEA"
    # Asia / Pacific / Oceania.
    if 60 <= lng <= 180 or -180 <= lng < -170:
        return "APAC"
    return "OTHER"


def country_for(region: str, state: str | None) -> str | None:
    """Best-effort country name from region + state.

    Only North America can be disambiguated reliably (US vs. Canada) from the
    "state" field; other regions return None since the source data lacks a country.
    """
    if region == "NA":
        if state and state.strip().lower() in _CANADIAN_PROVINCES:
            return "Canada"
        return "United States"
    return None


# --- Output & diffing --------------------------------------------------------

def _output_path(filename: str) -> str:
    """Return the absolute path of a file inside the data/ directory."""
    return os.path.join(DATA_DIR, filename)


def load_existing(filename: str) -> dict:
    """Load a previously generated data file, or an empty envelope if absent/invalid.

    Used both for the diff log and as the fallback that stays on disk when a run
    produces no data (so existing data is never overwritten with nothing).
    """
    path = _output_path(filename)
    if not os.path.exists(path):
        return {"data": []}
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (json.JSONDecodeError, OSError) as error:
        log.warning("Could not read existing %s (%s); treating as empty.", filename, error)
        return {"data": []}


def log_diff(
    filename: str, old_records: Iterable[dict], new_records: Iterable[dict], key: Callable[[dict], Any]
) -> None:
    """Log how many records were added/removed compared to the previous run.

    `key` extracts a stable identity (e.g. store id or event url) from each record.
    """
    old_keys = {key(r) for r in old_records}
    new_keys = {key(r) for r in new_records}
    added = new_keys - old_keys
    removed = old_keys - new_keys
    log.info(
        "%s diff vs previous run: +%d added, -%d removed (was %d, now %d)",
        filename,
        len(added),
        len(removed),
        len(old_keys),
        len(new_keys),
    )


def write_output(filename: str, source: str, records: list[dict]) -> None:
    """Write the standard envelope to data/<filename>, atomically.

    Enforces the "fail on empty" rule: if `records` is empty, raise SystemExit(1)
    so the workflow fails and the existing file on disk is left untouched.
    """
    if not records:
        # Zero results almost always means the page/API structure changed or the
        # host blocked us. Fail loudly rather than overwrite good data with nothing.
        raise SystemExit(
            f"ERROR: 0 records collected for {filename}; refusing to overwrite existing data."
        )

    envelope = {
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "count": len(records),
        "data": records,
    }

    os.makedirs(DATA_DIR, exist_ok=True)
    path = _output_path(filename)
    # Write to a temp file then rename, so a crash mid-write can't corrupt the file.
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as handle:
        json.dump(envelope, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    os.replace(tmp_path, path)
    log.info("Wrote %d records to %s", len(records), path)
