---
name: account-stat-panels
description: Use when adding stat/count panels with deep links to a page in this Vue + Supabase app
---

# Stat/count panels that link to their owning page

For any "show a count of X, and a link into the page that owns X" feature in this
repo (decks, collection, proposals, communities, wishlists, matches — any list-backed
resource). Vue 3 (Options API in older pages, `<script setup>` in newer ones) +
Vuetify + Tailwind + vite-ssg + Supabase.

## Counting rows without over-fetching

Two supported patterns, pick based on whether you need a bucket breakdown:

**Single count** — `head: true` returns only the count, no rows:
```js
const { count, error } = await getClient()
  .from('decks')
  .select('id', { count: 'exact', head: true })
  .eq('user_id', userId);
```
Real example: `frontend/src/components/Pages/App/account/AccountProfileCard.vue:380`
(completed-trades count), `frontend/src/lib/community.js:139` (owned-communities count).

**Two buckets in parallel** — one `head: true` query per bucket, `Promise.all`'d.
This is the *established* pattern for collection stats specifically —
`frontend/src/lib/onboarding.js` already has it, reuse it rather than re-deriving
trade-pile/wishlist counts from a full row fetch:
```js
export async function fetchPileCounts(userId) {
  if (!userId) return null;
  const pile = (wish) => getClient()
    .from("Card")
    .select("id", { count: "exact", head: true })
    .eq("trader", userId)
    .eq("wish", wish)
    .neq("status", "traded");
  const [tradeRes, wishRes] = await Promise.all([pile(false), pile(true)]);
  if (tradeRes.error || wishRes.error) return null; // null ≠ "0" — ask failed vs. empty
  return { tradeCount: tradeRes.count ?? 0, wishCount: wishRes.count ?? 0 };
}
```

**When there's no head-count RPC** — some resources only expose a full-row RPC
(e.g. `fetchMyProposals()` in `frontend/src/lib/proposals.js`, which wraps
`fetch_my_proposals` and returns every proposal, sent and received). Don't add a
new Postgres function just to count — fetch once and derive client-side the same
way the consuming page already does, so the two displays can't disagree:
```js
// Mirrors TradeCenter.vue's own badge count (frontend/src/components/Pages/App/TradeCenter.vue:222)
const pendingCount = proposals.filter(p => p.status === "pending" && !p.i_am_proposer).length;
const totalCount = proposals.length;
```
Grep the page that owns the resource for how *it* already counts/badges before
inventing a new derivation — TradeCenter's tab badge is the source of truth for
"pending" here, and a stat panel that computes it differently will drift.

**Decks table**: `frontend/src/components/Pages/App/DecksPage.vue` queries
`.from('decks').select('*').eq('user_id', userId)` — for a count-only version,
swap to `.select('id', { count: 'exact', head: true })`.

## Layout pattern: `.acct-rows` / `.acct-row` / skeleton / empty state

`frontend/src/components/Pages/App/Account.vue` is the reference implementation —
its "My communities" and "Communities I follow" sections are two independently
loading stat-like lists sharing one CSS vocabulary. Copy this structure for a new
section rather than inventing new classes:

```html
<section aria-labelledby="acct-X-h">
  <div class="acct-section-head">
    <h2 id="acct-X-h" class="acct-h2">
      <v-icon icon="mdi-..." size="15" />{{ t('account.xTitle') }}
    </h2>
  </div>

  <!-- Loading: same skeleton row shape as every other acct-rows section -->
  <div v-if="loadingX" class="acct-rows">
    <div v-for="i in 2" :key="i" class="acct-row acct-row--sk">
      <div class="h-4 rounded w-32 animate-pulse motion-reduce:animate-none" style="background: var(--c-skeleton)" />
      <div class="h-5 rounded w-16 ml-auto animate-pulse motion-reduce:animate-none" style="background: var(--c-skeleton)" />
    </div>
  </div>

  <!-- Empty: a link that IS the call to action, not a link next to a sentence -->
  <p v-else-if="xCount === 0" class="acct-empty">
    <router-link :to="{ name: 'decks', params: { locale } }" style="color: var(--c-accent); font-weight: 600">
      {{ t('account.xEmpty') }}
    </router-link>
  </p>

  <!-- Populated: acct-row(s), each row a flex line ending in an .acct-linkbtn -->
  <div v-else class="acct-rows">
    <div class="acct-row">
      <div class="flex flex-col min-w-0" style="gap: 2px">
        <span class="font-semibold truncate" style="color: var(--c-text)">{{ xCount }} {{ t('account.xLabel') }}</span>
        <span class="text-xs truncate" style="color: var(--c-muted)">{{ xSubline }}</span>
      </div>
      <router-link :to="{ name: 'decks', params: { locale } }" class="acct-linkbtn ml-auto" style="color: var(--c-trade)">
        {{ t('community.view') }} <!-- or a dedicated key, see i18n section -->
      </router-link>
    </div>
  </div>
</section>
```

All the classes above (`.acct-rows`, `.acct-row`, `.acct-row--sk`, `.acct-item`,
`.acct-empty`, `.acct-linkbtn`, `.acct-section-head`, `.acct-h2`) are already
defined in `Account.vue`'s `<style scoped>` block — add a new section, don't
duplicate the CSS.

## Routing: named routes with locale param

Every in-app link in this repo carries the current locale as a route param, read
via `useRoute().params.locale` (Options API pages read `this.$route.params.locale`).
Routes relevant to stat panels, from `frontend/src/router/index.js`:

| Target | route object |
|---|---|
| Decks list | `{ name: 'decks', params: { locale } }` |
| Collection (trade pile + wishlists) | `{ name: 'library', params: { locale } }` |
| Trade Center, proposals tab | `{ name: 'TradeCenter', params: { locale, tab: 'proposals' } }` |

`TradeCenter`'s `tab` param is optional (`trade/:tab(matches\|proposals\|announces)?`)
but only accepts those three literal values — passing `tab: 'proposals'` deep-links
straight into the right tab without the component needing extra logic; omitting it
falls back to the component's own default tab.

## i18n: key conventions

Namespace per page/feature (`account`, `decks`, `library`, `tradeCenter`,
`community`), flat keys, camelCase, `X/XEmpty/XCount`-style naming already used:
`decks.totalCards`, `decks.ownedCount`, `decks.missingCount`, `library.tradePile`,
`library.wishlist`, `library.tradePileEmpty`, `library.wishlistEmpty`. Reuse an
existing key (e.g. `library.tradePile`, `community.view`) instead of adding a
near-duplicate when the wording already fits.

**All four locale files must stay in lockstep** — `frontend/src/locales/{en,de,fr,it}.json`
currently have exactly matching key sets for every existing namespace (verified
with a `sorted(keys)` diff across all four). Adding a key to `en.json` only and
forgetting the other three is the most common way this kind of change breaks i18n;
add the key to all four in the same edit, even as a rough translation.

## SSG / prerender safety

`/account` is **not** in `includedRoutes` in `frontend/vite.config.js` (only
locale homepages, static pages, cards, sets, archetypes are prerendered), so
`Account.vue` never executes during the vite-ssg build — but the pattern below is
still the house convention and should be followed for consistency and for any
component that *might* later be prerendered:

- Never fetch on module-eval / setup-body-top-level when the fetch is
  session-dependent. Gate it behind `props.login?.user?.id` and call it from
  `onMounted` or a `watch(() => props.login?.user?.id, ..., { immediate: true })`,
  exactly like `Account.vue`'s existing `loadCommunities`/`loadFollowing` do.
- If a helper module might run in a non-browser context, guard with
  `typeof window === "undefined"` (see `frontend/src/lib/otsLocations.js:61`,
  `frontend/src/lib/deckIgnore.js:33`) — not required for Supabase calls (they
  no-op safely without a session) but is the pattern for anything touching
  `window`/`localStorage`.
- Guest / no-session state: `Account.vue`'s existing `watch` already handles this —
  when `id` is falsy it settles loading flags to `false` rather than leaving a
  spinner running forever. Mirror that: a stat panel with no session should show
  its empty/CTA state, not hang loading.

## Pitfall: Tailwind spacing classes are neutralised by Vuetify — prefix with `!`

**Confirmed still true in this codebase** (checked `frontend/src/main.js` imports
`vuetify/styles`, and live examples across `frontend/src/components/Pages/App/*.vue`:
`CardPage.vue:99` `!p-4`, `TradeDetailPage.vue:416` `!p-4`, `Library.vue:33` `!p-0.5`,
`ArchetypePage.vue:71` `!p-2`).

Tailwind spacing utilities using a `.5` step (`py-2.5`, `mt-0.5`), the all-sides
`p-N`/`m-N` shorthand, or an arbitrary value (`p-[16px]`) silently compute to
`0px` in this app. Cause: Vuetify's reset ships an unlayered `* { padding: 0;
margin: 0 }`, and Tailwind v4 emits its utilities inside `@layer utilities` —
unlayered CSS always wins regardless of specificity. Classes that *look* like
they work (`px-3`, `py-2`, `gap-3`) only do because Vuetify ships identically
named unlayered `!important` utilities on the same 4px scale up to step 16;
non-spacing utilities (`gap-*`, `text-*`, colors, flex) are unaffected.

**Fix: prefix with `!`** — `!p-4`, `!py-0.5`, `!mt-0.5`, `!m-0`. This emits
`!important` and beats the unlayered reset. When building a new stat row/section,
any Tailwind padding/margin class on it needs the `!` or it will render as if the
class weren't there at all (not a subtle sizing bug — the element visibly
collapses to zero padding).

## Common pitfalls, summarized

1. **Tailwind `p-*`/`m-*`/`.5`-step classes silently no-op** → prefix `!` (above).
2. **Inventing a new Postgres RPC to get a count that's already derivable client-side**
   from an existing fetch (proposals) or a cheap `head: true` query (decks,
   collection) — check `frontend/src/lib/*.js` for an existing fetcher before
   adding server-side surface area.
3. **Two counts of the same thing computed two different ways** (e.g. a stat panel's
   "pending proposals" disagreeing with `TradeCenter`'s tab badge) — grep the
   owning page for its own count logic and mirror it exactly.
4. **Forgetting one of the four locale files** when adding i18n keys — edit
   `en/de/fr/it` together.
5. **Missing the locale route param** — every `router-link`/route push in this
   app needs `params: { locale }` (from `useRoute().params.locale` /
   `this.$route.params.locale`), or the link resolves to the wrong locale prefix.
6. **Fetching full rows to only display a count** — use `{ count: 'exact', head: true }`
   (no `data` payload) unless you also need the rows for something else on the
   same panel.
7. **Loading spinner that never resolves for guests** — a session-dependent fetch
   guarded by `if (!userId) return` must still flip its `loading` flag to `false`
   in that branch (see `Account.vue`'s `watch(...).else` branch), or a
   signed-out visitor sees a permanent skeleton instead of an empty/CTA state.
