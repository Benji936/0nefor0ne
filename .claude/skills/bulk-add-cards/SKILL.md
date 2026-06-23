# Skill: Bulk Add Cards (Paste-a-List)

Reusable patterns for implementing a paste-a-list bulk card-add flow in this Vue 3 + Supabase + YGOPRODeck app.

---

## Building Blocks

| File | Role |
|------|------|
| `frontend/src/components/AddCard.vue` | Canonical `Card` row shape, auth pattern, `wish`/`trade` mode, `extension`/`rarity` handling |
| `frontend/src/components/DeckImport.vue` | Batch `supabase.from('Card').insert(rows).select()`, inserted-count emit pattern |
| `frontend/src/lib/ydk.js` | Line-loop parser prior art (split → trim → skip → accumulate) |
| `frontend/src/api.js` | `searchCardByName`, `searchCardBySetCode`, `searchById`, `getCardsByIds` (100/chunk), `getWithRetry` |

---

## Recommended Approach

### 1. Line parsing

Parse each non-empty, non-comment line for an optional leading quantity and a card identifier (name or set code).

```js
// Returns { qty: number, query: string }
function parseLine(raw) {
  const line = raw.trim()
  if (!line || line.startsWith('#')) return null
  const m = line.match(/^(?:(\d+)[xX]\s*|[xX](\d+)\s*|(\d+)\s+)/)
  const qty = parseInt(m?.[1] ?? m?.[2] ?? m?.[3] ?? '1', 10)
  const query = line.replace(/^(?:\d+[xX]\s*|[xX]\d+\s*|\d+\s+)/, '').trim()
  return query ? { qty, query } : null
}
```

Supported quantity prefixes: `3x Name`, `x3 Name`, `3 Name`. No prefix = qty 1.

### 2. Name vs. set-code heuristic

```js
const SET_CODE_RE = /^[A-Z0-9]+-\w+$/i
const isSetCode = (q) => SET_CODE_RE.test(q)
```

- **Set code** → `searchCardBySetCode(query)` → if result has `id` → `searchById(id)`
- **Name** → `searchCardByName(query)` → returns `res.data.data[]` or `res.data[]`

### 3. Resolution states

Each line resolves to one of three states:

| State | Condition | UI treatment |
|-------|-----------|--------------|
| `matched` | Exactly 1 result | Show card preview, qty, include in batch |
| `ambiguous` | > 1 results | Show picker; user selects one before insert |
| `unmatched` | Empty result / error | Flag with warning; skip from insert |

For name searches, check for exact match first:
```js
const exact = results.find(c => c.name.toLowerCase() === query.toLowerCase())
if (exact) return { state: 'matched', card: exact }
if (results.length === 1) return { state: 'matched', card: results[0] }
if (results.length > 1) return { state: 'ambiguous', candidates: results }
return { state: 'unmatched' }
```

### 4. Rate limiting

YGOPRODeck enforces a burst limit (~20 req/s). Resolve lines **sequentially** or in small controlled batches using the existing `getWithRetry` pattern from `api.js`. Do not fire all name lookups in parallel.

For large pastes (100+ lines) consider a progress indicator during the resolve phase.

### 5. Batch insert with quick defaults

Use the exact row shape from `AddCard.vue`, with safe defaults for fields the user has not specified:

```js
const buildRow = ({ card, qty, isWish, userId }) => {
  const canonicalName = card.name_en ?? card.name
  return {
    wish:          isWish,
    game:          'YGO',
    url:           `https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${canonicalName}`,
    name:          canonicalName,
    extension:     '',          // NOT NULL — blank = no specific printing
    rarity:        'common',    // NOT NULL — matches DB default intent
    quantity:      qty,
    trader:        userId,
    image_id:      card.id,
    language:      'English',
    condition:     'Near Mint',
    first_edition: false,
  }
}
```

Insert all confirmed rows in a single Supabase call:

```js
const { data: inserted, error } = await supabase
  .from('Card')
  .insert(rows)
  .select()
if (error) throw error
emit('added', inserted?.length ?? rows.length)
```

For very large batches (> 500 rows) consider chunking at 500 to stay within PostgREST limits.

### 6. Trade / Wishlist toggle

Mirror the `mode` prop pattern from `AddCard.vue`: a `wish` boolean prop/reactive value (default `false` = Trade). Pass it directly into the `wish` field of each row.

---

## Common Pitfalls

### `extension` and `rarity` NOT NULL

The `Card` table has `extension NOT NULL` (no default) and `rarity NOT NULL` (default `'common'`, but PostgREST sends explicit nulls from JS). Always send:
- `extension: ''` — empty string, not `null`
- `rarity: 'common'` — explicit value, not `null`

`DeckImport.vue`'s `addMissingToWishlist` currently sends `null` for both — this is a latent bug. Do not copy that pattern.

### `searchCardByName` is fuzzy (`fname` param)

The `fname` param matches card names containing the query string. A short query like `"Ash"` returns dozens of cards. Always check for an exact name match before declaring a result unambiguous.

### `searchCardBySetCode` normalizes to `-EN`

`api.js` rewrites the set code to the `-EN` variant (e.g. `LOB-005` → `LOB-EN005`). This only works for the standard `PREFIX-NNN` format. Validate the input before passing it to avoid malformed API calls.

### Auth check before resolution

Check `supabase.auth.getUser()` before the user enters the review step — not just before insert — so the paste is not lost if the session has expired.

### Duplicate handling

The bulk flow deliberately allows duplicates (same behavior as `AddCard.vue`: users can add a card they already own). Optionally surface a warning count after insert, but do not block the insert.

### Large paste chunking

Parsing 200 lines into 200 sequential API calls takes ~10–20 s. Show a progress bar during resolve. Consider debouncing or batching identical queries (same card name appearing multiple times).

---

## i18n

All new strings go into all four locale files:
- `frontend/src/locales/en.json`
- `frontend/src/locales/fr.json`
- `frontend/src/locales/de.json`
- `frontend/src/locales/it.json`

Recommended key namespace: `bulkAdd.*`
