# Yu-Gi-Oh! OTS Store & Event Scrapers

Weekly pipeline that scrapes Yu-Gi-Oh! Official Tournament Store (OTS) locations and
upcoming events, and stores them as structured JSON in [`../data/`](../data).

> Note: the top-level `README.md` belongs to the main project, so this scraper
> documentation lives here in `scrapers/` rather than overwriting it.

## Layout

```
.github/workflows/scrape-ygo-data.yml   # Weekly + manual workflow
data/stores.json                        # Generated: all OTS stores
data/events.json                        # Generated: upcoming events
scrapers/
├── __init__.py
├── common.py                           # Shared HTTP/retry/region/IO helpers
├── stores_scraper.py                   # Stores (Americas + EU + Asia) -> data/stores.json
├── stores_eu.py                        # European OTS locator (merged into stores_scraper)
├── stores_asia.py                      # Asia-Pacific KCGN portal (merged into stores_scraper)
└── events_scraper.py                   # Events -> data/events.json
requirements.txt
```

## Data sources (what is actually scraped)

The public OTS page renders its store list client-side, and the events index is
server-rendered HTML enriched by schema.org JSON-LD on each detail page. The
scrapers target the underlying structured data rather than fragile page markup:

| Dataset | Public page | Underlying source used |
| --- | --- | --- |
| Stores (Americas) | `https://www.yugioh-card.com/en/events/ots-locations/` | `https://ots-portal.konami.com/api2/public/stores/result` (the JSON API the locator page itself calls) |
| Stores (Europe) | `https://www.yugioh-card.com/eu/play/store-locator/` | `https://www.yugioh-card.com/eu/_store-locator/store-locator-get-info.php` (the endpoint that page calls) |
| Stores (Asia-Pacific) | `https://cardgame-network.konami.net/` | `.../mt/user/rest/tournament/<group>/tournament_gsearch` (the tournament search that page calls; stores are read off the results) |
| Events | `https://www.yugioh-card.com/en/events/` | The `#upcoming` list on that page + JSON-LD on each `/events-item/` detail page |

Konami runs region-specific portals with no shared index, so `stores_scraper` merges
three sources into one `data/stores.json`:

- **Americas** (`ots-portal.konami.com`): takes `lat`, `lng`, `radius` (miles). A
  handful of globe-spanning anchor points with a wide radius, unioned by store `id`,
  return every active store. This portal covers only North America + Latin America.
- **Europe** (`stores_eu.py`): the EU endpoint returns at most **99** stores per call
  (nearest first) and misbehaves for very large radii. To enumerate everything, it
  tiles Europe into small cells and **recursively subdivides any cell that comes back
  capped at 99**, so dense metros (London, Paris, Milan) are fully covered while sparse
  areas cost a single call. Records are keyed by the EU store code (e.g. `120069EU`),
  which cannot collide with the numeric Americas ids.
- **Asia-Pacific** (`stores_asia.py`): the KONAMI Card Game Network (KCGN) answers in
  XML unless the request sends `Accept: application/json`, and **none of its store
  endpoints can be enumerated** (geo search returns empty for every nation code,
  `searchStores` ignores pagination and repeats the same 20 rows, and the count
  endpoint returns nothing). Its *tournament* search does paginate correctly, via
  `indexStart` / `indexCount`, and each tournament carries the store it is held at,
  so the store list is derived from upcoming tournaments. That yields the stores
  which actually run events, which is the useful set for arranging a meetup. Covers
  Japan plus Taiwan, Indonesia, Hong Kong, Malaysia, Singapore, the Philippines and
  Thailand, keyed by `...AS` / `...JP` store codes.

Oceania has no KCGN nation group of its own; Konami serves it from the European
site, so Oceanian events appear under the EU portal rather than the Asian one.

## Output format

Both files share the same envelope:

```json
{
  "last_updated": "2026-07-19T08:19:10+00:00",
  "source": "https://www.yugioh-card.com/en/events/ots-locations/",
  "count": 4450,
  "data": [ /* records */ ]
}
```

**Store record**

```json
{
  "id": "6a20a4eccfe9e50df221fa99",
  "name": "Downstairs Cellar",
  "address": { "street": "10824 82 Avenue Northwest", "city": "Edmonton",
               "state": "Alberta", "zip": "T6E 2A5", "country": "Canada" },
  "region": "NA",
  "phone": "5873221113",
  "email": "david.lin@downstairscellar.ca",
  "website": null,
  "latitude": 53.51, "longitude": -113.51,
  "remote_duel": false
}
```

`region` (NA / LATAM / EU / EMEA / APAC / OTHER) is derived from coordinates. `country`
is derived the same way for Americas stores, whose API has no country field; the
European and Asia-Pacific sources supply it directly and it is used as given. Field
values are passed
through faithfully from the source, which occasionally contains messy data (e.g. a
`zip` holding non-postal text); the scraper mirrors the source rather than guessing.

**Event record**

```json
{
  "name": "Yu-Gi-Oh! Championship Series Houston, Texas 2026",
  "type": "YCS",
  "date_start": "2026-10-16T00:00:00-07:00",
  "date_end": "2026-10-18T23:59:59-07:00",
  "date_display": "10/16/2026 - 10/18/2026",
  "venue": "NRG Park",
  "address": { "street": "1 Fannin St", "city": "Houston",
               "state": "TX", "zip": "77054", "country": null },
  "location_text": "Houston, TX",
  "registration_link": null,
  "url": "https://www.yugioh-card.com/en/events-item/2026-ycs-houston/"
}
```

`type` is inferred from the name/URL: YCS, WCQ, Regional, National, Remote Duel YCS,
Local, OTS Tournament, or Special.

## Reliability behavior

- **Retries:** every network request retries up to 3 times, 5s apart.
- **Politeness:** a ~2.5s delay precedes each request, shortened to ~1.0s for the EU
  locator's many small calls and ~0.4s for the KCGN tournament pages (Japan alone
  needs ~280 of them); a descriptive User-Agent is sent.
- **Fail-safe writes:** if a scraper collects 0 records (or the events page layout
  changes so the list can't be found), it exits with code 1 and does **not** write —
  so the workflow fails and existing data is preserved.
- **Diff log:** each run logs how many records were added/removed vs. the previous file.

## Running locally

```bash
python3.11 -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/python -m scrapers.stores_scraper
./.venv/bin/python -m scrapers.events_scraper
```

## Scheduling

`.github/workflows/scrape-ygo-data.yml` runs every Monday at 06:00 UTC and can be
triggered manually via **Actions → Scrape YGO Store & Event Data → Run workflow**.
See the repository configuration notes provided with this workflow for the required
`GITHUB_TOKEN` write permission.
