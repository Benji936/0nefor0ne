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
├── stores_scraper.py                   # Stores -> data/stores.json
└── events_scraper.py                   # Events -> data/events.json
requirements.txt
```

## Data sources (what is actually scraped)

The public OTS page renders its store list client-side, and the events index is
server-rendered HTML enriched by schema.org JSON-LD on each detail page. The
scrapers target the underlying structured data rather than fragile page markup:

| Dataset | Public page | Underlying source used |
| --- | --- | --- |
| Stores | `https://www.yugioh-card.com/en/events/ots-locations/` | `https://ots-portal.konami.com/api2/public/stores/result` (the JSON API the locator page itself calls) |
| Events | `https://www.yugioh-card.com/en/events/` | The `#upcoming` list on that page + JSON-LD on each `/events-item/` detail page |

The store API takes `lat`, `lng`, and `radius` (miles). To capture every store, the
scraper queries several globe-spanning anchor points with a wide radius and unions
the results by store `id`. The `/en/` portal covers the Americas (North America +
Latin America); Europe runs a separate portal, so EU stores are not expected here.

## Output format

Both files share the same envelope:

```json
{
  "last_updated": "2026-07-19T08:19:10+00:00",
  "source": "https://www.yugioh-card.com/en/events/ots-locations/",
  "count": 2034,
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

`region` (NA / LATAM / EU / EMEA / APAC / OTHER) and `country` are derived from
coordinates, since the source API has no country field. Field values are passed
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
- **Politeness:** a ~2.5s delay precedes each request; a descriptive User-Agent is sent.
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
