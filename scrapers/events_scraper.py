"""Scrape upcoming Yu-Gi-Oh! events (YCS, Regionals, Locals, specials, etc.).

The events index (https://www.yugioh-card.com/en/events/) is server-rendered: its
"Upcoming Events" section lists each event's name, location, date and detail URL.
Each detail page embeds a schema.org JSON-LD <script> with the venue name and a full
postal address, plus precise ISO start/end dates. This scraper reads the list, then
enriches each event from its detail page's JSON-LD.

Run directly:  python -m scrapers.events_scraper
"""

from __future__ import annotations

import json
import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from . import common

log = common.log

EVENTS_PAGE = "https://www.yugioh-card.com/en/events/"
BASE_URL = "https://www.yugioh-card.com"


def classify_event_type(name: str, url: str) -> str:
    """Infer the event type from its name and detail URL slug.

    Returns one of: YCS, WCQ, Regional, National, Remote Duel, Local,
    OTS Tournament, or Special (fallback).
    """
    haystack = f"{name} {url}".lower()
    # Order matters: check the most specific labels first.
    if "remote duel" in haystack or "rdycs" in haystack:
        return "Remote Duel YCS"
    if "championship series" in haystack or re.search(r"\bycs\b", haystack):
        return "YCS"
    if "world championship qualifier" in haystack or "wcq" in haystack:
        return "WCQ"
    if "regional" in haystack:
        return "Regional"
    if "national" in haystack:
        return "National"
    if "ots" in haystack:
        return "OTS Tournament"
    if "local" in haystack:
        return "Local"
    return "Special"


def _parse_event_jsonld(html: str) -> dict:
    """Extract venue and date fields from a detail page's schema.org JSON-LD.

    Returns a dict with venue/address/date fields (values may be None if absent).
    """
    result = {
        "venue": None,
        "street": None,
        "city": None,
        "state": None,
        "zip": None,
        "country": None,
        "date_start": None,
        "date_end": None,
    }

    soup = BeautifulSoup(html, "html.parser")
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or "")
        except (json.JSONDecodeError, TypeError):
            continue

        # A block may be a single object or a list of objects.
        for item in data if isinstance(data, list) else [data]:
            if not isinstance(item, dict):
                continue
            if item.get("@type") != "Event" and "startDate" not in item:
                continue

            result["date_start"] = item.get("startDate") or result["date_start"]
            result["date_end"] = item.get("endDate") or result["date_end"]

            location = item.get("location") or {}
            if isinstance(location, dict):
                result["venue"] = location.get("name") or result["venue"]
                address = location.get("address") or {}
                if isinstance(address, dict):
                    result["street"] = address.get("streetAddress") or result["street"]
                    result["city"] = address.get("addressLocality") or result["city"]
                    result["state"] = address.get("addressRegion") or result["state"]
                    result["zip"] = address.get("postalCode") or result["zip"]
                    result["country"] = address.get("addressCountry") or result["country"]
            return result  # first Event block is authoritative
    return result


def _find_registration_link(html: str) -> str | None:
    """Return the first registration/ticket link on a detail page, if any.

    Matches common registration providers and keywords; returns None when absent.
    """
    soup = BeautifulSoup(html, "html.parser")
    pattern = re.compile(r"regist|ticket|eventbrite|sign.?up|rsvp|passport", re.I)
    for anchor in soup.find_all("a", href=True):
        text = anchor.get_text(" ", strip=True)
        if pattern.search(anchor["href"]) or pattern.search(text):
            return urljoin(BASE_URL, anchor["href"])
    return None


def _parse_upcoming_list(html: str) -> list[dict]:
    """Parse the "Upcoming Events" section of the events index page.

    Returns one dict per event with name, raw location text, raw date text, and the
    absolute detail URL. Raises SystemExit(1) if the expected structure is missing.
    """
    soup = BeautifulSoup(html, "html.parser")
    upcoming = soup.select_one("section#upcoming ul.list-generic")
    if upcoming is None:
        # The page layout changed; fail so we don't silently produce zero events.
        raise SystemExit(
            "ERROR: could not find '#upcoming ul.list-generic' on the events page; "
            "the page structure may have changed."
        )

    events: list[dict] = []
    for item in upcoming.select("li"):
        anchor = item.find("a", href=True)
        if anchor is None:
            continue
        paragraphs = anchor.find_all("p")
        if not paragraphs:
            continue
        name = paragraphs[0].get_text(" ", strip=True)
        location_text = paragraphs[1].get_text(" ", strip=True) if len(paragraphs) > 1 else None
        date_text = paragraphs[2].get_text(" ", strip=True) if len(paragraphs) > 2 else None
        events.append(
            {
                "name": name,
                "location_text": location_text,
                "date_text": date_text,
                "url": urljoin(BASE_URL, anchor["href"]),
            }
        )
    return events


def scrape_events() -> list[dict]:
    """Scrape the upcoming events list and enrich each from its detail page.

    Returns a list of normalized event records. Detail-page enrichment is best
    effort: if a detail page fails, the event is kept with list-page fields only.
    """
    session = common.build_session()

    log.info("Fetching events index: %s", EVENTS_PAGE)
    index_html = common.fetch_html(session, EVENTS_PAGE)
    listed = _parse_upcoming_list(index_html)
    log.info("Found %d events in the upcoming list", len(listed))

    events: list[dict] = []
    for entry in listed:
        detail = {
            "venue": None, "street": None, "city": None, "state": None,
            "zip": None, "country": None, "date_start": None, "date_end": None,
        }
        registration = None
        try:
            # Polite delay is applied inside fetch_html before each detail request.
            detail_html = common.fetch_html(session, entry["url"])
            detail = _parse_event_jsonld(detail_html)
            registration = _find_registration_link(detail_html)
        except Exception as error:  # keep list data even if a single detail page fails
            log.warning("Could not enrich '%s' from %s: %s", entry["name"], entry["url"], error)

        events.append(
            {
                "name": entry["name"],
                "type": classify_event_type(entry["name"], entry["url"]),
                "date_start": detail["date_start"],
                "date_end": detail["date_end"],
                "date_display": entry["date_text"],
                "venue": detail["venue"],
                "address": {
                    "street": detail["street"],
                    "city": detail["city"],
                    "state": detail["state"],
                    "zip": detail["zip"],
                    "country": detail["country"],
                },
                "location_text": entry["location_text"],
                "registration_link": registration,
                "url": entry["url"],
            }
        )

    log.info("Collected %d events", len(events))
    return events


def main() -> None:
    """Entry point: scrape events, log a diff, and write data/events.json.

    write_output() raises SystemExit(1) if zero events were collected, which fails
    the workflow and leaves the existing data/events.json untouched.
    """
    events = scrape_events()

    previous = common.load_existing("events.json")
    common.log_diff("events.json", previous.get("data", []), events, key=lambda e: e.get("url"))

    common.write_output("events.json", EVENTS_PAGE, events)


if __name__ == "__main__":
    main()
