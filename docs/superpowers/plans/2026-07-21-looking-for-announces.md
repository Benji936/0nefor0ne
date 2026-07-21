# Looking For Announces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second announce kind, "Looking For" (LF), where a user states an archetype plus a free-text qualifier ("Darklord deck base") instead of selling a specific card, posted either from the website or from Discord with an `LF` prefix.

**Architecture:** Extend the existing `announce` table with three nullable columns (`kind`, `archetype`, `want_detail`) rather than creating a parallel table, so every existing read path, RLS policy, image relation, chat panel and Discord thread hook keeps working untouched. `kind` defaults to `'sell'`, making the migration a no-op for existing rows. Price becomes nullable so an LF post can omit a budget. Both the website form and the Discord bot funnel into the same columns; the bot detects the `LF` prefix and resolves the archetype by matching message text against YGOPRODeck's canonical archetype list.

**Tech Stack:** Postgres/Supabase (SQL migrations + RLS), Vue 3 `<script setup>`, Vuetify, vue-i18n (en/fr/de/it), Vitest, discord.js v13 (CommonJS, Node >= 20).

## Global Constraints

- **No em dashes in user-facing UI copy.** Applies to every locale string added in this plan.
- **Tailwind spacing:** never use `p-N`/`m-N` (all-sides) or any `.5` step (`py-2.5`, `mt-0.5`). Vuetify's unlayered reset zeroes them. Use `px-N py-N` at integer steps, or an arbitrary value like `py-[10px]`.
- **Do not commit `discord-bot/.env`** — it holds real secrets.
- **Do not run `npm run cards:sync`.**
- All four locale files must be updated together: `frontend/src/locales/{en,fr,de,it}.json`.
- Frontend tests run with `npm test` from `frontend/` (Vitest, node environment, no `test:` block in `vite.config.js` — defaults apply). Test files are colocated as `src/lib/*.test.js`.
- Commit after each task. Do **not** push unless explicitly asked.

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `supabase/migrations/20260721_announce_looking_for.sql` | Adds `kind`, `archetype`, `want_detail`; makes `price` nullable | Create |
| `frontend/src/lib/announceKind.js` | Pure helpers: kind constants, LF prefix detection, archetype matching, headline composition | Create |
| `frontend/src/lib/announceKind.test.js` | Unit tests for the above | Create |
| `frontend/src/lib/announces.js` | `createAnnounce` -> options object; carry new fields through create/update | Modify |
| `frontend/src/components/trade/CreateAnnounceDialog.vue` | Kind toggle, archetype autocomplete, want-detail input, conditional price/photos | Modify |
| `frontend/src/components/trade/AnnounceCard.vue` | LF badge, budget-or-nothing price pill, archetype line | Modify |
| `frontend/src/components/trade/AnnounceDetailDialog.vue` | LF badge + archetype/detail display | Modify |
| `frontend/src/components/Pages/App/trade-center/AnnouncesTab.vue` | Split list by kind; accept a `kind` filter prop | Modify |
| `frontend/src/components/Pages/App/TradeCenter.vue` | New `lookingfor` tab | Modify |
| `frontend/src/locales/{en,fr,de,it}.json` | New copy | Modify |
| `discord-bot/lib/parseAnnounce.js` | Extracted + extended pure parser (LF prefix, archetype match) | Create |
| `discord-bot/lib/parseAnnounce.test.js` | Node built-in test runner tests | Create |
| `discord-bot/index.js` | Use the extracted parser; relax image rule for LF; insert new columns | Modify |

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260721_announce_looking_for.sql`

**Interfaces:**
- Consumes: existing `public.announce` table from `supabase/migrations/20260629_announces.sql`.
- Produces: columns `announce.kind` (`text NOT NULL DEFAULT 'sell'`, one of `'sell'`/`'looking_for'`), `announce.archetype` (`text NULL`), `announce.want_detail` (`text NULL`), and `announce.price` becomes `NULL`-able. Every later task depends on exactly these names.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260721_announce_looking_for.sql`:

```sql
-- "Looking For" announces: a buyer states an archetype plus a free-text
-- qualifier ("Darklord deck base") instead of selling a specific card.
--
-- Modelled as extra columns on `announce` rather than a second table so that
-- images, chat, RLS, Discord threads and every existing read path keep working
-- unchanged. kind defaults to 'sell', so all existing rows stay valid.

ALTER TABLE public.announce
  ADD COLUMN IF NOT EXISTS kind        text NOT NULL DEFAULT 'sell',
  ADD COLUMN IF NOT EXISTS archetype   text NULL,
  ADD COLUMN IF NOT EXISTS want_detail text NULL;

-- Separate from the ADD above: adding a CHECK inline with IF NOT EXISTS is not
-- supported, and we want the constraint to be re-runnable.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'announce_kind_check'
  ) THEN
    ALTER TABLE public.announce
      ADD CONSTRAINT announce_kind_check
      CHECK (kind IN ('sell', 'looking_for'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'announce_want_detail_len'
  ) THEN
    ALTER TABLE public.announce
      ADD CONSTRAINT announce_want_detail_len
      CHECK (want_detail IS NULL OR char_length(want_detail) <= 120);
  END IF;
END $$;

-- A Looking For post may have no budget at all, so price must be nullable.
-- The existing price >= 0 CHECK stays and is satisfied by NULL (SQL CHECK
-- passes on NULL), so it does not need to be dropped.
ALTER TABLE public.announce
  ALTER COLUMN price DROP NOT NULL;

-- "Who else is looking for Darklord?" — the only new query shape we introduce.
CREATE INDEX IF NOT EXISTS idx_announce_kind_archetype
  ON public.announce (kind, archetype)
  WHERE kind = 'looking_for';
```

- [ ] **Step 2: Apply the migration**

Apply it through whatever path this project already uses for the other files in `supabase/migrations/` (Supabase CLI `supabase db push`, or pasting into the SQL editor). Ask the user which, if it is not obvious from the repo.

Expected: no error. `kind`, `archetype`, `want_detail` exist; `price` is nullable.

- [ ] **Step 3: Verify the schema changed**

Run this in the Supabase SQL editor:

```sql
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'announce'
  AND column_name IN ('kind', 'archetype', 'want_detail', 'price')
ORDER BY column_name;
```

Expected: four rows. `kind` -> `is_nullable = NO`, `column_default = 'sell'::text`. `archetype`, `want_detail`, `price` -> `is_nullable = YES`.

- [ ] **Step 4: Verify existing rows are untouched**

```sql
SELECT count(*) AS total, count(*) FILTER (WHERE kind = 'sell') AS sell
FROM public.announce;
```

Expected: `total = sell` (every pre-existing announce backfilled to `'sell'`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260721_announce_looking_for.sql
git commit -m "feat(db): add looking-for announce columns"
```

---

### Task 2: Shared kind/archetype helpers (frontend)

**Files:**
- Create: `frontend/src/lib/announceKind.js`
- Test: `frontend/src/lib/announceKind.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ANNOUNCE_KIND = { SELL: 'sell', LOOKING_FOR: 'looking_for' }`
  - `isLookingFor(announce): boolean`
  - `stripKindPrefix(text): string`
  - `detectKindFromText(text): 'sell' | 'looking_for'`
  - `matchArchetype(text, archetypes): string | null`
  - `composeWantHeadline(archetype, wantDetail): string`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/announceKind.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  ANNOUNCE_KIND,
  isLookingFor,
  stripKindPrefix,
  detectKindFromText,
  matchArchetype,
  composeWantHeadline,
} from './announceKind'

const ARCHETYPES = ['Darklord', 'Blue-Eyes', 'HERO', 'Sky Striker', 'Dark Magician']

describe('detectKindFromText', () => {
  it('treats an LF prefix as looking_for, in any case and with any separator', () => {
    expect(detectKindFromText('LF: Darklord deck base')).toBe(ANNOUNCE_KIND.LOOKING_FOR)
    expect(detectKindFromText('lf Darklord')).toBe(ANNOUNCE_KIND.LOOKING_FOR)
    expect(detectKindFromText('LF - Darklord')).toBe(ANNOUNCE_KIND.LOOKING_FOR)
    expect(detectKindFromText('  LF:Darklord')).toBe(ANNOUNCE_KIND.LOOKING_FOR)
  })

  it('does not match LF inside a word', () => {
    expect(detectKindFromText('LFP playmat for sale')).toBe(ANNOUNCE_KIND.SELL)
    expect(detectKindFromText('Golfer deck')).toBe(ANNOUNCE_KIND.SELL)
  })

  it('falls back to sell for WTS and for unprefixed text', () => {
    expect(detectKindFromText('WTS: Blue-Eyes')).toBe(ANNOUNCE_KIND.SELL)
    expect(detectKindFromText('Blue-Eyes PSA 9')).toBe(ANNOUNCE_KIND.SELL)
    expect(detectKindFromText('')).toBe(ANNOUNCE_KIND.SELL)
  })
})

describe('stripKindPrefix', () => {
  it('removes LF and the existing WTS/WTT/WTB prefixes', () => {
    expect(stripKindPrefix('LF: Darklord deck base')).toBe('Darklord deck base')
    expect(stripKindPrefix('lf - Darklord')).toBe('Darklord')
    expect(stripKindPrefix('WTS: Blue-Eyes')).toBe('Blue-Eyes')
    expect(stripKindPrefix('WTB Dark Magician')).toBe('Dark Magician')
  })

  it('leaves unprefixed text alone', () => {
    expect(stripKindPrefix('Darklord deck base')).toBe('Darklord deck base')
  })
})

describe('matchArchetype', () => {
  it('finds an archetype anywhere in the text, case-insensitively', () => {
    expect(matchArchetype('Darklord deck base', ARCHETYPES)).toBe('Darklord')
    expect(matchArchetype('looking for darklord stuff', ARCHETYPES)).toBe('Darklord')
    expect(matchArchetype('need a SKY STRIKER core', ARCHETYPES)).toBe('Sky Striker')
  })

  it('prefers the longest match so multi-word archetypes win', () => {
    expect(matchArchetype('Dark Magician playset', ARCHETYPES)).toBe('Dark Magician')
  })

  it('respects word boundaries', () => {
    expect(matchArchetype('Darklords', ARCHETYPES)).toBe('Darklord')
    expect(matchArchetype('superhero cape', ARCHETYPES)).toBe(null)
  })

  it('returns null for no match or bad input', () => {
    expect(matchArchetype('random junk', ARCHETYPES)).toBe(null)
    expect(matchArchetype('', ARCHETYPES)).toBe(null)
    expect(matchArchetype('Darklord', [])).toBe(null)
    expect(matchArchetype('Darklord', null)).toBe(null)
  })
})

describe('composeWantHeadline', () => {
  it('joins archetype and detail', () => {
    expect(composeWantHeadline('Darklord', 'deck base')).toBe('Darklord deck base')
  })

  it('handles either side missing', () => {
    expect(composeWantHeadline('Darklord', '')).toBe('Darklord')
    expect(composeWantHeadline('', 'deck base')).toBe('deck base')
    expect(composeWantHeadline('', '')).toBe('')
    expect(composeWantHeadline(null, null)).toBe('')
  })

  it('trims and collapses whitespace', () => {
    expect(composeWantHeadline('  Darklord ', '  deck  base ')).toBe('Darklord deck base')
  })
})

describe('isLookingFor', () => {
  it('reads the kind column and defaults to false', () => {
    expect(isLookingFor({ kind: 'looking_for' })).toBe(true)
    expect(isLookingFor({ kind: 'sell' })).toBe(false)
    expect(isLookingFor({})).toBe(false)
    expect(isLookingFor(null)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && npx vitest run src/lib/announceKind.test.js
```

Expected: FAIL — `Failed to resolve import "./announceKind"`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/announceKind.js`:

```js
/**
 * Helpers shared by the announce UI for the two announce kinds.
 *
 * `sell`        — the original listing: a specific card, with a price.
 * `looking_for` — a buyer stating an archetype plus a qualifier
 *                 ("Darklord deck base"), with an optional budget.
 *
 * Everything here is pure so it can be unit tested without a DOM or network.
 * The Discord bot has its own copy of the prefix/archetype logic in
 * discord-bot/lib/parseAnnounce.js — the two packages ship separately and
 * share no build, so the duplication is deliberate. Keep them in sync.
 */

export const ANNOUNCE_KIND = {
  SELL: 'sell',
  LOOKING_FOR: 'looking_for',
};

// "LF", "LF:", "LF -" at the very start, but not "LFP" or "Golfer".
const LF_PREFIX_RE = /^\s*LF\b\s*[:\-–]?\s*/i;

// The prefixes the bot has always stripped, plus LF.
const ANY_PREFIX_RE = /^\s*(LF|WTS|WTT|WTB)\b\s*[:\-–]?\s*/i;

/** True when this announce row is a Looking For post. */
export function isLookingFor(announce) {
  return announce?.kind === ANNOUNCE_KIND.LOOKING_FOR;
}

/** Remove a leading LF/WTS/WTT/WTB marker from a headline. */
export function stripKindPrefix(text) {
  return String(text ?? '').replace(ANY_PREFIX_RE, '').trim();
}

/** Which kind a raw message/title represents, based on its prefix. */
export function detectKindFromText(text) {
  return LF_PREFIX_RE.test(String(text ?? ''))
    ? ANNOUNCE_KIND.LOOKING_FOR
    : ANNOUNCE_KIND.SELL;
}

/** Escape a string for literal use inside a RegExp. */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find the first archetype from `archetypes` that appears in `text`.
 * Longest-first so "Dark Magician" beats a bare "Dark" style entry, and
 * word-bounded at the start so "superhero" does not match "HERO".
 * @param {string} text
 * @param {string[]} archetypes  canonical names, e.g. from api.js getArchetypes()
 * @returns {string|null}
 */
export function matchArchetype(text, archetypes) {
  const haystack = String(text ?? '').trim();
  if (!haystack || !Array.isArray(archetypes) || archetypes.length === 0) return null;

  const sorted = [...archetypes].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    // Leading \b keeps "superhero" from matching "HERO"; we deliberately do
    // not anchor the end, so a plural like "Darklords" still matches.
    const re = new RegExp(`\\b${escapeRe(name)}`, 'i');
    if (re.test(haystack)) return name;
  }
  return null;
}

/** Human headline for an LF post: "Darklord deck base". */
export function composeWantHeadline(archetype, wantDetail) {
  return [archetype, wantDetail]
    .map(part => String(part ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ');
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && npx vitest run src/lib/announceKind.test.js
```

Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/announceKind.js frontend/src/lib/announceKind.test.js
git commit -m "feat(announces): add kind and archetype helpers"
```

---

### Task 3: Carry the new fields through the data layer

**Files:**
- Modify: `frontend/src/lib/announces.js:87-137` (`createAnnounce`)
- Modify: `frontend/src/components/trade/CreateAnnounceDialog.vue:165-172` (the only caller)

**Interfaces:**
- Consumes: `ANNOUNCE_KIND` from Task 2; the columns from Task 1.
- Produces: `createAnnounce(opts) -> Promise<number>` where `opts` is
  `{ title, description, price, currency, imageFiles, card, kind, archetype, wantDetail }`.
  `price` may be `null`. `kind` defaults to `'sell'`. This replaces the old
  positional signature entirely.

- [ ] **Step 1: Rewrite `createAnnounce` to take an options object**

In `frontend/src/lib/announces.js`, replace the whole `createAnnounce` function (currently lines 77-137, including its JSDoc block) with:

```js
/**
 * Create a new announce and upload its images.
 *
 * Takes an options object rather than positional args: with kind/archetype/
 * wantDetail added there would be nine positional parameters, most of them
 * optional, which is impossible to call safely.
 *
 * @param {object}   opts
 * @param {string}   opts.title
 * @param {string}   [opts.description='']
 * @param {number|null} [opts.price=null]     null on a Looking For post with no budget
 * @param {string}   [opts.currency='EUR']
 * @param {File[]}   [opts.imageFiles=[]]
 * @param {{ ygo_card_id: number, card_name: string, extension: string, rarity: string }|null} [opts.card=null]
 * @param {'sell'|'looking_for'} [opts.kind='sell']
 * @param {string|null} [opts.archetype=null]
 * @param {string|null} [opts.wantDetail=null]
 * @returns {Promise<number>} the new announce id
 */
export async function createAnnounce({
  title,
  description = '',
  price = null,
  currency = 'EUR',
  imageFiles = [],
  card = null,
  kind = 'sell',
  archetype = null,
  wantDetail = null,
} = {}) {
  const me = (await getClient().auth.getSession()).data?.session?.user?.id;
  if (!me) throw new Error("Not authenticated");

  // 1. Insert announce record
  const { data: announceData, error: announceError } = await getClient()
    .from("announce")
    .insert({
      seller: me,
      title,
      description,
      price,
      currency,
      status: 'active',
      kind,
      archetype:   archetype  || null,
      want_detail: wantDetail || null,
      ygo_card_id: card?.ygo_card_id ?? null,
      card_name:   card?.card_name   ?? null,
    })
    .select('id')
    .single();

  if (announceError) throw announceError;
  const announceId = announceData.id;

  // 1b. If a card was specified, add it to the seller's trade list.
  //     Only for sell posts: a Looking For card belongs on the wish list, and
  //     announcing a want should never silently list it as tradeable.
  if (card?.ygo_card_id && kind === 'sell') {
    await getClient()
      .from('Card')
      .insert({
        trader:    me,
        name:      card.card_name,
        image_id:  card.ygo_card_id,
        extension: card.extension ?? '',
        rarity:    card.rarity    ?? 'common',
        wish:      false,
        status:    'active',
        quantity:  1,
        game:      'YGO',
      });
    // We intentionally ignore errors here — failing to add to trade list
    // should never block the announce from being created.
  }

  // 2. Upload images and create records
  if (imageFiles && imageFiles.length > 0) {
    await Promise.all(imageFiles.map((file, index) =>
      uploadAnnounceImage(announceId, me, file, index)
    ));
  }

  return announceId;
}
```

- [ ] **Step 2: Update the single caller**

In `frontend/src/components/trade/CreateAnnounceDialog.vue`, replace the `createAnnounce(...)` call (currently lines 165-172) with the object form. Task 4 adds `kind`/`archetype`/`wantDetail` refs; for now pass the existing values only:

```js
      const id = await createAnnounce({
        title:       title.value.trim(),
        description: description.value.trim(),
        price:       price.value === '' ? null : Number(price.value),
        currency:    currency.value,
        imageFiles:  newImages.value.map(i => i.file),
        card:        selectedCard.value,  // null if no card picked
      });
      emit("created", id);
```

- [ ] **Step 3: Verify nothing else calls the old signature**

```bash
cd frontend && grep -rn "createAnnounce(" src/
```

Expected: exactly two hits — the definition in `src/lib/announces.js` and the single call in `CreateAnnounceDialog.vue`, both in object form. If a third appears, convert it too.

- [ ] **Step 4: Verify the existing suite still passes**

```bash
cd frontend && npm test
```

Expected: PASS (no existing test touches `createAnnounce`; this confirms nothing regressed).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/announces.js frontend/src/components/trade/CreateAnnounceDialog.vue
git commit -m "refactor(announces): take an options object in createAnnounce"
```

---

### Task 4: Create-announce form supports the Looking For kind

**Files:**
- Modify: `frontend/src/components/trade/CreateAnnounceDialog.vue`
- Modify: `frontend/src/locales/en.json`, `fr.json`, `de.json`, `it.json`

**Interfaces:**
- Consumes: `ANNOUNCE_KIND`, `composeWantHeadline` (Task 2); `createAnnounce`, `updateAnnounce` (Task 3); `getArchetypes` from `@/api`.
- Produces: a dialog that writes `kind`, `archetype`, `want_detail`, and a nullable `price`.

- [ ] **Step 1: Add the locale strings**

Add to the `"announce"` object in `frontend/src/locales/en.json`:

```json
    "kindSell": "Selling",
    "kindLookingFor": "Looking for",
    "kindHint": "Selling a card, or looking for one?",
    "archetype": "Archetype",
    "archetypePlaceholder": "Search an archetype, e.g. Darklord",
    "archetypeNoMatch": "No archetype matches that.",
    "archetypeLoadFailed": "Could not load the archetype list. You can still describe what you want.",
    "wantDetail": "What exactly?",
    "wantDetailPlaceholder": "e.g. deck base, playset, just the boss monster",
    "budget": "Budget",
    "budgetOptional": "Budget (optional)",
    "budgetHint": "Leave empty if you would rather discuss it.",
    "photosOptionalLf": "Photos (optional)",
    "createLookingFor": "Post Looking For",
    "lfBadge": "LF"
```

Add the same keys to `fr.json`:

```json
    "kindSell": "Je vends",
    "kindLookingFor": "Je recherche",
    "kindHint": "Vous vendez une carte, ou vous en cherchez une ?",
    "archetype": "Archétype",
    "archetypePlaceholder": "Rechercher un archétype, ex. Darklord",
    "archetypeNoMatch": "Aucun archétype ne correspond.",
    "archetypeLoadFailed": "Impossible de charger la liste des archétypes. Vous pouvez quand même décrire votre recherche.",
    "wantDetail": "Quoi exactement ?",
    "wantDetailPlaceholder": "ex. base de deck, playset, juste le boss",
    "budget": "Budget",
    "budgetOptional": "Budget (facultatif)",
    "budgetHint": "Laissez vide si vous préférez en discuter.",
    "photosOptionalLf": "Photos (facultatif)",
    "createLookingFor": "Publier ma recherche",
    "lfBadge": "LF"
```

`de.json`:

```json
    "kindSell": "Verkaufen",
    "kindLookingFor": "Gesucht",
    "kindHint": "Verkaufst du eine Karte oder suchst du eine?",
    "archetype": "Archetyp",
    "archetypePlaceholder": "Archetyp suchen, z. B. Darklord",
    "archetypeNoMatch": "Kein passender Archetyp.",
    "archetypeLoadFailed": "Die Archetypliste konnte nicht geladen werden. Du kannst deine Suche trotzdem beschreiben.",
    "wantDetail": "Was genau?",
    "wantDetailPlaceholder": "z. B. Deck-Basis, Playset, nur der Boss",
    "budget": "Budget",
    "budgetOptional": "Budget (optional)",
    "budgetHint": "Leer lassen, wenn du lieber darüber sprechen möchtest.",
    "photosOptionalLf": "Fotos (optional)",
    "createLookingFor": "Gesuch aufgeben",
    "lfBadge": "LF"
```

`it.json`:

```json
    "kindSell": "Vendo",
    "kindLookingFor": "Cerco",
    "kindHint": "Stai vendendo una carta o ne stai cercando una?",
    "archetype": "Archetipo",
    "archetypePlaceholder": "Cerca un archetipo, es. Darklord",
    "archetypeNoMatch": "Nessun archetipo corrisponde.",
    "archetypeLoadFailed": "Impossibile caricare la lista degli archetipi. Puoi comunque descrivere cosa cerchi.",
    "wantDetail": "Cosa esattamente?",
    "wantDetailPlaceholder": "es. base del deck, playset, solo il boss",
    "budget": "Budget",
    "budgetOptional": "Budget (facoltativo)",
    "budgetHint": "Lascia vuoto se preferisci parlarne.",
    "photosOptionalLf": "Foto (facoltativo)",
    "createLookingFor": "Pubblica la ricerca",
    "lfBadge": "LF"
```

- [ ] **Step 2: Add the state and imports**

In `CreateAnnounceDialog.vue`, add to the imports at the top of `<script setup>`:

```js
import { ANNOUNCE_KIND, composeWantHeadline } from "@/lib/announceKind";
import { getArchetypes } from "@/api";
```

Then, next to the other refs (after `const currency = ref("EUR");`, line 20), add:

```js
const kind           = ref(ANNOUNCE_KIND.SELL);
const archetype      = ref("");
const wantDetail     = ref("");
const archetypeList  = ref([]);      // canonical names from YGOPRODeck
const archetypeQuery = ref("");      // what the user is typing
const archetypeErr   = ref("");      // shown when the list cannot be fetched

const isLf = computed(() => kind.value === ANNOUNCE_KIND.LOOKING_FOR);

// Top 8 case-insensitive substring matches, so the dropdown stays short.
const archetypeMatches = computed(() => {
  const q = archetypeQuery.value.trim().toLowerCase();
  if (!q) return [];
  return archetypeList.value
    .filter(a => a.toLowerCase().includes(q))
    .slice(0, 8);
});

/** Fetch the archetype list once, the first time the user switches to LF. */
async function ensureArchetypes() {
  if (archetypeList.value.length > 0) return;
  archetypeErr.value = "";
  const list = await getArchetypes();   // never throws; [] on failure
  if (list.length === 0) {
    archetypeErr.value = t("announce.archetypeLoadFailed");
    return;
  }
  archetypeList.value = list;
}

function setKind(next) {
  kind.value = next;
  if (next === ANNOUNCE_KIND.LOOKING_FOR) ensureArchetypes();
}

function pickArchetype(name) {
  archetype.value = name;
  archetypeQuery.value = name;
}
```

- [ ] **Step 3: Relax `canSubmit` for LF posts**

Replace the `canSubmit` computed (currently lines 97-102) with:

```js
const canSubmit = computed(() => {
  if (submitting.value) return false;
  if (isLf.value) {
    // An LF post needs something to look for; price and photos are optional.
    return composeWantHeadline(archetype.value, wantDetail.value).length > 0;
  }
  return title.value.trim().length > 0 &&
         title.value.trim().length <= 120 &&
         price.value !== "" &&
         Number(price.value) >= 0;
});
```

- [ ] **Step 4: Reset and hydrate the new fields**

In the `watch(() => props.modelValue, ...)` block, add to the "reset for a new announce" branch (the `else` at line 117):

```js
    title.value = ""; description.value = ""; price.value = ""; currency.value = "EUR";
    kind.value = ANNOUNCE_KIND.SELL;
    archetype.value = ""; wantDetail.value = ""; archetypeQuery.value = "";
```

And in the edit branch (after `currency.value = props.announce.currency ?? "EUR";`, line 114):

```js
    kind.value           = props.announce.kind        ?? ANNOUNCE_KIND.SELL;
    archetype.value      = props.announce.archetype   ?? "";
    wantDetail.value     = props.announce.want_detail ?? "";
    archetypeQuery.value = archetype.value;
    if (kind.value === ANNOUNCE_KIND.LOOKING_FOR) ensureArchetypes();
```

- [ ] **Step 5: Send the new fields on submit**

In `submit()`, replace the `updateAnnounce` call body with:

```js
      await updateAnnounce(id, {
        title:       isLf.value
                       ? composeWantHeadline(archetype.value, wantDetail.value)
                       : title.value.trim(),
        description: description.value.trim(),
        price:       price.value === "" ? null : Number(price.value),
        currency:    currency.value,
        kind:        kind.value,
        archetype:   isLf.value ? (archetype.value.trim()  || null) : null,
        want_detail: isLf.value ? (wantDetail.value.trim() || null) : null,
      });
```

and the `createAnnounce` call with:

```js
      const id = await createAnnounce({
        title:       isLf.value
                       ? composeWantHeadline(archetype.value, wantDetail.value)
                       : title.value.trim(),
        description: description.value.trim(),
        price:       price.value === "" ? null : Number(price.value),
        currency:    currency.value,
        imageFiles:  newImages.value.map(i => i.file),
        card:        selectedCard.value,
        kind:        kind.value,
        archetype:   isLf.value ? (archetype.value.trim()  || null) : null,
        wantDetail:  isLf.value ? (wantDetail.value.trim() || null) : null,
      });
      emit("created", id);
```

- [ ] **Step 6: Add the kind toggle and LF fields to the template**

Immediately inside the form area, before the existing Title field, insert:

```html
        <!-- Kind toggle -->
        <div class="field-block">
          <label class="field-label">{{ t('announce.kindHint') }}</label>
          <div class="flex gap-2">
            <button
              type="button"
              class="flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-lg text-xs font-semibold border cursor-pointer transition-all"
              :style="!isLf
                ? { backgroundColor: 'var(--c-trade)', borderColor: 'var(--c-trade)', color: 'white' }
                : { backgroundColor: 'transparent', borderColor: 'var(--c-border)', color: 'var(--c-muted)' }"
              :aria-pressed="!isLf"
              @click="setKind('sell')"
            >
              <v-icon icon="mdi-tag-outline" size="14" />{{ t('announce.kindSell') }}
            </button>
            <button
              type="button"
              class="flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-lg text-xs font-semibold border cursor-pointer transition-all"
              :style="isLf
                ? { backgroundColor: 'var(--c-mutual)', borderColor: 'var(--c-mutual)', color: 'white' }
                : { backgroundColor: 'transparent', borderColor: 'var(--c-border)', color: 'var(--c-muted)' }"
              :aria-pressed="isLf"
              @click="setKind('looking_for')"
            >
              <v-icon icon="mdi-magnify" size="14" />{{ t('announce.kindLookingFor') }}
            </button>
          </div>
        </div>

        <!-- Looking For: archetype + detail replace the Title field -->
        <template v-if="isLf">
          <div class="field-block">
            <label class="field-label" for="lf-archetype">{{ t('announce.archetype') }}</label>
            <input
              id="lf-archetype"
              v-model="archetypeQuery"
              class="field-input"
              :placeholder="t('announce.archetypePlaceholder')"
              autocomplete="off"
              @focus="ensureArchetypes"
            />
            <ul v-if="archetypeMatches.length" class="archetype-list">
              <li v-for="name in archetypeMatches" :key="name">
                <button type="button" class="archetype-option" @click="pickArchetype(name)">
                  {{ name }}
                </button>
              </li>
            </ul>
            <p v-else-if="archetypeQuery.trim() && archetypeList.length" class="field-hint">
              {{ t('announce.archetypeNoMatch') }}
            </p>
            <p v-if="archetypeErr" class="field-hint" style="color: var(--c-accent)">{{ archetypeErr }}</p>
          </div>

          <div class="field-block">
            <label class="field-label" for="lf-detail">{{ t('announce.wantDetail') }}</label>
            <input
              id="lf-detail"
              v-model="wantDetail"
              class="field-input"
              maxlength="120"
              :placeholder="t('announce.wantDetailPlaceholder')"
            />
          </div>
        </template>
```

Then wrap the **existing** Title field block in `<template v-if="!isLf"> … </template>` so it only shows for sell posts.

For the price field, change its label binding to:

```html
          <label class="field-label">{{ isLf ? t('announce.budgetOptional') : t('announce.price') }}</label>
```

and add under the price input:

```html
          <p v-if="isLf" class="field-hint">{{ t('announce.budgetHint') }}</p>
```

For the photos section, change its label binding to:

```html
          <label class="field-label">{{ isLf ? t('announce.photosOptionalLf') : t('announce.images') }}</label>
```

And change the submit button label to:

```html
          {{ isEdit ? t('announce.saveChanges') : (isLf ? t('announce.createLookingFor') : t('announce.create')) }}
```

- [ ] **Step 7: Add the dropdown styles**

Add to the component's `<style scoped>` block:

```css
.archetype-list {
  list-style: none;
  margin-top: 4px;
  max-height: 180px;
  overflow-y: auto;
  border: 1px solid var(--c-border);
  border-radius: 8px;
  background: var(--c-surface-2);
}
.archetype-option {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--c-text);
  background: transparent;
  cursor: pointer;
}
.archetype-option:hover,
.archetype-option:focus-visible {
  background: color-mix(in srgb, var(--c-mutual) 18%, transparent);
}
.field-hint {
  margin-top: 4px;
  font-size: 11px;
  color: var(--c-muted);
}
```

If `.field-hint` already exists in this file, skip that rule rather than duplicating it.

- [ ] **Step 8: Verify in the browser**

Start the dev server and exercise the form:

```bash
# from the repo root, via the preview tooling, config name: frontend-dev (port 5199)
```

Check: switching to "Looking for" hides Title and shows Archetype + What exactly; typing "dark" lists archetypes; picking one fills the field; the submit button enables with an archetype and no price; submitting creates a row with `kind='looking_for'`. Confirm no console errors.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/trade/CreateAnnounceDialog.vue frontend/src/locales/
git commit -m "feat(announces): post a looking-for announce from the website"
```

---

### Task 5: Display Looking For posts in the card and detail dialog

**Files:**
- Modify: `frontend/src/components/trade/AnnounceCard.vue:21-27` (`formattedPrice`) and its template
- Modify: `frontend/src/components/trade/AnnounceDetailDialog.vue`

**Interfaces:**
- Consumes: `isLookingFor` (Task 2); `announce.kind`, `announce.archetype`, `announce.want_detail`, nullable `announce.price`.
- Produces: no new exports.

- [ ] **Step 1: Make the price pill handle a null price**

In `AnnounceCard.vue`, add the import:

```js
import { isLookingFor } from "@/lib/announceKind";
```

and replace the `formattedPrice` computed (lines 21-27) with:

```js
const isLf = computed(() => isLookingFor(props.announce));

// LF posts may carry no budget at all, in which case there is nothing to show.
const formattedPrice = computed(() => {
  const p = props.announce.price;
  if (p === null || p === undefined || p === "") return null;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: props.announce.currency || "EUR",
    maximumFractionDigits: 0,
  }).format(p);
});
```

- [ ] **Step 2: Update the card template**

Replace the price pill line:

```html
      <div v-if="formattedPrice" class="ac-img__price">
        <span v-if="isLf" class="ac-img__price-label">{{ t('announce.budget') }}</span>
        {{ formattedPrice }}
      </div>
```

Add an LF badge just after the opening `<div class="ac-img">`:

```html
      <div v-if="isLf" class="ac-lf">{{ t('announce.lfBadge') }}</div>
```

And under `<p class="ac-title">`, add the archetype line:

```html
      <p v-if="isLf && announce.archetype" class="ac-archetype">
        <v-icon icon="mdi-cards-outline" size="12" />
        {{ announce.archetype }}
      </p>
```

- [ ] **Step 3: Style the badge**

Add to `AnnounceCard.vue`'s `<style scoped>`:

```css
.ac-lf {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .08em;
  color: #fff;
  background: var(--c-mutual);
}
.ac-img__price-label {
  font-size: 9px;
  font-weight: 700;
  opacity: .8;
  margin-right: 3px;
  text-transform: uppercase;
}
.ac-archetype {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--c-mutual);
}
```

`.ac-img` must be a positioning context for `.ac-lf`. Check its existing rule; if it lacks `position: relative`, add it.

- [ ] **Step 4: Mirror it in the detail dialog**

In `AnnounceDetailDialog.vue`, add the import:

```js
import { isLookingFor } from "@/lib/announceKind";
```

add this computed after `isOwner` (line 104):

```js
const isLf = computed(() => isLookingFor(props.announce));
```

replace the `formattedPrice` computed (lines 106-109) so a null price yields an empty string instead of `€NaN`:

```js
const formattedPrice = computed(() => {
  const p = props.announce?.price;
  if (p === null || p === undefined || p === "") return "";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: props.announce.currency || "EUR" }).format(p);
});
```

replace the title row (lines 267-270) so the badge sits next to the heading:

```html
        <div class="info-row">
          <h2 class="info-title">
            <span v-if="isLf" class="lf-badge">{{ t('announce.lfBadge') }}</span>
            {{ announce.title }}
          </h2>
          <span class="info-time">{{ timeAgo(announce.created_at, t) }}</span>
        </div>
```

and immediately after the description line (line 273), add the archetype line:

```html
        <p v-if="isLf && announce.archetype" class="detail-archetype">
          <v-icon icon="mdi-cards-outline" size="14" />
          {{ announce.archetype }}<template v-if="announce.want_detail"> · {{ announce.want_detail }}</template>
        </p>
```

Then find every remaining use of `formattedPrice` in this file's template and wrap it in `v-if="formattedPrice"`, prefixing it with the budget label on LF posts:

```html
        <span v-if="formattedPrice">
          <span v-if="isLf">{{ t('announce.budget') }}: </span>{{ formattedPrice }}
        </span>
```

with styles:

```css
.lf-badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .08em;
  color: #fff;
  background: var(--c-mutual);
}
.detail-archetype {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--c-mutual);
}
```

- [ ] **Step 5: Verify in the browser**

With the dev server running, confirm: an LF announce shows the LF badge and its archetype; an LF announce with no budget shows no price pill (not "€NaN" or "€0"); a normal sell announce looks exactly as before. Check the console for errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/trade/AnnounceCard.vue frontend/src/components/trade/AnnounceDetailDialog.vue
git commit -m "feat(announces): show looking-for badge, archetype and budget"
```

---

### Task 6: Dedicated Looking For tab

**Files:**
- Modify: `frontend/src/components/Pages/App/trade-center/AnnouncesTab.vue:6-28` and template
- Modify: `frontend/src/components/Pages/App/TradeCenter.vue:76-80` and `:177-184`
- Modify: `frontend/src/locales/{en,fr,de,it}.json`

**Interfaces:**
- Consumes: `ANNOUNCE_KIND` (Task 2).
- Produces: `AnnouncesTab` gains a `kind` prop (`'sell' | 'looking_for'`, default `'sell'`) that filters `props.announces` before the existing mine/others split. `TradeCenter` gains a `lookingfor` tab key.

- [ ] **Step 1: Add the tab label strings**

Add to the `"tradeCenter"` object in each locale file — `en.json`: `"lookingFor": "Looking For"`; `fr.json`: `"lookingFor": "Recherches"`; `de.json`: `"lookingFor": "Gesuche"`; `it.json`: `"lookingFor": "Ricerche"`.

Add to the `"announces"` object in each — `en.json`:

```json
    "noLookingForTitle": "No Looking For posts yet",
    "noLookingForDesc": "Post what you are hunting for and let sellers come to you.",
    "newLookingFor": "New Looking For"
```

`fr.json`:

```json
    "noLookingForTitle": "Aucune recherche pour l'instant",
    "noLookingForDesc": "Publiez ce que vous cherchez et laissez les vendeurs venir à vous.",
    "newLookingFor": "Nouvelle recherche"
```

`de.json`:

```json
    "noLookingForTitle": "Noch keine Gesuche",
    "noLookingForDesc": "Sag, was du suchst, und lass die Verkäufer zu dir kommen.",
    "newLookingFor": "Neues Gesuch"
```

`it.json`:

```json
    "noLookingForTitle": "Nessuna ricerca al momento",
    "noLookingForDesc": "Pubblica cosa stai cercando e lascia che siano i venditori a contattarti.",
    "newLookingFor": "Nuova ricerca"
```

- [ ] **Step 2: Filter `AnnouncesTab` by kind**

In `AnnouncesTab.vue`, add the import:

```js
import { ANNOUNCE_KIND } from "@/lib/announceKind";
```

add the prop to `defineProps` (after `announces`):

```js
  kind:      { type: String,  default: ANNOUNCE_KIND.SELL },
```

and insert a kind filter ahead of the existing mine/others split, replacing lines 18-20:

```js
// Only the announces of the kind this tab renders. Rows written before the
// kind column existed default to 'sell' in the database, so `?? SELL` here is
// just belt-and-braces for optimistic local inserts.
const kindAnnounces = computed(() =>
  props.announces.filter(a => (a.kind ?? ANNOUNCE_KIND.SELL) === props.kind)
);

const isLf = computed(() => props.kind === ANNOUNCE_KIND.LOOKING_FOR);

// Split by ownership
const myAnnounces    = computed(() => kindAnnounces.value.filter(a => a.seller === currentUserId.value));
const otherAnnounces = computed(() => kindAnnounces.value.filter(a => a.seller !== currentUserId.value));
```

Then change `filteredOthers` to also search the archetype and detail:

```js
const filteredOthers = computed(() => {
  if (!searchQuery.value.trim()) return otherAnnounces.value;
  const q = searchQuery.value.trim().toLowerCase();
  return otherAnnounces.value.filter(a =>
    a.title.toLowerCase().includes(q) ||
    (a.description  || "").toLowerCase().includes(q) ||
    (a.archetype    || "").toLowerCase().includes(q) ||
    (a.want_detail  || "").toLowerCase().includes(q)
  );
});
```

Finally, replace the two remaining `announces.length === 0` checks in the template with `kindAnnounces.length === 0`, and make the empty state and the new-post button kind-aware:

```html
            <p class="state-title">{{ isLf ? t("announces.noLookingForTitle") : t("announces.noAnnouncesTitle") }}</p>
            <p class="state-sub">{{ isLf ? t("announces.noLookingForDesc") : t("announces.noAnnouncesDesc") }}</p>
```

and both `btn-new` labels:

```html
          {{ isLf ? t("announces.newLookingFor") : t("announces.newAnnounce") }}
```

- [ ] **Step 3: Register the tab in `TradeCenter.vue`**

In the `tabs()` computed (lines 177-184), add after the `announces` entry:

```js
        { key: "lookingfor", label: this.$t("tradeCenter.lookingFor"), icon: "mdi-magnify", badge: 0 },
```

Replace the existing `<AnnouncesTab>` block (lines 75-83) with these two instances:

```html
    <!-- Announces tab -->
    <AnnouncesTab
      v-if="activeTab === 'announces'"
      kind="sell"
      :login="login"
      :loading="loadingAnnounces"
      :announces="announces"
      @openCreate="onOpenCreateAnnounce"
      @openDetail="onOpenAnnounceDetail"
    />

    <!-- Looking For tab — same component, filtered to the other kind -->
    <AnnouncesTab
      v-if="activeTab === 'lookingfor'"
      kind="looking_for"
      :login="login"
      :loading="loadingAnnounces"
      :announces="announces"
      @openCreate="onOpenCreateAnnounce"
      @openDetail="onOpenAnnounceDetail"
    />
```

- [ ] **Step 4: Verify in the browser**

Confirm: a fourth tab "Looking For" appears; it lists only LF posts; the Announces tab no longer shows LF posts; each tab's empty state uses its own copy; search matches an archetype name. Check the console for errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Pages/App/trade-center/AnnouncesTab.vue frontend/src/components/Pages/App/TradeCenter.vue frontend/src/locales/
git commit -m "feat(announces): add a dedicated Looking For tab"
```

---

### Task 7: Extract and extend the Discord announce parser

**Files:**
- Create: `discord-bot/lib/parseAnnounce.js`
- Test: `discord-bot/lib/parseAnnounce.test.js`
- Modify: `discord-bot/package.json` (add a `test` script)

**Interfaces:**
- Consumes: nothing (pure CommonJS module).
- Produces: `module.exports = { parseAnnounce, matchArchetype, ANNOUNCE_KIND }` where
  `parseAnnounce(content, archetypes = []) -> { kind, title, description, price, currency, archetype, wantDetail }`.
  `price` is `null` when no price appears in the message.

- [ ] **Step 1: Add a test script**

In `discord-bot/package.json`, add to `"scripts"`:

```json
    "test": "node --test"
```

- [ ] **Step 2: Write the failing test**

Create `discord-bot/lib/parseAnnounce.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAnnounce, ANNOUNCE_KIND } = require('./parseAnnounce');

const ARCHETYPES = ['Darklord', 'Blue-Eyes', 'HERO', 'Sky Striker', 'Dark Magician'];

test('parses a classic WTS post as a sell announce', () => {
  const r = parseAnnounce('WTS: Blue-Eyes White Dragon PSA 9\nMint condition.\nPrice: 45€', ARCHETYPES);
  assert.equal(r.kind, ANNOUNCE_KIND.SELL);
  assert.equal(r.title, 'Blue-Eyes White Dragon PSA 9');
  assert.equal(r.price, 45);
  assert.equal(r.currency, 'EUR');
  assert.equal(r.archetype, null);
});

test('detects the LF prefix and pulls out the archetype', () => {
  const r = parseAnnounce('LF: Darklord deck base', ARCHETYPES);
  assert.equal(r.kind, ANNOUNCE_KIND.LOOKING_FOR);
  assert.equal(r.archetype, 'Darklord');
  assert.equal(r.wantDetail, 'deck base');
  assert.equal(r.title, 'Darklord deck base');
});

test('accepts LF without a colon and in lower case', () => {
  const r = parseAnnounce('lf sky striker playset', ARCHETYPES);
  assert.equal(r.kind, ANNOUNCE_KIND.LOOKING_FOR);
  assert.equal(r.archetype, 'Sky Striker');
  assert.equal(r.wantDetail, 'playset');
});

test('does not treat LFP or Golfer as an LF prefix', () => {
  assert.equal(parseAnnounce('LFP playmat 20€', ARCHETYPES).kind, ANNOUNCE_KIND.SELL);
  assert.equal(parseAnnounce('Golfer deck 30€', ARCHETYPES).kind, ANNOUNCE_KIND.SELL);
});

test('an LF post with no recognised archetype keeps the text as the detail', () => {
  const r = parseAnnounce('LF: some obscure promo', ARCHETYPES);
  assert.equal(r.kind, ANNOUNCE_KIND.LOOKING_FOR);
  assert.equal(r.archetype, null);
  assert.equal(r.wantDetail, 'some obscure promo');
  assert.equal(r.title, 'some obscure promo');
});

test('price is null when the message states none', () => {
  assert.equal(parseAnnounce('LF: Darklord deck base', ARCHETYPES).price, null);
});

test('reads a budget out of an LF post', () => {
  const r = parseAnnounce('LF: Darklord deck base\nBudget 120€', ARCHETYPES);
  assert.equal(r.price, 120);
  assert.equal(r.currency, 'EUR');
});

test('recognises the three currencies', () => {
  assert.equal(parseAnnounce('WTS card\n30$', ARCHETYPES).currency, 'USD');
  assert.equal(parseAnnounce('WTS card\n30£', ARCHETYPES).currency, 'GBP');
  assert.equal(parseAnnounce('WTS card\n30 EUR', ARCHETYPES).currency, 'EUR');
});

test('truncates an over-long title to 120 characters', () => {
  const r = parseAnnounce('WTS: ' + 'a'.repeat(200) + '\n10€', ARCHETYPES);
  assert.ok(r.title.length <= 120);
});

test('survives an empty archetype list', () => {
  const r = parseAnnounce('LF: Darklord deck base', []);
  assert.equal(r.kind, ANNOUNCE_KIND.LOOKING_FOR);
  assert.equal(r.archetype, null);
  assert.equal(r.wantDetail, 'Darklord deck base');
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd discord-bot && npm test
```

Expected: FAIL — `Cannot find module './parseAnnounce'`.

- [ ] **Step 4: Write the implementation**

Create `discord-bot/lib/parseAnnounce.js`:

```js
// Pure parsing of a Discord message into announce fields.
//
// Extracted from index.js so it can be unit tested without a Discord client.
// Mirrors frontend/src/lib/announceKind.js — the two packages ship separately
// and share no build, so the duplication is deliberate. Keep them in sync.

const ANNOUNCE_KIND = {
  SELL: 'sell',
  LOOKING_FOR: 'looking_for',
};

// "LF", "LF:", "LF -" at the very start, but not "LFP" or "Golfer".
const LF_PREFIX_RE = /^\s*LF\b\s*[:\-–]?\s*/i;
const ANY_PREFIX_RE = /^\s*(LF|WTS|WTT|WTB)\b\s*[:\-–]?\s*/i;
const PRICE_RE = /(\d+(?:[.,]\d{1,2})?)\s*(€|EUR|USD|GBP|\$|£)/i;

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** First archetype appearing in `text`, longest name first. */
function matchArchetype(text, archetypes) {
  const haystack = String(text ?? '').trim();
  if (!haystack || !Array.isArray(archetypes) || archetypes.length === 0) return null;

  const sorted = [...archetypes].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    const re = new RegExp(`\\b${escapeRe(name)}`, 'i');
    if (re.test(haystack)) return name;
  }
  return null;
}

/**
 * Parse a Discord message into announce fields.
 *
 * Sell:
 *   WTS: Blue-Eyes White Dragon PSA 9
 *   Mint condition, bought from TCGplayer.
 *   Price: 45€
 *
 * Looking For:
 *   LF: Darklord deck base
 *   Budget 120€
 *
 * @param {string}   content
 * @param {string[]} [archetypes=[]] canonical YGOPRODeck archetype names
 */
function parseAnnounce(content, archetypes = []) {
  const lines = String(content ?? '').trim().split('\n').map(l => l.trim()).filter(Boolean);
  const first = lines[0] ?? '';

  const kind = LF_PREFIX_RE.test(first) ? ANNOUNCE_KIND.LOOKING_FOR : ANNOUNCE_KIND.SELL;

  let headline = first.replace(ANY_PREFIX_RE, '').trim();
  if (!headline) headline = 'Untitled';

  // Price is optional everywhere now: an LF post may name no budget, and a
  // missing price is stored as NULL rather than a misleading 0.
  let price = null;
  let currency = 'EUR';
  for (const line of lines) {
    const m = line.match(PRICE_RE);
    if (m) {
      price = parseFloat(m[1].replace(',', '.'));
      const sym = m[2].toUpperCase();
      if (sym === '€' || sym === 'EUR') currency = 'EUR';
      else if (sym === '$' || sym === 'USD') currency = 'USD';
      else if (sym === '£' || sym === 'GBP') currency = 'GBP';
      break;
    }
  }

  let archetype = null;
  let wantDetail = null;
  if (kind === ANNOUNCE_KIND.LOOKING_FOR) {
    archetype = matchArchetype(headline, archetypes);
    // Whatever is left after removing the archetype is the qualifier
    // ("deck base"). With no archetype match the whole headline is the detail.
    wantDetail = archetype
      ? headline.replace(new RegExp(`\\b${escapeRe(archetype)}\\w*`, 'i'), '').replace(/\s+/g, ' ').trim()
      : headline;
    if (!wantDetail) wantDetail = null;
  }

  let title = headline;
  if (title.length > 120) title = title.slice(0, 117) + '…';

  const description = lines.slice(1).join('\n').trim().slice(0, 1000);

  return { kind, title, description, price, currency, archetype, wantDetail };
}

module.exports = { parseAnnounce, matchArchetype, ANNOUNCE_KIND };
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd discord-bot && npm test
```

Expected: PASS, all tests green.

- [ ] **Step 6: Commit**

```bash
git add discord-bot/lib/parseAnnounce.js discord-bot/lib/parseAnnounce.test.js discord-bot/package.json
git commit -m "feat(bot): parse LF announces and their archetype"
```

---

### Task 8: Wire the LF parser into the bot

**Files:**
- Modify: `discord-bot/index.js:181-213` (delete the inline `parseAnnounce`), `:426-432`, `:446-454`, `:461-477`, `:501-512`, `:548-552`

**Interfaces:**
- Consumes: `parseAnnounce`, `ANNOUNCE_KIND` from Task 7; the columns from Task 1.
- Produces: no new exports.

- [ ] **Step 1: Import the parser and add an archetype cache**

Near the other requires at the top of `discord-bot/index.js`, add:

```js
const { parseAnnounce, ANNOUNCE_KIND } = require('./lib/parseAnnounce');
```

Then, next to `lookupCardBySetCode`, add:

```js
// ── YGOPRODeck archetype list (cached for the process lifetime) ───────────────
// Only used to tag LF posts. A failure here must never block an announce, so
// every error path resolves to [] and the post is simply saved untagged.
let _archetypesCache = null;

async function getArchetypes() {
  if (_archetypesCache) return _archetypesCache;
  try {
    const list = await new Promise((resolve, reject) => {
      const https = require('https');
      https.get('https://db.ygoprodeck.com/api/v7/archetypes.php', (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            resolve((parsed ?? []).map(a => a?.archetype_name).filter(Boolean));
          } catch { resolve([]); }
        });
        res.on('error', reject);
      }).on('error', reject);
    });
    if (list.length > 0) _archetypesCache = list;
    return list;
  } catch (err) {
    console.error('getArchetypes failed:', err);
    return [];
  }
}
```

- [ ] **Step 2: Delete the inline parser**

Remove the old `parseAnnounce` function and its JSDoc block (lines 181-213). The imported one replaces it.

- [ ] **Step 3: Use the new parser in the handler**

Replace the parse block (lines 426-432) with:

```js
  // 2. Parse the message
  const archetypes = await getArchetypes();
  const { kind, title, description, price, currency, archetype, wantDetail } =
    parseAnnounce(message.content, archetypes);
  const isLf = kind === ANNOUNCE_KIND.LOOKING_FOR;

  if (!title) {
    await message.reply('❓ Could not read a title from your message. Start with the card name, `WTS: [name]`, or `LF: [what you want]`.');
    return;
  }
```

- [ ] **Step 4: Relax the image requirement for LF posts**

Replace the image check (lines 446-454) with:

```js
  // 3. Images: required when selling, optional when looking for something.
  //    A buyer after a "Darklord deck base" has nothing to photograph.
  const imageAttachments = [...message.attachments.values()].filter(
    (a) => a.contentType?.startsWith('image/')
  );

  if (imageAttachments.length === 0 && !isLf) {
    await message.reply('📷 Your announce needs at least one photo. Please repost your listing with an image attached.');
    return;
  }
```

- [ ] **Step 5: Insert the new columns**

In the `.insert({ … })` call (lines 463-475), add these three fields after `status: 'active',`:

```js
      kind,
      archetype:   archetype  ?? null,
      want_detail: wantDetail ?? null,
```

and change the price line to `price,` (the parser now yields `null` rather than `0` when no price is present; the column is nullable as of Task 1).

- [ ] **Step 6: Make the confirmation message LF-aware**

Replace the confirmation block (lines 501-512) with:

```js
  // 6. Build confirmation message using this guild's template
  const confirmationLines = [renderTemplate(cfg.threadMessage, {
    link:     `${APP_URL}/en/announces/${announceId}`,
    title,
    price:    price ?? '—',
    currency: price === null ? '' : currency,
    photos:   imageAttachments.length,
  })];
  if (isLf) {
    confirmationLines.unshift(
      `🔎 **Looking For** post` + (archetype ? ` — archetype: **${archetype}**` : '')
    );
  }
  if (cardLink) {
    confirmationLines.push(`🃏 Linked to **${cardLink.card_name}** (\`${detectedSetCode}\`)`);
  }
  const confirmation = { content: confirmationLines.join('\n') };
```

- [ ] **Step 7: Update the log line**

Replace the final `console.log` (lines 548-552) with:

```js
  console.log(
    `[${guildName}] ${kind} #${announceId} "${title}" ${price ?? 'no price'}${price === null ? '' : currency}` +
    (archetype ? ` | archetype=${archetype}` : '') +
    (cardLink ? ` | card=${cardLink.ygo_card_id} (${cardLink.card_name})` : '') +
    ` | user=${discordUserId}`
  );
```

- [ ] **Step 8: Verify the bot starts and the tests still pass**

```bash
cd discord-bot && npm test && node --check index.js
```

Expected: tests PASS, `node --check` prints nothing (syntax valid).

- [ ] **Step 9: Manual smoke test in Discord**

In a test guild's announces channel, post `LF: Darklord deck base` with no attachment. Expected: the bot accepts it (no photo complaint), replies with the Looking For line naming the Darklord archetype, and a row appears with `kind='looking_for'`, `archetype='Darklord'`, `want_detail='deck base'`, `price IS NULL`. Then post a normal `WTS:` message with a photo and confirm the old behaviour is unchanged.

- [ ] **Step 10: Commit**

```bash
git add discord-bot/index.js
git commit -m "feat(bot): accept LF announces without a photo"
```

---

### Task 9: Full-stack verification

**Files:** none modified.

**Interfaces:** none.

- [ ] **Step 1: Run every test**

```bash
cd frontend && npm test
cd ../discord-bot && npm test
```

Expected: both suites PASS.

- [ ] **Step 2: Confirm the production build is not broken**

```bash
cd frontend && npm run build
```

Expected: build completes. (It runs `generate-sitemap.mjs` and `sync-ots-data.mjs` first; both are hardened against missing config as of commit `7095452`.)

- [ ] **Step 3: End-to-end check in the browser**

With the dev server running: post an LF announce from the website; confirm it appears in the Looking For tab and not in Announces; open it and confirm the badge, archetype and detail render; confirm an LF post with no budget shows no price. Then confirm a normal sell announce still behaves exactly as before in the Announces tab.

- [ ] **Step 4: Confirm cross-surface consistency**

Verify that the LF announce posted from Discord in Task 8 appears in the website's Looking For tab with the same archetype, and that an LF announce created on the website is visible and openable.

- [ ] **Step 5: Commit any fixes**

If steps 1-4 surfaced problems, fix them and commit with a `fix(announces):` message. If everything passed, there is nothing to commit.

---

## Notes for the implementer

- **`price` semantics changed.** It is now nullable across the stack. Any code that assumes a number will produce `NaN` or `€0`. Tasks 5 and 8 cover the paths this plan touches; if you find another price read (a notification, an email, an OG image), guard it the same way.
- **The two parsers are deliberately duplicated** (`frontend/src/lib/announceKind.js` and `discord-bot/lib/parseAnnounce.js`). They ship as separate packages with no shared build. Both have tests; if you change the LF prefix or archetype matching rules, change both.
- **`getArchetypes()` never throws** in either package, by design. A YGOPRODeck outage degrades to an untagged LF post rather than a failed one.
- **Task 4 tightens `canSubmit` for sell posts.** The old check was `Number(price.value) >= 0`, and `Number("")` is `0`, so an empty price silently posted a free listing. The new check requires a non-empty price when selling. This is intentional — now that `null` means "no budget stated" on an LF post, an empty price on a sell post must not quietly become `0`. If you would rather preserve the old lenient behaviour, drop the `price.value !== ""` clause, but then decide explicitly what an empty sell price should store.
