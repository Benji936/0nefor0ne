# Task: YDK deck import → "cards you're missing" → trade

## Context
This is a Yu-Gi-Oh trading-card marketplace (Vue 3 + Vuetify 3 + Tailwind 4 +
vue-router + vue-i18n + Supabase, built with vite-ssg). Users keep a Library of
cards they **have** (`trade_cards`) and cards they **want** (`wished_cards`).
A Postgres RPC `find_matches` pairs users who can trade. Card data is NOT stored
locally — it is fetched live from the YGOPRODeck API via `src/api.js`.

Key fact you can rely on: **`card.id` is the Konami passcode** — the same 8-digit
number that appears in YDK deck files. Confirmed by `src/lib/cardImage.js`
(`cards/{id}.jpg`) and `src/api.js` (`cardinfo.php?id={id}`). So a YDK file
resolves directly through the existing card lookups; no local card DB is involved.

## Goal
Let a user import a `.ydk` deck file, see at a glance which cards in that deck they
already own vs. are missing, and push the missing cards into their existing wishlist
so the current matching/trade flow surfaces traders who have them.

The strategic point: a deck the user just imported is an emotionally-invested
want-list. Turning its gaps into trades is the entire value. Build only what serves
that. Do not build a deck *builder*.

## YDK format (parse this exactly)
Plain text, one passcode per line, organized by section markers:
```
#created by ...        <- comment, ignore any line starting with #... except section markers
#main                  <- begin Main Deck
89631139               <- card passcode
89631139               <- duplicates are real (a deck can run 3 copies); preserve counts
#extra                 <- begin Extra Deck
!side                  <- begin Side Deck (note: '!' not '#')
```
Rules:
- Lines that are exactly `#main`, `#extra`, `!side` are section headers.
- Other `#...` lines are comments — skip.
- Every remaining non-empty line is an integer passcode. Trim whitespace; ignore
  blank lines and non-numeric junk gracefully (malformed file must not crash).
- Preserve quantity (a passcode repeated 3× = need 3 copies). Track section per card.

## Implementation requirements
1. **Parser**: add a pure function (e.g. `src/lib/ydk.js`) `parseYdk(text)` returning
   `{ main: [{id, qty}], extra: [...], side: [...] }`. Unit-test the parser against a
   sample file with comments, duplicates, all three sections, and trailing garbage.
2. **Resolve cards**: resolve all unique passcodes to card data. YGOPRODeck supports
   comma-separated IDs (`cardinfo.php?id=1,2,3`) — add a batched fetch to `src/api.js`
   rather than N sequential calls. Handle ids the API can't resolve (alt-art/fake
   passcodes) by showing them as "unrecognized" instead of failing the whole import.
3. **Ownership overlay**: cross-reference resolved cards against the user's
   `trade_cards` (owned). Render owned cards normally and missing cards greyed-out
   with a clear "missing" badge. Reuse `cardImage(id)` and the existing card visual
   style (see `CardElement.vue` / `CardYugi.vue`) — do not invent a new card style.
4. **Action**: a primary button "Add missing to wishlist" that adds the missing cards
   to `wished_cards` via the **same path `AddCard.vue` uses in `mode="wish"`** — do not
   write a parallel insert. After adding, the existing `find_matches` flow should
   already surface traders. Confirm this end-to-end.
5. **UI entry point**: add an "Import deck (.ydk)" affordance on the Library page
   (`src/components/Pages/Library.vue`). Drag-and-drop a file OR file picker. Show a
   summary: total cards, owned, missing, unrecognized.
6. **i18n**: all user-facing strings go through vue-i18n (`$t`), with keys added to the
   existing locale files for en/fr/de/it (English real, others can mirror English with
   a TODO if you don't translate — but the keys must exist so nothing renders raw).
7. **Auth/RLS**: importing/overlay works for any visitor; "add to wishlist" requires
   auth — reuse the existing auth gate pattern (`requireAuth` emit / `AuthDialog`).

## Explicit non-goals (do not build)
- No deck builder / drag-to-build / 40-card validation engine.
- No banlist enforcement, no playtesting, no hand simulator, no combo display.
- No YDK *export* (possible v2 — leave a clean seam, don't implement).
- No new card database or schema migration — cards stay sourced from the API.

## Before you start
- Read `src/api.js`, `src/lib/cardImage.js`, `src/components/AddCard.vue`,
  `src/components/Pages/Library.vue`, `src/lib/matches.js`, and `src/lib/supabaseClient.js`
  to match existing patterns (data fetching, the wish-add path, RPC usage, styling).
- If the wishlist insert path or the `trade_cards` shape is unclear, inspect the real
  Supabase calls in those files rather than assuming column names.

## Done when
- A sample `.ydk` imports, the overlay correctly marks owned vs missing vs unrecognized,
  "Add missing to wishlist" inserts them and they appear in the user's wishlist, and the
  existing matches flow then lists traders who have those cards.
- Parser has passing unit tests. Malformed files degrade gracefully. No raw i18n keys.
- `npm run build` succeeds (the app uses vite-ssg).

## If blocked
Ask before guessing on: the exact wishlist insert signature, the `trade_cards` row
shape, or whether YGOPRODeck batch-by-id returns the same object shape as single-id.
