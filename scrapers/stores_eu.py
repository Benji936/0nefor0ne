"""Scrape European Yu-Gi-Oh! Official Tournament Store (OTS) locations.

Konami Europe runs a separate store locator from the Americas OTS portal used by
`stores_scraper`. Its page (https://www.yugioh-card.com/eu/play/store-locator/)
renders results client-side by calling:

    https://www.yugioh-card.com/eu/_store-locator/store-locator-get-info.php
        ?lat=..&lng=..&radius=<miles>&type=Official Tournament Stores

That endpoint returns at most 99 stores per call (the nearest, by distance) and
misbehaves for very large radii, so a single global query cannot enumerate every
store. Instead we tile Europe into small cells and recursively subdivide any cell
that comes back capped at 99, which guarantees full coverage of dense metros
(London, Paris, Milan, ...) while spending only one call on sparse areas.

This module is imported by `stores_scraper`, which merges its output with the
Americas stores; it can also be run directly for debugging:

    python -m scrapers.stores_eu
"""

from __future__ import annotations

import math

from . import common

log = common.log

# The human-facing locator page; recorded as the "source" and sent as Referer
# (the endpoint expects a same-site Referer).
SOURCE_PAGE = "https://www.yugioh-card.com/eu/play/store-locator/"

# The backing endpoint the locator page itself calls.
STORES_API = "https://www.yugioh-card.com/eu/_store-locator/store-locator-get-info.php"

# The locator's category filter value for physical OTS stores.
STORE_TYPE = "Official Tournament Stores"

# The endpoint returns at most this many stores per call (nearest first).
RESULT_CAP = 99

# Search radius is capped: large radii return truncated/incorrect results, so we
# keep every query within a moderate, reliable range.
MAX_RADIUS_MILES = 250

# Coverage grid: initial tiling over the European bounding box (degrees) plus the
# adaptive-subdivision limits used when a cell returns a capped result.
BBOX = (34.0, 64.0, -11.0, 32.0)  # (lat_min, lat_max, lng_min, lng_max)
INITIAL_CELL_DEG = 2.0            # start with ~2-degree cells
MIN_CELL_DEG = 0.35              # stop subdividing below this (~24 miles)
MAX_DEPTH = 6                    # hard recursion bound

# A slightly shorter polite delay than the default: this scraper makes a few
# hundred small JSON calls to one lightweight endpoint.
POLITE_DELAY_SECONDS = 1.0

# Map the endpoint's short country labels onto the fuller names used elsewhere in
# the dataset; unlisted values pass through unchanged.
_COUNTRY_ALIASES = {"UK": "United Kingdom"}


def _cell_radius_miles(dlat: float, dlng: float, lat: float) -> float:
    """Miles from a cell's center to its corner, so a circle covers the whole cell.

    Uses ~69 miles per degree of latitude and shrinks longitude by cos(latitude);
    a 1.2 factor pads the corner. Capped at MAX_RADIUS_MILES.
    """
    half_lat = dlat * 69.0 / 2
    half_lng = dlng * 69.0 * math.cos(math.radians(lat)) / 2
    radius = math.hypot(half_lat, half_lng) * 1.2
    return min(max(radius, 15.0), MAX_RADIUS_MILES)


def _to_float(value: object) -> float | None:
    """Coerce a coordinate to float; the endpoint returns some as numeric strings."""
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_address(address_string: str, city: str | None, country: str | None) -> tuple[str | None, str | None]:
    """Split an "Address_string" into (street, zip).

    The endpoint formats it as "<street...>,<city>,<zip>,<country>", where the
    street itself may contain commas (e.g. a venue name prefix). We peel the
    trailing country, zip and city segments off the end; whatever remains is the
    street. City/country are matched against the record's explicit fields so a
    comma inside the street is never mistaken for a delimiter.
    """
    segments = [part.strip() for part in (address_string or "").split(",") if part.strip()]
    if not segments:
        return None, None

    zip_code: str | None = None
    if country and segments and segments[-1].lower() == country.strip().lower():
        segments.pop()
    if segments:
        # After the country, the last remaining segment is the postal code.
        zip_code = segments.pop()
    if city and segments and segments[-1].lower() == city.strip().lower():
        segments.pop()

    street = ", ".join(segments) or None
    return street, zip_code


def _normalize_store(raw: dict) -> dict:
    """Convert one raw EU store record into the shared normalized store shape.

    Matches the schema produced by `stores_scraper._normalize_store` so the two
    regions merge into one homogeneous list.
    """
    lat = _to_float(raw.get("Latitude"))
    lng = _to_float(raw.get("Longitude"))
    city = (raw.get("City") or "").strip() or None
    raw_country = (raw.get("Country/Region") or "").strip() or None
    country = _COUNTRY_ALIASES.get(raw_country, raw_country)
    street, zip_code = _parse_address(raw.get("Address_string") or "", city, raw_country)

    return {
        # The EU store code (e.g. "120069EU") is stable and cannot collide with the
        # numeric Americas ids, so the merged dataset stays uniquely keyed.
        "id": raw.get("Store Code"),
        "name": (raw.get("Store Name") or "").strip(),
        "address": {
            "street": street,
            "city": city,
            "state": None,  # the EU endpoint does not provide a state/region field
            "zip": zip_code,
            "country": country,
        },
        "region": common.region_for(lat, lng),
        "phone": (raw.get("Telephone Number") or "").strip() or None,
        "email": (raw.get("E-mail Address") or "").strip() or None,
        "website": None,
        "latitude": lat,
        "longitude": lng,
        # The EU endpoint has no remote-duel flag; default to False for parity.
        "remote_duel": False,
    }


def scrape_eu_stores() -> list[dict]:
    """Fetch and de-duplicate every EU OTS store via adaptive grid subdivision.

    Tiles Europe into INITIAL_CELL_DEG cells; any cell that returns a capped
    RESULT_CAP result is split into four and re-queried, down to MIN_CELL_DEG.
    Returns normalized records keyed uniquely by store code.
    """
    session = common.build_session()
    by_code: dict[str, dict] = {}
    calls = 0

    def visit(lat0: float, lat1: float, lng0: float, lng1: float, depth: int) -> None:
        nonlocal calls
        clat = (lat0 + lat1) / 2
        clng = (lng0 + lng1) / 2
        radius = _cell_radius_miles(lat1 - lat0, lng1 - lng0, clat)

        try:
            rows = common.fetch_json(
                session,
                STORES_API,
                params={
                    "lat": f"{clat:.4f}",
                    "lng": f"{clng:.4f}",
                    "radius": f"{radius:.1f}",
                    "type": STORE_TYPE,
                },
                headers={"Referer": SOURCE_PAGE},
                polite_delay=POLITE_DELAY_SECONDS,
            )
        except Exception as error:  # a single cell failing must not abort the run
            log.warning("EU cell (%.2f, %.2f) failed: %s", clat, clng, error)
            return
        calls += 1

        if not isinstance(rows, list):
            return
        for raw in rows:
            code = raw.get("Store Code")
            if code and code not in by_code:
                by_code[code] = _normalize_store(raw)

        # A full page means the cell is likely truncated; subdivide to see the rest.
        if len(rows) >= RESULT_CAP and (lat1 - lat0) > MIN_CELL_DEG and depth < MAX_DEPTH:
            mlat = (lat0 + lat1) / 2
            mlng = (lng0 + lng1) / 2
            visit(lat0, mlat, lng0, mlng, depth + 1)
            visit(lat0, mlat, mlng, lng1, depth + 1)
            visit(mlat, lat1, lng0, mlng, depth + 1)
            visit(mlat, lat1, mlng, lng1, depth + 1)

    lat_min, lat_max, lng_min, lng_max = BBOX
    lat = lat_min
    while lat < lat_max:
        lng = lng_min
        while lng < lng_max:
            visit(lat, min(lat + INITIAL_CELL_DEG, lat_max), lng, min(lng + INITIAL_CELL_DEG, lng_max), 0)
            lng += INITIAL_CELL_DEG
        lat += INITIAL_CELL_DEG

    log.info("Collected %d unique EU stores in %d API calls", len(by_code), calls)
    return list(by_code.values())


def main() -> None:
    """Entry point for standalone debugging: scrape and log a count by country."""
    from collections import Counter

    stores = scrape_eu_stores()
    counts = Counter(s["address"]["country"] for s in stores)
    log.info("EU stores by country: %s", counts.most_common())


if __name__ == "__main__":
    main()
