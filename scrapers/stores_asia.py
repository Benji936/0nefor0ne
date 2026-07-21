"""Scrape Asia-Pacific Yu-Gi-Oh! Official Tournament Store locations.

Konami runs a third store portal for Asia and Japan, the KONAMI Card Game
Network (https://cardgame-network.konami.net), separate from the Americas OTS
portal and the European locator. It is an AngularJS app backed by a REST API
under `/mt/user/rest/`.

Two quirks make that API awkward, both discovered by reading the app's own
Angular services:

1. It answers in XML unless the request sends `Accept: application/json`.
2. Its store endpoints cannot be enumerated. `rest/store/<nation>/place`
   (geo search) returns an empty list for every nation code, `searchStores`
   ignores pagination and always replies with the same 20 rows, and
   `searchStoresCount` returns nothing at all.

The tournament endpoint, by contrast, paginates correctly via `indexStart` /
`indexCount`, and every tournament record carries the full store it is held at
(code, name, address, coordinates, country). So we enumerate tournaments and
derive the store list from them. The set this produces is the stores that
actually run tournaments, which is the right set for a meetup picker: a store
that has never hosted an event is not a useful place to arrange a trade.

This module is imported by `stores_scraper`, which merges its output with the
Americas and European stores; it can also be run directly for debugging:

    python -m scrapers.stores_asia
"""

from __future__ import annotations

import re
import time

from . import common

log = common.log

# The human-facing portal; also sent as Referer (the API expects a same-site one).
SOURCE_PAGE = "https://cardgame-network.konami.net/"

# The tournament search the portal itself calls.
TOURNAMENT_API = "https://cardgame-network.konami.net/mt/user/rest/tournament/{group}/tournament_gsearch"

# Nation *group* codes, which are coarser than country codes: "as" spans
# Taiwan, the Philippines, Indonesia, Hong Kong, Malaysia, Singapore and
# Thailand, while Japan is large enough to get its own group. There is no
# Oceania group; Konami serves Oceania from its European site instead.
GROUPS = ("as", "jp")

# The API caps a page at 50 regardless of what `indexCount` asks for.
PAGE_SIZE = 50

# Safety bound, so a misbehaving `count` cannot spin forever. Japan alone
# carries ~14k upcoming tournaments, so this needs plenty of headroom.
MAX_RECORDS_PER_GROUP = 40000

POLITE_DELAY_SECONDS = 0.4

# Japanese addresses are regular enough to split: an optional postal code, then
# a prefecture (ending in 都/道/府/県), then a municipality (市/区/町/村).
#
# The postal separator is not reliably an ASCII hyphen: the source mixes in
# U+2010 HYPHEN, U+FF0D FULLWIDTH HYPHEN-MINUS, U+2212 MINUS SIGN and even
# U+FF70 / U+30FC (the katakana prolonged sound mark, which merely looks like a
# dash). Matching only "-" silently dropped ~3% of Japanese addresses, leaving
# the postal code stranded in the street and the prefecture unparsed.
#
# The trailing group allows 3 digits as well as 4 because the source contains
# occasional short codes (e.g. "242-023", a typo for "242-0023"); rejecting
# those would strand the whole address in the street field over one digit.
_JP_POSTAL = re.compile("^\\d{3}[-‐－−ｰー]?\\d{3,4}$")
_JP_PREFECTURE = re.compile(r".+?[都道府県]$")
# 郡 (district) appears where a municipality would, in rural addresses.
_JP_CITY = re.compile(r".+?[市区町村郡]$")


def _split_address(address: str, nation_code: str) -> tuple[str | None, str | None, str | None, str | None]:
    """Split a KCGN address into (street, city, state, zip).

    Japanese addresses follow a predictable "<postal> <prefecture> <city>
    <street>" shape and are split accordingly. Other countries in the Asia
    group have no consistent format, so their text is kept whole as the street
    rather than guessed at: a wrong city is worse than a missing one.
    """
    parts = (address or "").split()
    if not parts:
        return None, None, None, None

    zip_code = None
    if _JP_POSTAL.match(parts[0]):
        zip_code = parts.pop(0)

    if nation_code != "JP":
        return (" ".join(parts) or None), None, None, zip_code

    state = parts.pop(0) if parts and _JP_PREFECTURE.match(parts[0]) else None
    city = parts.pop(0) if parts and _JP_CITY.match(parts[0]) else None
    return (" ".join(parts) or None), city, state, zip_code


def _normalize_store(raw: dict) -> dict:
    """Convert one KCGN tournament record into the shared normalized store shape.

    Matches the schema produced by `stores_scraper._normalize_store` so all
    three regional sources merge into one homogeneous list.
    """
    nation_code = (raw.get("nationCode") or "").strip().upper()
    street, city, state, zip_code = _split_address(raw.get("address") or "", nation_code)
    lat = raw.get("latitude")
    lng = raw.get("longitude")

    return {
        # KCGN store codes are suffixed by region ("100306AS", "470714JP"), so
        # they cannot collide with the numeric Americas ids or the EU codes.
        "id": raw.get("storeCode"),
        "name": (raw.get("storeName") or raw.get("locationName") or "").strip(),
        "address": {
            "street": street,
            "city": city,
            "state": state,
            "zip": zip_code,
            "country": (raw.get("nationName") or "").strip() or None,
        },
        # A handful of records carry no coordinates, which would make the shared
        # bounding-box heuristic fall through to "OTHER". Every store on this
        # portal is Asia-Pacific by construction, so say so rather than lose it.
        "region": common.region_for(lat, lng) if lat is not None and lng is not None else "APAC",
        "phone": (raw.get("tel_no") or "").strip() or None,
        "email": None,   # the tournament payload carries no store email
        "website": None,
        "latitude": lat,
        "longitude": lng,
        # KCGN has no remote-duel flag; default to False for parity.
        "remote_duel": False,
    }


def _fetch_group_tournaments(session, group: str) -> list[dict]:
    """Page through every upcoming tournament for one nation group."""
    # Only upcoming tournaments are worth reading: a store that stopped running
    # events is not somewhere to arrange a trade today.
    start_date = time.strftime("%Y-%m-%dT00:00:00.000Z", time.gmtime())

    rows: list[dict] = []
    start = 0
    total: int | None = None

    while start < MAX_RECORDS_PER_GROUP:
        payload = {
            "keyword": "",
            "gpsSearch": False,
            "gpsRange": "10000",
            "reserveable": False,
            "startDate": start_date,
            "indexStart": start,
            "indexCount": PAGE_SIZE,
        }
        try:
            data = common.post_json(
                session,
                TOURNAMENT_API.format(group=group),
                json_body=payload,
                headers={"Referer": SOURCE_PAGE, "Accept": "application/json"},
                polite_delay=POLITE_DELAY_SECONDS,
            )
        except Exception as error:  # one bad page must not lose the whole group
            log.warning("KCGN group %s failed at offset %d: %s", group, start, error)
            break

        batch = (data or {}).get("result") or []
        if total is None:
            total = (data or {}).get("count") or 0
        if not batch:
            break

        rows.extend(batch)
        start += len(batch)
        if start >= total:
            break

    log.info("KCGN group %s: %d tournaments (reported %s)", group, len(rows), total)
    return rows


def scrape_asia_stores() -> list[dict]:
    """Fetch every Asia-Pacific OTS store, derived from upcoming tournaments."""
    session = common.build_session()
    by_code: dict[str, dict] = {}

    for group in GROUPS:
        for raw in _fetch_group_tournaments(session, group):
            code = raw.get("storeCode")
            # First sighting wins; later tournaments at the same store repeat it.
            if code and code not in by_code:
                by_code[code] = _normalize_store(raw)

    log.info("Collected %d unique Asia-Pacific stores", len(by_code))
    return list(by_code.values())


def main() -> None:
    """Entry point for standalone debugging: scrape and log a count by country."""
    from collections import Counter

    stores = scrape_asia_stores()
    counts = Counter(s["address"]["country"] for s in stores)
    log.info("Asia-Pacific stores by country: %s", counts.most_common())


if __name__ == "__main__":
    main()
