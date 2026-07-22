# Trade Meetup Location Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "choose a meetup location" step to the trade-proposal dialog, powered by the already-scraped OTS stores + events data, replacing the old trade-method buttons while keeping the cash-offset feature.

**Architecture:** A new `LocationPicker.vue` (near-me geolocation + text search over stores/events) replaces the trade-method block inside `ProposeTradeDialog.vue`'s settlement section. The chosen place is stored in a new `Trade.meetup_location` jsonb column, threaded through the `create/update/counter_trade_proposal` RPCs and surfaced by `fetch_my_proposals`. The scraped `data/*.json` files are synced into `frontend/public/data/` at build/dev time and fetched at runtime (browser only, to stay SSG-safe). Non-location trades keep working via a "Ship by mail / remote" toggle (`trade_method='mail'`, `meetup_location=null`).

**Tech Stack:** Vue 3 `<script setup>`, Vuetify, Tailwind, vue-i18n, Supabase (Postgres 17 RPCs), vitest, Vite + vite-ssg.

## Global Constraints

- No em dashes in any user-facing UI copy or i18n string (use `/`, `,`, or `...`).
- Do not add a `Co-Authored-By` / publisher line to commits.
- Do NOT run `npm run cards:sync` (prod R2 write) or any prod R2 upload.
- Tests live next to source as `<name>.test.js` / `<name>.spec.js`; runner is `npm run test` (vitest).
- Frontend fetch base is `(import.meta.env.BASE_URL || "/").replace(/\/$/, "")` (see `frontend/src/lib/effectIndex.js`).
- Build is `vite-ssg` (prerenders in Node): any runtime `fetch`/`navigator.geolocation` must be guarded with `typeof window !== "undefined"`.
- Existing `trade_method` values in old rows may be `in_person` / `mail` / `other`; new writes only produce `in_person` (with a location) or `mail`. Rendering must stay backward compatible with `other`.
- Supabase project id: `sxteuctysfiwripnaozi`. Apply DB changes via the Supabase MCP `apply_migration` AND commit the identical SQL to `supabase/migrations/`.

---

### Task 1: Database — `meetup_location` column + RPC updates

**Files:**
- Create: `supabase/migrations/20260719_trade_meetup_location.sql`
- Apply: Supabase MCP `apply_migration` (project `sxteuctysfiwripnaozi`) with the same SQL

**Interfaces:**
- Produces: `Trade.meetup_location jsonb`; RPCs gain a trailing `p_meetup_location jsonb DEFAULT NULL` param:
  - `create_trade_proposal(counterparty uuid, give jsonb, receive jsonb, p_trade_method text, p_cash_amount numeric, p_cash_payer text, p_notes text, p_meetup_location jsonb)`
  - `update_trade_proposal(p_trade_id bigint, give jsonb, receive jsonb, p_trade_method text, p_cash_amount numeric, p_cash_payer text, p_notes text, p_meetup_location jsonb)`
  - `counter_trade_proposal(p_original_id bigint, give jsonb, receive jsonb, p_trade_method text, p_cash_amount numeric, p_cash_payer text, p_meetup_location jsonb)`
  - `fetch_my_proposals()` return row gains `meetup_location jsonb` (after `notes`).
- `meetup_location` shape: `{ source:'store'|'event', ref_id, name, address, city, state, country, lat, lng, event_date, url }` (any field may be null).

**This task is CRITICAL (threshold 4.5).**

- [ ] **Step 1: Write the migration SQL file**

Create `supabase/migrations/20260719_trade_meetup_location.sql`:

```sql
-- Add a structured meetup location to trades and thread it through the proposal RPCs.
-- meetup_location jsonb shape:
--   { source:'store'|'event', ref_id, name, address, city, state, country, lat, lng, event_date, url }

ALTER TABLE public."Trade"
  ADD COLUMN IF NOT EXISTS meetup_location jsonb;

-- Drop the exact existing overloads we are replacing (avoids PostgREST overload ambiguity).
DROP FUNCTION IF EXISTS public.create_trade_proposal(uuid, jsonb, jsonb, text, numeric, text, text);
DROP FUNCTION IF EXISTS public.update_trade_proposal(bigint, jsonb, jsonb, text, numeric, text, text);
DROP FUNCTION IF EXISTS public.counter_trade_proposal(bigint, jsonb, jsonb, text, numeric, text);
DROP FUNCTION IF EXISTS public.fetch_my_proposals();

-- ── create_trade_proposal ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_trade_proposal(
  counterparty uuid,
  give jsonb DEFAULT '[]'::jsonb,
  receive jsonb DEFAULT '[]'::jsonb,
  p_trade_method text DEFAULT NULL::text,
  p_cash_amount numeric DEFAULT NULL::numeric,
  p_cash_payer text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_meetup_location jsonb DEFAULT NULL::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  me            uuid   := auth.uid();
  new_trade_id  bigint;
  give_count    int    := coalesce(jsonb_array_length(give),    0);
  receive_count int    := coalesce(jsonb_array_length(receive), 0);
  bad_id        bigint;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF counterparty IS NULL THEN RAISE EXCEPTION 'counterparty is required'; END IF;
  IF counterparty = me    THEN RAISE EXCEPTION 'cannot trade with yourself'; END IF;
  IF give_count = 0 AND receive_count = 0 THEN
    RAISE EXCEPTION 'trade must include at least one card on either side';
  END IF;
  IF p_cash_amount IS NOT NULL AND p_cash_payer IS NULL THEN
    RAISE EXCEPTION 'cash_payer is required when cash_amount is set';
  END IF;

  IF give_count > 0 THEN
    SELECT (item->>'card_id')::bigint INTO bad_id
    FROM jsonb_array_elements(give) AS item
    WHERE NOT EXISTS (
      SELECT 1 FROM public."Card" c
      WHERE c.id = (item->>'card_id')::bigint
        AND c.trader = me
        AND c.status NOT IN ('locked','traded')
    ) LIMIT 1;
    IF bad_id IS NOT NULL THEN
      RAISE EXCEPTION 'card % is locked or not yours to trade', bad_id;
    END IF;
  END IF;

  IF receive_count > 0 THEN
    SELECT (item->>'card_id')::bigint INTO bad_id
    FROM jsonb_array_elements(receive) AS item
    WHERE NOT EXISTS (
      SELECT 1 FROM public."Card" c
      WHERE c.id = (item->>'card_id')::bigint
        AND c.trader = counterparty
        AND c.wish   = false
        AND c.status NOT IN ('locked','traded')
    ) LIMIT 1;
    IF bad_id IS NOT NULL THEN
      RAISE EXCEPTION 'card % is locked or not available from counterparty', bad_id;
    END IF;
  END IF;

  INSERT INTO public."Trade" (status, user1, user2, trade_method, cash_amount, cash_payer, notes, meetup_location)
  VALUES ('pending', me, counterparty, p_trade_method, p_cash_amount, p_cash_payer, p_notes, p_meetup_location)
  RETURNING id INTO new_trade_id;

  IF give_count > 0 THEN
    INSERT INTO public.trade_card (trade, card, quantity)
    SELECT new_trade_id, (item->>'card_id')::bigint,
           COALESCE(NULLIF(item->>'quantity','')::numeric, 1)
    FROM jsonb_array_elements(give) AS item;
  END IF;

  IF receive_count > 0 THEN
    INSERT INTO public.trade_card (trade, card, quantity)
    SELECT new_trade_id, (item->>'card_id')::bigint,
           COALESCE(NULLIF(item->>'quantity','')::numeric, 1)
    FROM jsonb_array_elements(receive) AS item;
  END IF;

  RETURN new_trade_id;
END;
$function$;

-- ── update_trade_proposal ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_trade_proposal(
  p_trade_id bigint,
  give jsonb DEFAULT '[]'::jsonb,
  receive jsonb DEFAULT '[]'::jsonb,
  p_trade_method text DEFAULT NULL::text,
  p_cash_amount numeric DEFAULT NULL::numeric,
  p_cash_payer text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_meetup_location jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  me         uuid := auth.uid();
  t          RECORD;
  give_count int  := coalesce(jsonb_array_length(give),    0);
  recv_count int  := coalesce(jsonb_array_length(receive), 0);
  bad_id     bigint;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF give_count = 0 AND recv_count = 0 THEN
    RAISE EXCEPTION 'trade must include at least one card on either side';
  END IF;
  IF p_cash_amount IS NOT NULL AND p_cash_payer IS NULL THEN
    RAISE EXCEPTION 'cash_payer is required when cash_amount is set';
  END IF;

  SELECT * INTO t FROM public."Trade" WHERE id = p_trade_id;
  IF NOT FOUND         THEN RAISE EXCEPTION 'trade not found'; END IF;
  IF t.user1 <> me     THEN RAISE EXCEPTION 'only the proposer can edit a pending proposal'; END IF;
  IF t.status <> 'pending' THEN RAISE EXCEPTION 'only pending proposals can be edited'; END IF;

  DELETE FROM public.trade_card WHERE trade = p_trade_id;

  IF give_count > 0 THEN
    SELECT (item->>'card_id')::bigint INTO bad_id
    FROM jsonb_array_elements(give) AS item
    WHERE NOT EXISTS (
      SELECT 1 FROM public."Card" c
      WHERE c.id = (item->>'card_id')::bigint
        AND c.trader = me
        AND c.status NOT IN ('locked','traded')
    ) LIMIT 1;
    IF bad_id IS NOT NULL THEN
      RAISE EXCEPTION 'card % is locked or not yours to trade', bad_id;
    END IF;
  END IF;

  IF recv_count > 0 THEN
    SELECT (item->>'card_id')::bigint INTO bad_id
    FROM jsonb_array_elements(receive) AS item
    WHERE NOT EXISTS (
      SELECT 1 FROM public."Card" c
      WHERE c.id = (item->>'card_id')::bigint
        AND c.trader = t.user2
        AND c.wish   = false
        AND c.status NOT IN ('locked','traded')
    ) LIMIT 1;
    IF bad_id IS NOT NULL THEN
      RAISE EXCEPTION 'card % is locked or not available from counterparty', bad_id;
    END IF;
  END IF;

  IF give_count > 0 THEN
    INSERT INTO public.trade_card (trade, card, quantity)
    SELECT p_trade_id, (item->>'card_id')::bigint,
           COALESCE(NULLIF(item->>'quantity','')::numeric, 1)
    FROM jsonb_array_elements(give) AS item;
  END IF;

  IF recv_count > 0 THEN
    INSERT INTO public.trade_card (trade, card, quantity)
    SELECT p_trade_id, (item->>'card_id')::bigint,
           COALESCE(NULLIF(item->>'quantity','')::numeric, 1)
    FROM jsonb_array_elements(receive) AS item;
  END IF;

  UPDATE public."Trade"
  SET trade_method    = p_trade_method,
      cash_amount     = p_cash_amount,
      cash_payer      = p_cash_payer,
      notes           = p_notes,
      meetup_location = p_meetup_location
  WHERE id = p_trade_id;
END;
$function$;

-- ── counter_trade_proposal ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.counter_trade_proposal(
  p_original_id bigint,
  give jsonb,
  receive jsonb,
  p_trade_method text DEFAULT NULL::text,
  p_cash_amount numeric DEFAULT NULL::numeric,
  p_cash_payer text DEFAULT NULL::text,
  p_meetup_location jsonb DEFAULT NULL::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_trade  "Trade"%ROWTYPE;
  v_new_id bigint;
BEGIN
  SELECT * INTO v_trade FROM "Trade" WHERE id = p_original_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trade % not found', p_original_id;
  END IF;

  IF v_trade.user2 IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not authorised to counter this proposal';
  END IF;

  IF v_trade.status <> 'pending' THEN
    RAISE EXCEPTION 'Can only counter a pending proposal';
  END IF;

  UPDATE "Trade" SET status = 'cancelled' WHERE id = p_original_id;
  DELETE FROM "Trade" WHERE id = p_original_id;

  v_new_id := create_trade_proposal(
    v_trade.user1,
    give,
    receive,
    p_trade_method,
    p_cash_amount,
    p_cash_payer,
    NULL,
    p_meetup_location
  );

  RETURN v_new_id;
END;
$function$;

-- ── fetch_my_proposals ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fetch_my_proposals()
 RETURNS TABLE(id bigint, status text, created_at timestamp with time zone, counterparty_id uuid, counterparty_name text, counterparty_avatar_url text, i_am_proposer boolean, i_give jsonb, i_receive jsonb, trade_method text, cash_amount numeric, cash_payer text, notes text, meetup_location jsonb, i_confirmed boolean, they_confirmed boolean, decline_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  RETURN QUERY
  SELECT
    t.id, t.status, t.created_at,
    CASE WHEN t.user1 = me THEN t.user2    ELSE t.user1    END,
    CASE WHEN t.user1 = me THEN tr2."Name" ELSE tr1."Name" END,
    CASE WHEN t.user1 = me THEN tr2.avatar_url ELSE tr1.avatar_url END,
    (t.user1 = me),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'image_id', c.image_id,
        'extension', c.extension, 'condition', c.condition,
        'language', c.language, 'quantity', tc.quantity, 'rarity', c.rarity))
      FROM trade_card tc JOIN "Card" c ON c.id = tc.card
      WHERE tc.trade = t.id AND c.trader = me
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'image_id', c.image_id,
        'extension', c.extension, 'condition', c.condition,
        'language', c.language, 'quantity', tc.quantity, 'rarity', c.rarity))
      FROM trade_card tc JOIN "Card" c ON c.id = tc.card
      WHERE tc.trade = t.id AND c.trader != me
    ), '[]'::jsonb),
    t.trade_method, t.cash_amount, t.cash_payer, t.notes, t.meetup_location,
    CASE WHEN t.user1 = me THEN t.user1_confirmed ELSE t.user2_confirmed END,
    CASE WHEN t.user1 = me THEN t.user2_confirmed ELSE t.user1_confirmed END,
    t.decline_reason
  FROM "Trade" t
  JOIN "Trader" tr1 ON tr1.id = t.user1
  JOIN "Trader" tr2 ON tr2.id = t.user2
  WHERE t.user1 = me OR t.user2 = me
  ORDER BY t.created_at DESC NULLS LAST;
END;
$function$;

-- Re-grant EXECUTE (dropped functions lose their grants).
GRANT EXECUTE ON FUNCTION public.create_trade_proposal(uuid, jsonb, jsonb, text, numeric, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_trade_proposal(bigint, jsonb, jsonb, text, numeric, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.counter_trade_proposal(bigint, jsonb, jsonb, text, numeric, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_my_proposals() TO authenticated;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Apply the migration to the live database**

Use the Supabase MCP tool `apply_migration` with:
- `project_id`: `sxteuctysfiwripnaozi`
- `name`: `trade_meetup_location`
- `query`: the exact SQL from Step 1.

Expected: success, no error.

- [ ] **Step 3: Verify column + signatures via SQL**

Use the Supabase MCP tool `execute_sql` (project `sxteuctysfiwripnaozi`):

```sql
select
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='Trade' and column_name='meetup_location') as has_column,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='create_trade_proposal'
       and pg_get_function_identity_arguments(p.oid) like '%p_meetup_location jsonb') as create_has_param,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='update_trade_proposal'
       and pg_get_function_identity_arguments(p.oid) like '%p_meetup_location jsonb') as update_has_param,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='counter_trade_proposal'
       and pg_get_function_identity_arguments(p.oid) like '%p_meetup_location jsonb') as counter_has_param;
```

Expected: `has_column=1, create_has_param=1, update_has_param=1, counter_has_param=1`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260719_trade_meetup_location.sql
git commit -m "feat(db): add Trade.meetup_location and thread it through proposal RPCs"
```

---

### Task 2: Serve scraped OTS data to the frontend

**Files:**
- Create: `frontend/scripts/sync-ots-data.mjs`
- Modify: `frontend/package.json` (scripts: add `data:ots`, prepend to `build`, add `predev`)
- Modify: `frontend/.gitignore` (ignore the generated copies)
- Generated (gitignored): `frontend/public/data/stores.json`, `frontend/public/data/events.json`

**Interfaces:**
- Produces: at dev/build time, `frontend/public/data/stores.json` and `events.json` exist, each a `{ last_updated, source, count, data:[...] }` envelope, served at `/data/stores.json` and `/data/events.json`.

- [ ] **Step 1: Write the sync script**

Create `frontend/scripts/sync-ots-data.mjs`:

```js
// Copies the canonical scraped OTS data (repo-root /data) into public/data so
// Vite serves it at /data/stores.json and /data/events.json. Runs on predev and
// prebuild; the copies are gitignored (single source of truth = repo-root /data).
import { copyFile, mkdir, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoData = resolve(__dirname, "../../data");
const outDir = resolve(__dirname, "../public/data");

const FILES = ["stores.json", "events.json"];

async function main() {
  await mkdir(outDir, { recursive: true });
  for (const name of FILES) {
    const src = resolve(repoData, name);
    try {
      await access(src);
    } catch {
      console.warn(`[sync-ots-data] source missing, skipping: ${src}`);
      continue;
    }
    await copyFile(src, resolve(outDir, name));
    console.log(`[sync-ots-data] copied ${name}`);
  }
}

main().catch((err) => {
  console.error("[sync-ots-data] failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Wire the script into package.json**

In `frontend/package.json`, add to `scripts` a `data:ots` entry, a `predev` entry, and prepend the sync to `build`. Change:

```json
    "dev": "vite",
    "build": "node scripts/generate-sitemap.mjs && vite-ssg build",
```

to:

```json
    "dev": "vite",
    "predev": "node scripts/sync-ots-data.mjs",
    "data:ots": "node scripts/sync-ots-data.mjs",
    "build": "node scripts/generate-sitemap.mjs && node scripts/sync-ots-data.mjs && vite-ssg build",
```

- [ ] **Step 3: Gitignore the generated copies**

Append to `frontend/.gitignore` (create the file if it does not exist):

```
# Generated at build time from repo-root /data (see scripts/sync-ots-data.mjs)
public/data/stores.json
public/data/events.json
```

- [ ] **Step 4: Run the sync and verify the files exist and parse**

Run: `cd frontend && npm run data:ots`
Then: `node -e "const s=require('./public/data/stores.json'),e=require('./public/data/events.json'); if(!Array.isArray(s.data)||!Array.isArray(e.data)) throw new Error('bad shape'); console.log('stores',s.count,'events',e.count)"`
Expected: prints e.g. `stores 2034 events 10`, no error.

- [ ] **Step 5: Commit**

```bash
git add frontend/scripts/sync-ots-data.mjs frontend/package.json frontend/.gitignore
git commit -m "build(frontend): sync scraped OTS stores/events into public/data"
```

---

### Task 3: OTS locations loader + distance/geolocation helpers

**Files:**
- Create: `frontend/src/lib/otsLocations.js`
- Test: `frontend/src/lib/otsLocations.test.js`

**Interfaces:**
- Produces:
  - `loadMeetupPlaces(): Promise<Place[]>` — fetches + normalizes stores and events (browser only; returns `[]` during SSG).
  - `distanceKm(a, b): number|null` — haversine km between `{lat,lng}` points; null if any coord missing.
  - `getMyPosition(): Promise<{lat:number,lng:number}>` — browser geolocation; rejects if unavailable/denied.
  - `searchPlaces(places, query, origin=null): Place[]` — text filter over name/city/state/country; when `origin` set, sort ascending by distance with coord-less places last.
  - `Place` = `{ source:'store'|'event', ref_id, name, city, state, country, region, address, lat, lng, event_date, url }`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/otsLocations.test.js`:

```js
import { describe, it, expect } from "vitest";
import { distanceKm, searchPlaces } from "./otsLocations";

const places = [
  { source: "store", ref_id: "a", name: "Alpha Cards", city: "Paris",  state: "IDF", country: "France", lat: 48.85, lng: 2.35 },
  { source: "store", ref_id: "b", name: "Beta Games",  city: "Lyon",   state: "ARA", country: "France", lat: 45.76, lng: 4.84 },
  { source: "event", ref_id: "e", name: "YCS London",  city: "London", state: null,  country: "UK",     lat: null,  lng: null },
];

describe("distanceKm", () => {
  it("returns null when a coordinate is missing", () => {
    expect(distanceKm({ lat: 1, lng: 1 }, { lat: null, lng: 2 })).toBeNull();
  });
  it("computes a known distance (Paris to Lyon ~= 392 km)", () => {
    const d = distanceKm({ lat: 48.85, lng: 2.35 }, { lat: 45.76, lng: 4.84 });
    expect(d).toBeGreaterThan(380);
    expect(d).toBeLessThan(405);
  });
});

describe("searchPlaces", () => {
  it("filters by name, city, state or country (case-insensitive)", () => {
    expect(searchPlaces(places, "lyon").map(p => p.ref_id)).toEqual(["b"]);
    expect(searchPlaces(places, "france").map(p => p.ref_id).sort()).toEqual(["a", "b"]);
  });
  it("returns all places when query is empty", () => {
    expect(searchPlaces(places, "")).toHaveLength(3);
  });
  it("sorts by distance from origin, coord-less places last", () => {
    const origin = { lat: 45.75, lng: 4.85 }; // near Lyon
    const ordered = searchPlaces(places, "", origin).map(p => p.ref_id);
    expect(ordered[0]).toBe("b");   // Lyon closest
    expect(ordered[1]).toBe("a");   // Paris next
    expect(ordered[2]).toBe("e");   // no coords -> last
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/otsLocations.test.js`
Expected: FAIL (module `./otsLocations` not found).

- [ ] **Step 3: Write the loader + helpers**

Create `frontend/src/lib/otsLocations.js`:

```js
// Loads scraped OTS stores + upcoming events (served from public/data) and
// exposes helpers to search them and sort by distance from the user.
// Fetching happens lazily in the browser only (never during SSG prerender).

let _placesCache = null;
let _placesPromise = null;

function _base() {
  return (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
}

async function _fetchJson(path) {
  const res = await fetch(`${_base()}${path}`);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

// Store record -> Place
function _normalizeStore(s) {
  const addr = s.address ?? {};
  const parts = [addr.street, addr.city, addr.state, addr.zip].filter(Boolean);
  return {
    source: "store",
    ref_id: s.id,
    name: s.name,
    city: addr.city ?? null,
    state: addr.state ?? null,
    country: addr.country ?? null,
    region: s.region ?? null,
    address: parts.join(", ") || null,
    lat: s.latitude ?? null,
    lng: s.longitude ?? null,
    event_date: null,
    url: null,
  };
}

// Event record -> Place (events carry no coordinates in the source data)
function _normalizeEvent(e) {
  const addr = e.address ?? {};
  const parts = [addr.street, addr.city, addr.state, addr.zip].filter(Boolean);
  return {
    source: "event",
    ref_id: e.url,
    name: e.name,
    city: addr.city ?? null,
    state: addr.state ?? null,
    country: addr.country ?? null,
    region: null,
    address: parts.join(", ") || e.location_text || null,
    lat: null,
    lng: null,
    event_date: e.date_display ?? null,
    url: e.url ?? null,
  };
}

// Fetch + normalize stores and events once; cached for the session.
export async function loadMeetupPlaces() {
  if (_placesCache) return _placesCache;
  if (typeof window === "undefined") return []; // SSG guard
  if (!_placesPromise) {
    _placesPromise = Promise.all([
      _fetchJson("/data/stores.json").catch(() => ({ data: [] })),
      _fetchJson("/data/events.json").catch(() => ({ data: [] })),
    ])
      .then(([stores, events]) => {
        const places = [
          ...(stores.data ?? []).map(_normalizeStore),
          ...(events.data ?? []).map(_normalizeEvent),
        ];
        _placesCache = places;
        return places;
      })
      .catch(() => {
        _placesPromise = null; // allow retry
        return [];
      });
  }
  return _placesPromise;
}

// Haversine distance in km between two {lat,lng}; null if any coord missing.
export function distanceKm(a, b) {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return null;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Ask the browser for the user's position. Resolves {lat,lng} or rejects.
export function getMyPosition() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  });
}

// Filter by free text over name/city/state/country, optionally sorting by
// distance from `origin`; coord-less places sink to the bottom.
export function searchPlaces(places, query, origin = null) {
  const q = (query ?? "").toLowerCase().trim();
  let list = q
    ? places.filter((p) =>
        [p.name, p.city, p.state, p.country]
          .filter(Boolean)
          .some((f) => f.toLowerCase().includes(q))
      )
    : places.slice();
  if (origin) {
    list = list
      .map((p) => ({ ...p, _dist: distanceKm(origin, p) }))
      .sort((a, b) => {
        if (a._dist == null && b._dist == null) return 0;
        if (a._dist == null) return 1;
        if (b._dist == null) return -1;
        return a._dist - b._dist;
      });
  }
  return list;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/otsLocations.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/otsLocations.js frontend/src/lib/otsLocations.test.js
git commit -m "feat(trade): add OTS locations loader with distance and geo helpers"
```

---

### Task 4: LocationPicker component

**Files:**
- Create: `frontend/src/components/trade/LocationPicker.vue`

**Interfaces:**
- Consumes: `loadMeetupPlaces`, `searchPlaces`, `getMyPosition`, `distanceKm` from Task 3; i18n keys from Task 7.
- Produces: `<LocationPicker v-model="place" v-model:deliveryMode="mode" :counterparty-name="name" />`
  - `modelValue`: chosen `Place` object or `null`.
  - `deliveryMode`: `'location'` | `'mail'`.
  - Emits `update:modelValue` (Place|null) and `update:deliveryMode` ('location'|'mail').

- [ ] **Step 1: Write the component**

Create `frontend/src/components/trade/LocationPicker.vue`:

```vue
<script setup>
import { ref, watch, computed } from "vue";
import { useI18n } from "vue-i18n";
import { loadMeetupPlaces, searchPlaces, getMyPosition, distanceKm } from "@/lib/otsLocations";

const props = defineProps({
  modelValue:       { type: Object, default: null },        // chosen Place or null
  deliveryMode:     { type: String, default: "location" },  // 'location' | 'mail'
  counterpartyName: { type: String, default: "" },
});
const emit = defineEmits(["update:modelValue", "update:deliveryMode"]);
const { t } = useI18n();

const allPlaces = ref([]);
const loaded = ref(false);
const query = ref("");
const origin = ref(null);      // {lat,lng} once "near me" used
const geoError = ref("");
const loadingGeo = ref(false);

async function ensureLoaded() {
  if (loaded.value) return;
  allPlaces.value = await loadMeetupPlaces();
  loaded.value = true;
}

// Preload the list when the picker is in location mode.
watch(() => props.deliveryMode, (m) => { if (m === "location") ensureLoaded(); }, { immediate: true });

const results = computed(() => searchPlaces(allPlaces.value, query.value, origin.value).slice(0, 40));
const stores = computed(() => results.value.filter((p) => p.source === "store"));
const events = computed(() => results.value.filter((p) => p.source === "event"));

async function useNearMe() {
  geoError.value = "";
  loadingGeo.value = true;
  try {
    await ensureLoaded();
    origin.value = await getMyPosition();
  } catch {
    geoError.value = t("proposeDialog.locationDenied");
  } finally {
    loadingGeo.value = false;
  }
}

function pick(place) { emit("update:modelValue", place); }
function clearPick() { emit("update:modelValue", null); }
function setMode(mode) {
  emit("update:deliveryMode", mode);
  if (mode === "mail") emit("update:modelValue", null);
}
function distLabel(place) {
  const d = origin.value ? distanceKm(origin.value, place) : null;
  return d == null ? null : t("proposeDialog.kmAway", { km: Math.round(d) });
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <p class="text-[11px] font-bold uppercase tracking-widest" style="color: var(--c-muted)">
      {{ t('proposeDialog.meetupLocation') }}
    </p>

    <!-- Mode toggle -->
    <div class="flex gap-2">
      <button
        class="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer"
        :style="deliveryMode === 'location'
          ? { backgroundColor: 'var(--c-trade)', borderColor: 'var(--c-trade)', color: 'white' }
          : { backgroundColor: 'transparent', borderColor: 'var(--c-border)', color: 'var(--c-muted)' }"
        @click="setMode('location')"
      >
        <v-icon icon="mdi-map-marker-outline" size="14" />{{ t('proposeDialog.meetAtLocation') }}
      </button>
      <button
        class="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer"
        :style="deliveryMode === 'mail'
          ? { backgroundColor: 'var(--c-trade)', borderColor: 'var(--c-trade)', color: 'white' }
          : { backgroundColor: 'transparent', borderColor: 'var(--c-border)', color: 'var(--c-muted)' }"
        @click="setMode('mail')"
      >
        <v-icon icon="mdi-package-variant-closed" size="14" />{{ t('proposeDialog.shipByMail') }}
      </button>
    </div>

    <template v-if="deliveryMode === 'location'">
      <!-- Selected place -->
      <div
        v-if="modelValue"
        class="flex items-center gap-2 rounded-lg border px-3 py-2"
        style="border-color: var(--c-mutual); background-color: color-mix(in srgb, var(--c-mutual) 10%, transparent)"
      >
        <v-icon icon="mdi-map-marker-check" size="16" color="var(--c-mutual)" />
        <div class="flex flex-col grow min-w-0">
          <span class="text-xs font-semibold truncate" style="color: var(--c-text)">{{ modelValue.name }}</span>
          <span class="text-[11px] truncate" style="color: var(--c-muted)">{{ modelValue.address || modelValue.city }}</span>
        </div>
        <v-btn icon="mdi-close" size="x-small" variant="text" color="white" @click="clearPick" />
      </div>

      <template v-else>
        <!-- Search + near me -->
        <div class="flex gap-2 items-center">
          <div class="relative grow">
            <v-icon icon="mdi-magnify" size="16" class="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" color="var(--c-muted)" />
            <input
              v-model="query"
              :placeholder="t('proposeDialog.searchPlaces')"
              class="w-full rounded-lg pl-8 pr-3 py-2 text-sm outline-none border"
              :style="{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }"
              @focus="ensureLoaded"
            />
          </div>
          <v-btn
            size="small" variant="flat" prepend-icon="mdi-crosshairs-gps"
            :loading="loadingGeo"
            style="background-color: var(--c-surface-2); color: var(--c-text)"
            @click="useNearMe"
          >{{ t('proposeDialog.nearMe') }}</v-btn>
        </div>
        <p v-if="geoError" class="text-[11px]" style="color: var(--c-accent)">{{ geoError }}</p>

        <!-- Results -->
        <div class="max-h-56 overflow-y-auto flex flex-col gap-1 pr-1">
          <p v-if="loaded && results.length === 0" class="text-xs text-center py-4" style="color: var(--c-muted)">
            {{ t('proposeDialog.noPlaces') }}
          </p>

          <template v-if="stores.length">
            <p class="text-[10px] font-bold uppercase tracking-widest pt-1" style="color: var(--c-muted)">
              {{ t('proposeDialog.stores') }}
            </p>
            <button
              v-for="p in stores" :key="'s' + p.ref_id" type="button"
              class="flex items-center gap-2 text-left rounded-lg px-2 py-2 border transition-colors cursor-pointer hover:bg-[var(--c-surface-2)]"
              style="border-color: var(--c-border)"
              @click="pick(p)"
            >
              <v-icon icon="mdi-store-outline" size="14" color="var(--c-muted)" />
              <span class="flex flex-col grow min-w-0">
                <span class="text-xs font-semibold truncate" style="color: var(--c-text)">{{ p.name }}</span>
                <span class="text-[11px] truncate" style="color: var(--c-muted)">{{ [p.city, p.state].filter(Boolean).join(', ') }}</span>
              </span>
              <span v-if="distLabel(p)" class="text-[10px] shrink-0" style="color: var(--c-mutual)">{{ distLabel(p) }}</span>
            </button>
          </template>

          <template v-if="events.length">
            <p class="text-[10px] font-bold uppercase tracking-widest pt-2" style="color: var(--c-muted)">
              {{ t('proposeDialog.events') }}
            </p>
            <button
              v-for="p in events" :key="'e' + p.ref_id" type="button"
              class="flex items-center gap-2 text-left rounded-lg px-2 py-2 border transition-colors cursor-pointer hover:bg-[var(--c-surface-2)]"
              style="border-color: var(--c-border)"
              @click="pick(p)"
            >
              <v-icon icon="mdi-calendar-star" size="14" color="var(--c-muted)" />
              <span class="flex flex-col grow min-w-0">
                <span class="text-xs font-semibold truncate" style="color: var(--c-text)">{{ p.name }}</span>
                <span class="text-[11px] truncate" style="color: var(--c-muted)">
                  {{ [p.city, p.state].filter(Boolean).join(', ') || p.address }}{{ p.event_date ? ' · ' + p.event_date : '' }}
                </span>
              </span>
            </button>
          </template>
        </div>
      </template>
    </template>
  </div>
</template>
```

- [ ] **Step 2: Verify it compiles (build lint of the module)**

Run: `cd frontend && npx vite build --mode development 2>&1 | head -30` is heavy; instead rely on the dev server in Task 9. For a quick syntax check run: `cd frontend && node -e "require('@vue/compiler-sfc').parse(require('fs').readFileSync('src/components/trade/LocationPicker.vue','utf8')); console.log('SFC parses')"`
Expected: prints `SFC parses`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/trade/LocationPicker.vue
git commit -m "feat(trade): add LocationPicker (near-me + search over OTS stores/events)"
```

---

### Task 5: Wire LocationPicker into ProposeTradeDialog

**Files:**
- Modify: `frontend/src/components/trade/ProposeTradeDialog.vue`

**Interfaces:**
- Consumes: `LocationPicker` (Task 4); `settlement.meetup_location` submitted via `proposals.js` (Task 6).
- Produces: on submit, a `settlementPayload` containing `meetup_location` and a derived `trade_method` (`'in_person'` when a place is chosen, `'mail'` in mail mode, else `null`).

- [ ] **Step 1: Import LocationPicker and drop the METHODS constant**

In `frontend/src/components/trade/ProposeTradeDialog.vue`, after the existing import of `AddCard` (line ~9) add:

```js
import LocationPicker from "@/components/trade/LocationPicker.vue";
```

Delete the `METHODS` constant (the block starting `const METHODS = [` through its closing `];`, lines ~54-58).

- [ ] **Step 2: Change the settlement state shape**

Replace this line (~52):

```js
const settlement = ref({ trade_method: null, hasCash: false, cash_amount: null, cash_payer: 'proposer' });
```

with:

```js
// deliveryMode: 'location' (meet at a picked store/event) | 'mail' (ship, no location)
const settlement = ref({ deliveryMode: 'location', meetup_location: null, hasCash: false, cash_amount: null, cash_payer: 'proposer' });
```

- [ ] **Step 3: Update settlement pre-population in the open watcher**

Replace the pre-population block (~99-105):

```js
    const src = props.editProposal ?? props.counterProposal;
    settlement.value = src ? {
      trade_method: src.trade_method ?? null,
      hasCash:      src.cash_amount != null,
      cash_amount:  src.cash_amount ?? null,
      cash_payer:   src.cash_payer  ?? 'proposer',
    } : { trade_method: null, hasCash: false, cash_amount: null, cash_payer: 'proposer' };
```

with:

```js
    const src = props.editProposal ?? props.counterProposal;
    settlement.value = src ? {
      deliveryMode:    src.trade_method === 'mail' ? 'mail' : 'location',
      meetup_location: src.meetup_location ?? null,
      hasCash:         src.cash_amount != null,
      cash_amount:     src.cash_amount ?? null,
      cash_payer:      src.cash_payer  ?? 'proposer',
    } : { deliveryMode: 'location', meetup_location: null, hasCash: false, cash_amount: null, cash_payer: 'proposer' };
```

- [ ] **Step 4: Update the submit payload**

Replace the `settlementPayload` block inside `submit()` (~231-235):

```js
  const settlementPayload = {
    trade_method: settlement.value.trade_method || null,
    cash_amount:  settlement.value.hasCash && settlement.value.cash_amount > 0 ? settlement.value.cash_amount : null,
    cash_payer:   settlement.value.hasCash && settlement.value.cash_amount > 0 ? settlement.value.cash_payer : null,
  };
```

with:

```js
  const isMail = settlement.value.deliveryMode === 'mail';
  const settlementPayload = {
    trade_method:    isMail ? 'mail' : (settlement.value.meetup_location ? 'in_person' : null),
    meetup_location: isMail ? null : (settlement.value.meetup_location ?? null),
    cash_amount:     settlement.value.hasCash && settlement.value.cash_amount > 0 ? settlement.value.cash_amount : null,
    cash_payer:      settlement.value.hasCash && settlement.value.cash_amount > 0 ? settlement.value.cash_payer : null,
  };
```

- [ ] **Step 5: Replace the settlement label + trade-method markup with LocationPicker**

In the template, replace this block (the settlement label + trade-method div, ~745-761):

```html
          <p class="text-[11px] font-bold uppercase tracking-widest" style="color: var(--c-muted)">{{ t('proposeDialog.settlementDetails') }}</p>

            <!-- Trade method -->
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-xs shrink-0" style="color: var(--c-muted)">How:</span>
              <button
                v-for="m in METHODS" :key="m.value"
                class="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer"
                :style="settlement.trade_method === m.value
                  ? { backgroundColor: 'var(--c-trade)', borderColor: 'var(--c-trade)', color: 'white' }
                  : { backgroundColor: 'transparent', borderColor: 'var(--c-border)', color: 'var(--c-muted)' }"
                @click="settlement.trade_method = settlement.trade_method === m.value ? null : m.value"
              >
                <v-icon :icon="m.icon" size="14" />
                {{ m.label }}
              </button>
            </div>
```

with:

```html
          <LocationPicker
            v-model="settlement.meetup_location"
            v-model:deliveryMode="settlement.deliveryMode"
            :counterparty-name="effectiveUser?.name"
          />
```

Leave the `<!-- Cash offset -->` block (the `v-checkbox label="Add cash offset"` and its `v-if="settlement.hasCash"` template) exactly as-is directly below.

- [ ] **Step 6: Verify the SFC parses**

Run: `cd frontend && node -e "require('@vue/compiler-sfc').parse(require('fs').readFileSync('src/components/trade/ProposeTradeDialog.vue','utf8')); console.log('SFC parses')"`
Expected: prints `SFC parses`. (Full interactive verification is in Task 9.)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/trade/ProposeTradeDialog.vue
git commit -m "feat(trade): replace trade-method block with LocationPicker, keep cash offset"
```

---

### Task 6: Thread `meetup_location` through the proposal API

**Files:**
- Modify: `frontend/src/lib/proposals.js`

**Interfaces:**
- Consumes: `settlement.meetup_location` from Task 5.
- Produces: `create/update/counter TradeProposal` pass `p_meetup_location` to the RPCs (Task 1).

- [ ] **Step 1: Add `p_meetup_location` to `createTradeProposal`**

In `frontend/src/lib/proposals.js`, in `createTradeProposal`, update the JSDoc settlement line to `{ trade_method?, cash_amount?, cash_payer?, notes?, meetup_location? }` and add to the rpc params object (after `p_notes`):

```js
    p_notes:        settlement.notes        ?? null,
    p_meetup_location: settlement.meetup_location ?? null,
```

- [ ] **Step 2: Add `p_meetup_location` to `updateTradeProposal`**

In `updateTradeProposal`, update the JSDoc settlement line the same way and add after `p_notes`:

```js
    p_notes:        settlement.notes        ?? null,
    p_meetup_location: settlement.meetup_location ?? null,
```

- [ ] **Step 3: Add `p_meetup_location` to `counterTradeProposal`**

In `counterTradeProposal`, update the JSDoc settlement line to `{ trade_method?, cash_amount?, cash_payer?, meetup_location? }` and add after `p_cash_payer`:

```js
    p_cash_payer:   settlement.cash_payer   ?? null,
    p_meetup_location: settlement.meetup_location ?? null,
```

- [ ] **Step 4: Verify the module parses**

Run: `cd frontend && node --input-type=module -e "import('./src/lib/proposals.js').then(()=>console.log('ok')).catch(e=>{console.error(e);process.exit(1)})" 2>&1 | tail -3`
Note: this import pulls `@/lib/supabaseClient` alias which node cannot resolve, so instead do a syntax-only check: `cd frontend && npx eslint src/lib/proposals.js` if eslint is configured, otherwise `node --check` is not valid for ESM+imports. Simplest reliable check: `cd frontend && node -e "const s=require('fs').readFileSync('src/lib/proposals.js','utf8'); if(!/p_meetup_location/.test(s)) throw new Error('missing param'); console.log('has p_meetup_location x'+ (s.match(/p_meetup_location/g)||[]).length)"`
Expected: prints `has p_meetup_location x3`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/proposals.js
git commit -m "feat(trade): send meetup_location through create/update/counter RPCs"
```

---

### Task 7: i18n keys

**Files:**
- Modify: `frontend/src/locales/en.json`, `frontend/src/locales/fr.json`, `frontend/src/locales/de.json`, `frontend/src/locales/it.json`

**Interfaces:**
- Produces: keys consumed by `LocationPicker.vue` (Task 4) and the chips in Task 8.

- [ ] **Step 1: Add keys to the `proposeDialog` object in each locale**

In each of the four locale files, inside the existing `proposeDialog` object, add these keys (English values in all four for now; translators refine later, and no em dashes):

```json
    "meetupLocation": "Meetup location",
    "meetAtLocation": "Meet at a location",
    "shipByMail": "Ship by mail / remote",
    "nearMe": "Near me",
    "searchPlaces": "Search stores or events...",
    "noPlaces": "No locations match your search.",
    "stores": "Stores",
    "events": "Events",
    "locationDenied": "Location access denied. Search instead.",
    "kmAway": "{km} km away"
```

- [ ] **Step 2: Add a key to the `proposal` object in each locale**

In each of the four locale files, inside the existing `proposal` object, add:

```json
    "meetupAt": "Meet at"
```

- [ ] **Step 3: Verify all four locales still parse as JSON and contain the keys**

Run:

```bash
cd frontend && for f in en fr de it; do node -e "const d=require('./src/locales/$f.json'); const ok=d.proposeDialog.meetupLocation && d.proposeDialog.kmAway && d.proposal.meetupAt; if(!ok) throw new Error('missing keys in $f'); console.log('$f ok')"; done
```

Expected: `en ok`, `fr ok`, `de ok`, `it ok`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/locales/en.json frontend/src/locales/fr.json frontend/src/locales/de.json frontend/src/locales/it.json
git commit -m "i18n(trade): add meetup location keys"
```

---

### Task 8: Render `meetup_location` in the proposal list + detail dialog

**Files:**
- Modify: `frontend/src/components/trade/ProposalRow.vue`
- Modify: `frontend/src/components/trade/TradeDetailDialog.vue`

**Interfaces:**
- Consumes: `proposal.meetup_location` (from `fetch_my_proposals`, Task 1) and i18n `proposal.meetupAt` (Task 7).

- [ ] **Step 1: Show a location chip in ProposalRow, suppress the method chip when a location exists**

In `frontend/src/components/trade/ProposalRow.vue`, update the settlement chips wrapper condition (~274):

```html
      v-if="proposal.trade_method || proposal.cash_amount || proposal.notes"
```

to:

```html
      v-if="proposal.trade_method || proposal.cash_amount || proposal.notes || proposal.meetup_location"
```

Then change the method chip condition (~279) from:

```html
        v-if="proposal.trade_method"
```

to:

```html
        v-if="proposal.trade_method && !proposal.meetup_location"
```

And add a new location chip immediately before the method chip `<span v-if="proposal.trade_method && !proposal.meetup_location" ...>`:

```html
      <span
        v-if="proposal.meetup_location"
        class="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border truncate max-w-xs"
        style="color: var(--c-mutual); border-color: var(--c-mutual); background-color: color-mix(in srgb, var(--c-mutual) 12%, transparent)"
        :title="proposal.meetup_location.address || proposal.meetup_location.name"
      >
        <v-icon icon="mdi-map-marker" size="12" />
        {{ t('proposal.meetupAt') }} {{ proposal.meetup_location.name }}{{ proposal.meetup_location.city ? ', ' + proposal.meetup_location.city : '' }}
      </span>
```

(`t` is already available in ProposalRow.vue via its existing `useI18n()` usage.)

- [ ] **Step 2: Show a meetup panel in TradeDetailDialog**

In `frontend/src/components/trade/TradeDetailDialog.vue`, insert this panel immediately AFTER the give/receive summary `v-for` block closes and BEFORE the declined-reason block (`v-if="proposal.status === 'declined' && proposal.decline_reason"`, ~line 245):

```html
          <!-- Meetup location -->
          <div
            v-if="proposal.meetup_location"
            class="mt-3 flex items-start gap-2 rounded-xl border px-4 py-3"
            style="border-color: var(--c-border); background-color: var(--c-surface-2)"
          >
            <v-icon icon="mdi-map-marker" size="18" color="var(--c-mutual)" class="mt-0.5" />
            <div class="flex flex-col min-w-0">
              <span class="text-sm font-semibold truncate" style="color: var(--c-text)">
                {{ t('proposal.meetupAt') }} {{ proposal.meetup_location.name }}
              </span>
              <span v-if="proposal.meetup_location.address" class="text-xs" style="color: var(--c-muted)">
                {{ proposal.meetup_location.address }}
              </span>
              <span v-if="proposal.meetup_location.event_date" class="text-xs" style="color: var(--c-muted)">
                {{ proposal.meetup_location.event_date }}
              </span>
              <a
                v-if="proposal.meetup_location.url"
                :href="proposal.meetup_location.url" target="_blank" rel="noopener noreferrer"
                class="text-xs no-underline flex items-center gap-1 mt-1" style="color: var(--c-trade)"
              >
                <v-icon icon="mdi-open-in-new" size="11" />{{ proposal.meetup_location.name }}
              </a>
            </div>
          </div>
```

(`t` is already available in TradeDetailDialog.vue via its existing `useI18n()` usage.)

- [ ] **Step 3: Verify both SFCs parse**

Run:

```bash
cd frontend && for f in ProposalRow TradeDetailDialog; do node -e "require('@vue/compiler-sfc').parse(require('fs').readFileSync('src/components/trade/$f.vue','utf8')); console.log('$f parses')"; done
```

Expected: `ProposalRow parses`, `TradeDetailDialog parses`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/trade/ProposalRow.vue frontend/src/components/trade/TradeDetailDialog.vue
git commit -m "feat(trade): render meetup location in proposal row and detail dialog"
```

---

### Task 9: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Run the unit test suite**

Run: `cd frontend && npm run test`
Expected: PASS, including `src/lib/otsLocations.test.js` (5 tests). No new failures.

- [ ] **Step 2: Start the dev server via the preview tool**

Use `preview_start` with the frontend dev server (create/confirm `.claude/launch.json` runs `npm run dev` in `frontend/` on its Vite port). The `predev` hook syncs `public/data/*.json` first.

- [ ] **Step 3: Drive the propose-trade flow**

In the preview browser: sign in, open a matched user's Propose Trade dialog. Verify:
- The old "How: Meet in person / By mail / Other" buttons are gone.
- A "Meetup location" block shows two toggles: "Meet at a location" (default) and "Ship by mail / remote".
- Typing in the search box filters stores/events; "Near me" prompts for geolocation and, if granted, shows a "N km away" label and nearest-first order.
- Selecting a store shows the selected chip with a clear button.
- The "Add cash offset" checkbox and its payer/amount inputs are still present and functional.
- Read console via `read_console_messages` (no errors) and `read_network_requests` to confirm `/data/stores.json` and `/data/events.json` return 200.

- [ ] **Step 4: Submit and confirm persistence**

Send a proposal with a chosen location + a cash offset. Then confirm via the Supabase MCP `execute_sql` (project `sxteuctysfiwripnaozi`):

```sql
select id, trade_method, cash_amount, meetup_location
from public."Trade"
order by id desc
limit 1;
```

Expected: newest row has `trade_method='in_person'`, `cash_amount` set, and `meetup_location` populated with `name`/`address`/`source`.

- [ ] **Step 5: Confirm rendering + mail path**

- In the proposals list, confirm the row shows a "Meet at <name>, <city>" chip (and no separate method chip). Open the trade detail and confirm the meetup panel renders.
- Reopen the dialog, switch to "Ship by mail / remote", send another proposal, and confirm that row has `trade_method='mail'`, `meetup_location IS NULL`.

- [ ] **Step 6: Screenshot proof**

Capture a `computer` screenshot of the new LocationPicker (with a selection + cash offset visible) and share it as proof.

---

## Self-Review

**Spec coverage:**
- "new step for choosing a location using events + stores data" -> Tasks 3 (loader over both), 4 (picker), 5 (wired in). Covered.
- "replace the settlement details section" -> Task 5 Step 5 removes the settlement label + trade-method buttons, replaces with LocationPicker. Covered.
- "Do not remove the add cash offset" -> Task 5 Step 5 explicitly leaves the cash-offset block intact; Steps 2-4 preserve `hasCash`/`cash_amount`/`cash_payer`. Covered.
- Persistence (chosen answer: single jsonb column) -> Task 1. Covered.
- Picker UX (chosen answer: near-me + search fallback) -> Task 3 `getMyPosition`/`distanceKm`/`searchPlaces`, Task 4 UI. Covered.
- Mail/remote (chosen answer: keep a toggle) -> Task 4 mode toggle + Task 5 `trade_method='mail'` mapping. Covered.
- Rendering after the fact -> Task 8 (ProposalRow + TradeDetailDialog). Covered.
- Edit + counter modes carry location -> Task 1 (counter passthrough), Task 5 Step 3 (pre-population), Task 6 (all three API calls). Covered.

**Placeholder scan:** no TBD/TODO; every code step shows full code; verification commands have concrete expected output. Clear.

**Type consistency:** the `Place` shape (`source, ref_id, name, city, state, country, region, address, lat, lng, event_date, url`) is defined in Task 3 and consumed unchanged in Tasks 4 and 8; the `meetup_location` jsonb written by Task 1 matches the `Place` fields the picker emits (`source, ref_id, name, address, city, state, country, lat, lng, event_date, url`). RPC param name `p_meetup_location` is identical across Tasks 1 and 6. `deliveryMode` values `'location'`/`'mail'` are consistent across Tasks 4 and 5. `settlement.meetup_location` is the single source read by Tasks 5 and 6. Consistent.
