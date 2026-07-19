"""Scrape Yu-Gi-Oh! Official Tournament Store (OTS) locations.

The public OTS locator page (https://www.yugioh-card.com/en/events/ots-locations/)
does NOT contain the store list in its HTML. The list is rendered client-side by
querying Konami's OTS portal API:

    https://ots-portal.konami.com/api2/public/stores/result?lat=..&lng=..&radius=..

This scraper calls that same API from a handful of globe-spanning anchor points
with a very large radius, then de-duplicates the union by store id. That reliably
returns every active store (~2000+) without needing a browser or Google geocoding.

Run directly:  python -m scrapers.stores_scraper
"""

from __future__ import annotations

from . import common
from .stores_eu import scrape_eu_stores

log = common.log

# The human-facing page users know; recorded as the "source" in the output file.
SOURCE_PAGE = "https://www.yugioh-card.com/en/events/ots-locations/"

# The backing JSON API the locator page itself calls.
STORES_API = "https://ots-portal.konami.com/api2/public/stores/result"

# Anchor points (lat, lng) spread across the globe. Each query returns every store
# within `radius` miles; a 9000-mile radius from each anchor guarantees full global
# coverage even if any single anchor missed antipodal stores. Results are unioned by id.
ANCHORS = [
    (39.0, -98.0),    # Central North America
    (-15.0, -60.0),   # South America
    (50.0, 10.0),     # Central Europe
    (1.0, 110.0),     # Southeast Asia / Oceania
]
SEARCH_RADIUS_MILES = 9000


def _normalize_store(raw: dict) -> dict:
    """Convert one raw API store record into our normalized output shape.

    Maps the API's fields onto the requested schema (name, split address, region,
    phone, website) and derives region + country from coordinates.
    """
    lat = raw.get("lat")
    lng = raw.get("lng")
    state = (raw.get("state") or "").strip() or None
    region = common.region_for(lat, lng, state)

    return {
        # Stable identifier from the source system; used for de-duplication and diffing.
        "id": raw.get("id"),
        "name": (raw.get("location") or "").strip(),
        "address": {
            "street": (raw.get("address") or "").strip() or None,
            "city": (raw.get("city") or "").strip() or None,
            "state": state,
            "zip": (raw.get("zip") or "").strip() or None,
            "country": common.country_for(region, state),
        },
        "region": region,
        # The API exposes phone and email but no website field; website is left null.
        "phone": (raw.get("phone") or "").strip() or None,
        "email": (raw.get("email") or "").strip() or None,
        "website": None,
        "latitude": lat,
        "longitude": lng,
        "remote_duel": bool(raw.get("remote_duel")),
    }


def scrape_americas_stores() -> list[dict]:
    """Fetch and de-duplicate every active OTS store from the Americas portal API.

    Queries each anchor point, keeps only active stores, and unions the results by
    store id (first occurrence wins).
    """
    session = common.build_session()
    by_id: dict[str, dict] = {}

    for lat, lng in ANCHORS:
        payload = common.fetch_json(
            session,
            STORES_API,
            params={"lat": lat, "lng": lng, "radius": SEARCH_RADIUS_MILES},
        )
        results = payload.get("result") or []
        log.info("Anchor (%.1f, %.1f) returned %d stores", lat, lng, len(results))

        for raw in results:
            # Skip inactive listings; the locator only surfaces active stores.
            if not raw.get("active"):
                continue
            store_id = raw.get("id")
            if not store_id or store_id in by_id:
                continue
            by_id[store_id] = _normalize_store(raw)

    log.info("Collected %d unique active Americas stores across %d anchors", len(by_id), len(ANCHORS))
    return list(by_id.values())


def scrape_stores() -> list[dict]:
    """Collect every OTS store worldwide: Americas portal + European locator.

    The two sources use disjoint id spaces (numeric Americas ids vs. "...EU" store
    codes), so their records concatenate without collision. Returns one list
    sorted by country/state/name.
    """
    stores = scrape_americas_stores() + scrape_eu_stores()

    stores.sort(
        key=lambda s: (
            s["address"]["country"] or "",
            s["address"]["state"] or "",
            s["name"],
        )
    )
    log.info("Collected %d unique stores worldwide", len(stores))
    return stores


def main() -> None:
    """Entry point: scrape stores, log a diff, and write data/stores.json.

    write_output() raises SystemExit(1) if zero stores were collected, which fails
    the workflow and leaves the existing data/stores.json untouched.
    """
    stores = scrape_stores()

    previous = common.load_existing("stores.json")
    common.log_diff("stores.json", previous.get("data", []), stores, key=lambda s: s.get("id"))

    common.write_output("stores.json", SOURCE_PAGE, stores)


if __name__ == "__main__":
    main()
