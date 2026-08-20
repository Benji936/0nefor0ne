# Analysis — Account Page: Deck, Collection & Proposal Stats with Links

Task file: `.specs/tasks/draft/account-stats-panel.feature.md`

## Files to MODIFY

1. **`frontend/src/components/Pages/App/Account.vue`**
   - Add a new stats-fetching section to `<script setup>`: refs for each group's state — `deckCount` (number\|null), `pileCounts` (`{tradeCount, wishCount}`\|null), `proposalCounts` (`{awaiting, open}`\|null) — plus a per-group loading/error flag each (not one shared `loadingStats`, since AC19/AC21 require each group to resolve and fail independently). A `loadStats()` function fires all three sources but resolves them independently (e.g. three separate `.then()/.catch()` chains, or `Promise.allSettled`) rather than a single `Promise.all`, so one rejection cannot blank the other two groups.
   - Import and call `fetchPileCounts(userId)` from `frontend/src/lib/onboarding.js:166-183` for the collection counts — see Files to MODIFY item 3 below; do not hand-roll a second pair of `"Card"` count queries.
   - Hook `loadStats()` into the existing `watch(() => props.login?.user?.id, ...)` at line 221-228, alongside `loadProfile(); loadCommunities(); loadFollowing(); refreshPhoneStatus();`. On a null/absent id (guest), the stats refs must reset to an explicit "no session" state distinct from "loading" or "0", per AC22/AC23 — no fetch may fire.
   - Add a new `<section>` inside `<div class="acct-secondary">` (line 366), in the gap left by the removed Trade history section — as either the first or last child alongside the existing "My communities" (line 369) and "Communities I follow" (line 436) sections.
   - Reuse `.acct-section-head` / `.acct-h2` / `.acct-rows` / `.acct-row` / `.acct-row--sk` / `.acct-empty` / `.acct-linkbtn` (all already defined in this file's `<style scoped>` block, lines 610-679) — no new CSS classes should be needed for a basic 3-row stats list with trailing link buttons, matching the existing communities/following sections' visual language exactly.
   - Reuse the existing `locale = computed(...)` (line 231) for all new `router-link` `params`.

2. **`frontend/src/locales/en.json`, `de.json`, `fr.json`, `it.json`**
   - Add new keys under the `account` namespace (or a nested `account.stats` object) for: section heading, deck-count label, collection trade-pile/wishlist labels, proposal awaiting/open labels, per-group failure text, three empty-state CTAs (add first deck / add first card / find a trade), the guest sign-in prompt, and three accessible link names (NFR3). Keep the key set byte-identical across all four files per the existing convention (verified: all four currently share the exact same 25 `account.*` keys). NFR4 also requires plural-correct phrasing for 0/1/many, so counts need `vue-i18n` pluralization (`$tc`/pipe-syntax `|`) rather than a single fixed string per key, matching how other pluralized counts in these locale files are structured.

3. **`frontend/src/lib/onboarding.js`** — **no code change**, reused as-is. `fetchPileCounts(userId)` (lines 166-183) already implements exactly AC5-AC9: two `head:true` counts on `"Card"` filtered by `trader`, `wish`, and `neq('status','traded')`, run in `Promise.all`, returning `{tradeCount, wishCount}` on success or `null` on either query erroring (`onboarding.js:177-182`) — the in-repo precedent the task's Known Landmarks names for AC20's "failure is not zero" contract. This is listed here (rather than only under Integration points) precisely because reusing it, not reimplementing it, is the recommended action.

## Files to CREATE

None strictly required. Everything can live inline in `Account.vue` given the small surface area, and the collection counts are already covered by the existing `fetchPileCounts()` helper (see Files to MODIFY item 3). A deck-count equivalent (`decks` table, `head:true`, scoped by `user_id`, `null` on error) has no existing helper to reuse and can be a short inline function in `Account.vue`, or — if the team wants symmetry with `fetchPileCounts()` and future reuse (e.g. from onboarding's `ONBOARDING_ENTRY_ROUTES` logic) — a new `fetchDeckCount(userId)` alongside `fetchPileCounts()` in `onboarding.js`, or its own tiny module. Not required by scope; called out as an option rather than a mandate since no second caller exists today.

## Files to DELETE

None.

## Key interfaces (read, with file:line references)

- `Account.vue:221-228` — `watch(() => props.login?.user?.id, (id) => { if (id) { loadProfile(); loadCommunities(); loadFollowing(); refreshPhoneStatus(); } else { ... } }, { immediate: true });` — the hook point for a new `loadStats()` call.
- `Account.vue:230-231` — `const route = useRoute(); const locale = computed(() => route.params.locale || "en");` — reuse for router-link params.
- `DecksPage.vue:426-434` — `loadDecks()`:
  ```js
  const { data, error } = await supabase.from('decks').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  ```
  Table `decks` (lowercase), column `user_id`. Cheapest correct count: `supabase.from('decks').select('id', { count: 'exact', head: true }).eq('user_id', userId)` → response has `.count`.
- `Library.vue:369-372` — `loadEverything()`:
  ```js
  const [wishes, trades] = await Promise.all([
    getClient().from('Card').select('*').eq('wish', true).eq('trader', this.login.user.id).neq('status', 'traded'),
    getClient().from('Card').select('*').eq('wish', false).eq('trader', this.login.user.id).neq('status', 'traded'),
  ]);
  ```
  `wish=true` = wishlist, `wish=false` = trade pile, `trader` = owner id, `status != 'traded'` always excluded. `Library.vue:380-381` sets `this.wishes_quantity = this.wished_cards.value.length` / `this.trades_quantity = this.trade_cards.value.length` — the app's existing definition of "collection size" is a plain row count, not qty-summed.
- **`frontend/src/lib/onboarding.js:166-183` — `fetchPileCounts(userId)`** (the reuse target, per the task's Known Landmarks and NOT previously documented in this analysis's first pass):
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
    if (tradeRes.error || wishRes.error) {
      console.error("onboarding: could not count the piles", tradeRes.error ?? wishRes.error);
      return null;
    }
    return { tradeCount: tradeRes.count ?? 0, wishCount: wishRes.count ?? 0 };
  }
  ```
  This is the exact filter shape Library.vue uses (`trader`, `wish`, `neq('status','traded')`) already expressed as two `count:'exact', head:true` queries, and it already returns `null` on any query error rather than `0` — the precise AC20 contract ("failure never renders as zero"). It is called today from `startPathIfNeeded()` (`onboarding.js:197-202`) for onboarding-redirect decisions, so Account.vue would be a second caller of an already-shared helper, not a new one-off query.
- `lib/proposals.js:43-50` — `fetchMyProposals()`: `getClient().rpc("fetch_my_proposals")`, returns `data ?? []`.
- `supabase/migrations/20260811_proposal_photo_state.sql:16-73` — current `fetch_my_proposals()` definition (supersedes the one in `20260719_trade_meetup_location.sql` via `DROP FUNCTION` + `CREATE FUNCTION`). Returns one row per trade the caller participates in: `id, status, created_at, counterparty_id, counterparty_name, counterparty_avatar_url, i_am_proposer, i_give, i_receive, trade_method, cash_amount, cash_payer, notes, meetup_location, i_confirmed, they_confirmed, decline_reason, i_uploaded, they_uploaded`.
- **`TradeCenter.vue:222,271-274` — the corrected proposal-count derivation** (this analysis's first pass incorrectly stated "total = `.length`"; verified against the source and the task's new AC13/AC14/AC16, corrected below):
  ```js
  // TradeCenter.vue:222 — the Trade Center's own "proposals" tab badge, the number AC14 requires Account to match exactly:
  const pendingCount = this.proposals.filter(p => p.status === "pending" && !p.i_am_proposer).length;
  // TradeCenter.vue:271-274:
  incomingPending() { return this.proposals.filter(p => p.status === "pending" && !p.i_am_proposer); },
  outgoingPending() { return this.proposals.filter(p => p.status === "pending" && p.i_am_proposer); },
  acceptedTrades()  { return this.proposals.filter(p => p.status === "accepted"); },
  history()         { return this.proposals.filter(p => !["pending", "accepted"].includes(p.status)); },
  ```
  `history()` is the tell: TradeCenter treats `declined`, `cancelled`, and `completed` proposals as history, explicitly *not* `pending` or `accepted`. A bare `proposals.length` would include that history and contradict AC16 ("0 pending and 0 accepted but 4 completed/cancelled ones" must show 0 awaiting **and 0 open**, not 4). The two counts this feature actually needs, both derivable from one `fetchMyProposals()` call with no new RPC:
  - **awaiting-answer** = `proposals.filter(p => p.status === "pending" && !p.i_am_proposer).length` — identical expression to `TradeCenter.vue:222`, so AC14 ("cannot drift from the Trade Center badge") holds by construction.
  - **open** = `proposals.filter(p => p.status === "pending" || p.status === "accepted").length` — the complement of `history()`, i.e. everything TradeCenter does *not* file under history. Verified against AC13's worked example: 2 incoming-pending + 3 outgoing-pending + 1 accepted = 6 open, 2 awaiting — matches the AC exactly.
- `frontend/src/router/index.js:41` — `{ path: 'decks', name: 'decks', ... }`.
- `frontend/src/router/index.js:10` — `{ path: "library", name: "library", ... }`.
- `frontend/src/router/index.js:26` — `{ path: "trade/:tab(matches|proposals|announces)?", name: "TradeCenter", ... }` → link with `params: { locale, tab: 'proposals' }`.
- `frontend/src/router/index.js:90-101` — all locale children live under `{ path: "/:locale", children: localeChildren }`, so every new `router-link` needs `params: { locale, ... }`.
- `frontend/vite.config.js:78-115` — `ssgOptions.includedRoutes()`; comment at lines 71-73 explicitly names `/en/library`, `/en/decks` as **not** prerendered, and `/account` is absent from the whitelist (only locale homepages, `privacy`, `terms`, `built-with`, `card/:id`, `set/:setSlug`, `archetype/:slug`, `cards` are included). Confirms `/account` always falls through to the client-rendered SPA shell.
- `supabase/migrations/20260524_security_rls_and_accept_rpc.sql:8-16` — `ALTER TABLE "Trade" ENABLE ROW LEVEL SECURITY;` + `CREATE POLICY "trade_select_participant" ON "Trade" FOR SELECT ...` — confirms a participant can read their own trades directly, though reusing `fetchMyProposals()` is simpler and is what this analysis recommends.

## Integration points (and blast radius)

1. **`Account.vue` script/template** — additive only. New refs, one new async function (calling out to independently-settling sub-fetches, not a single `Promise.all`), one new watch side-effect call, one new template `<section>`. Blast radius: this file only; no other component imports `Account.vue`'s internals. Risk of breaking existing profile/communities/following sections is low as long as the new code is additive and doesn't touch existing refs/computeds — and AC21 requires proving it directly: the profile form, communities list, following list and footer must keep working even when all three stat sources fail.
2. **`frontend/src/lib/onboarding.js` → `fetchPileCounts(userId)` (lines 166-183)** — imported into `Account.vue` and called directly for the two collection counts, rather than writing new `"Card"` queries. This is the primary integration point the first pass of this analysis missed: `onboarding.js` is already an app-wide shared module (also consumed by the OAuth callback and sign-in dialog per its own docstring, `onboarding.js:1-20,187-202`), so Account.vue becomes a second, independent caller of an existing, already-correct, already-tested-shape function — smaller blast radius than two bespoke queries, and the two cannot silently drift apart on the counting rule (AC6-AC9) the way two separately-written queries could.
3. **Supabase `decks` table read** — a new `head: true` count query (no existing helper to reuse for this one — see Files to CREATE). Same table already read in full by `DecksPage.vue`; RLS already permits the owner to read their own rows (proven by existing `.eq('user_id', userId)` query working today). No new policy needed. Must return `null`/undefined-distinct-from-zero on error to satisfy AC20, mirroring `fetchPileCounts()`'s own `null`-on-failure contract rather than defaulting to `0`.
4. **`fetchMyProposals()` RPC call** — a second call site (Account.vue) added to the RPC already called by `TradeCenter.vue`. No RPC/schema change. `fetchMyProposals()` *throws* on error (`proposals.js:44-48`, unlike `fetchPileCounts()`'s `null`-return contract), so Account.vue's proposals group needs its own `try/catch` around this call to turn that throw into the same "failure state, not zero" outcome AC20 requires — this is a real asymmetry between the two data sources worth flagging, not an oversight to paper over. Minor: this duplicates the network round trip if a user visits both pages, but each page is a separate mount so this is normal and not a regression.
5. **Router** — no new routes; only new `router-link :to="{ name: ... }"` usages of existing named routes (`decks`, `library`, `TradeCenter`). Zero blast radius on `router/index.js`.
6. **i18n locale files** — four files touched, additive keys only. Any automated key-parity check (if one exists in CI) needs all four updated together; no existing key is renamed or removed, so no consumer of the current `account.*` keys breaks.
7. **AppHome.vue / `dashboard` route** — confirmed no overlap (see Open Questions). Zero blast radius; this file does not need to change.
8. **`frontend/src/components/Pages/App/account/AccountProfileCard.vue`** — explicitly *not* an integration point. This orphaned component (nothing imports it, confirmed by the task's own Known Landmarks and by grep finding no importer) already computes trade/wish counts from a raw `"Card"` query (its `mounted()` hook) plus a completed-trades count via `getClient().from('Trade').select('id', {count:'exact', head:true}).or(...).eq('status','completed')` (`AccountProfileCard.vue:378-382`) — but the task explicitly excludes a completed-trades count from scope and explicitly warns not to wire this component up as a shortcut. Noted here only to confirm it was checked and correctly excluded, not reused.

## Similar existing patterns to copy from

- **Loading skeleton**: `Account.vue:376-381` (2-row skeleton with `animate-pulse motion-reduce:animate-none` divs sized to mimic real rows) — copy verbatim for the stats section's loading state.
- **Empty state with CTA link**: `Account.vue:383-387` — `<p class="acct-empty"><router-link :to="{ name: 'community', params: { locale } }" ...>{{ t('community.addYours') }}</router-link></p>` — copy this shape for "no decks yet → Create your first deck", etc.
- **Section header with icon**: `Account.vue:369-374` — `<div class="acct-section-head"><h2 class="acct-h2"><v-icon icon="..." size="15"/>{{ t('...') }}</h2></div>`.
- **Row with trailing link-button**: `Account.vue:390-417` and `456-482` — `.acct-row` containing a label block + `router-link.acct-linkbtn.ml-auto` for the "go here" action. This is the direct template for each of the three stat rows (label + count on the left, "View" link-button on the right).
- **Client-side count derivation from an RPC array**: `TradeCenter.vue:222,271-274` — `.filter(...).length` on the `fetchMyProposals()` result, no new RPC.
- **`count:'exact', head:true` count-only queries** — an established pattern, not a new one (corrected from this analysis's first pass, which wrongly claimed zero prior usage). Three real call sites: `onboarding.js:170` (`fetchPileCounts`, the collection-count function this task reuses directly), `community.js:139` (`createCommunity`'s "already own one" pre-check), and `account/AccountProfileCard.vue:380` (the orphaned card's completed-trades count). The decks count should follow this same established idiom.
- **Guarded, session-gated loader**: every `loadX()` in `Account.vue` (`loadProfile`, `loadCommunities`, `loadFollowing`) starts with `if (!props.login?.user?.id) return;` and toggles a `loadingX` ref in a `try/finally` — the exact shape for `loadStats()`, except each of the three new sub-loaders needs its *own* try/finally so a throw in one cannot skip the `finally` of another (see the `Promise.all` risk below).

## Risk assessment

| Risk | Level | Mitigation |
|---|---|---|
| Wrapping all three stat fetches in a single `Promise.all` (as this analysis's first pass recommended, mirroring `loadCommunities()`'s three-way `Promise.all` at `Account.vue:182-186`) would make one source's rejection reject the whole batch, blanking all three groups — directly contradicting AC19 ("only that group shows a failure message, and the other two groups show their counts") and AC21 (all-three-fail must still leave the rest of the page working) | High → mitigated to Low | Do not use a bare `Promise.all` for this call. Either `Promise.allSettled([...])` and branch per-result, or three separate `async` calls each with their own `try/catch` setting only their own ref's error flag. `fetchPileCounts()` already sets the right precedent for the collection group (catches internally, returns `null`, never throws); `fetchMyProposals()` throws and needs an explicit wrapping `try/catch` at the Account.vue call site (see Integration point 4); the new decks-count query should follow `fetchPileCounts()`'s no-throw/`null`-on-error shape for consistency. |
| Three extra network round trips added to Account.vue's mount, one per stat category, could slow perceived load | Low | Fire all three concurrently (not sequentially) — concurrency is still free with `Promise.allSettled` or three independently-started promises; only the fail-fast *aggregation* of `Promise.all` is the problem, not parallelism itself. Each query uses `head: true` so payload is near-zero. |
| Collection count using `fetchPileCounts()`'s filter (`wish` + `trader` + `status != 'traded'`) without Library.vue's extra `quantity>0 OR status==='locked'` refinement could overcount stale zero-quantity, unlocked rows that Library.vue's `loadEverything()` normally garbage-collects on load (`Library.vue:375-376`) | Low | This is explicitly accepted and named in the task's own AC9: "A card entry whose quantity has fallen to zero without being locked is a known transient that the Library clears on its next load; it may briefly inflate this count and is not a defect of this feature." No mitigation needed beyond what `fetchPileCounts()` already does — the task file itself downgrades what this analysis's first pass rated Medium. |
| i18n keys added to only some of the four locale files (human error) | Low | Mechanically diff key sets across `en/de/fr/it.json` after editing (the same check used to verify all four currently match) before considering the task done; NFR4 also requires plural-correct 0/1/many phrasing, which needs a per-locale review pass, not just a key-set diff. |
| Prerendering accidentally including `/account` in a future `vite.config.js` change would break these new session-gated fetches at build time | Low | No action needed now — `/account` is confirmed absent from `includedRoutes()` today (`vite.config.js:78-115`) and the existing profile/communities loaders already assume client-only execution; the new stats loaders follow the identical, already-proven pattern. NFR1 makes this an explicit acceptance criterion, not just a convention to follow. |
| New `<section>` placement inside `.acct-secondary` could visually crowd the column on mobile, given communities + following + new stats = 3 stacked sections | Low | `.acct-secondary` already uses `display:flex; flex-direction:column; gap:30px` (`Account.vue:649`) and is designed for an arbitrary number of stacked sections; no layout change needed, just visual QA after implementation. |

## Open questions answered

The task file has since been rewritten with a Resolved Decisions section that answers these
the same way independently; the below is this analysis's own verification against source, not
a restatement of that section.

1. **Which counts, and can they be derived without new RPCs?**
   - Decks: total deck count via `decks` table, `head: true` count filtered by `user_id` — no RPC, mirrors `DecksPage.vue:426-434`'s existing query shape minus the row payload. No existing count helper to reuse (see Files to CREATE).
   - Collection: two counts, trade-pile and wishlist, via `fetchPileCounts(userId)` (`onboarding.js:166-183`) — **reused directly, not reimplemented**. It already runs the two `"Card"` `head:true` counts filtered by `wish` boolean + `trader` + `status != 'traded'` that mirror `Library.vue:369-372`, and already returns `null` on failure per AC20.
   - Proposals: **not** a bare total/pending pair. Two specific counts, both derived client-side from one `fetchMyProposals()` call, no RPC:
     - awaiting-answer = `proposals.filter(p => p.status === "pending" && !p.i_am_proposer).length` (identical to `TradeCenter.vue:222`, satisfying AC14's "cannot drift" requirement by using the same expression, not just an equal value).
     - open = `proposals.filter(p => p.status === "pending" || p.status === "accepted").length` (the complement of `TradeCenter.vue:274`'s `history()` filter — completed/cancelled/declined proposals are open-trades-zero, per AC16).
   - **No new RPC is needed for any of the three categories**, and two of the three (collection, proposals) reuse existing functions rather than writing new queries.

2. **Does `AppHome.vue` (the `dashboard` route) already show overlapping stats?**
   - **No.** `AppHome.vue` (33 lines) renders only `SearchTraders`, `SearchSetBrowser`, `SearchTrending`, `SearchLatestReleases` — a discovery/browse surface with zero personal deck/collection/proposal counts. There is nothing to stay consistent with and nothing to reuse; `AppHome.vue` requires no changes. (The task file's own Resolved Decisions §2 reaches the same conclusion.)

3. **One fetch per category, or a single aggregate call?**
   - Three concurrently-started fetches (deck count, `fetchPileCounts()`, `fetchMyProposals()`), each resolved and error-handled **independently** — explicitly not a single `Promise.all`, which was this analysis's first-pass recommendation and which the task's Resolved Decisions §3 and AC19 both rule out ("the groups must fail independently... which rules out a single call whose failure blanks all three"). A single new aggregate RPC was also considered and rejected: it would violate the task's explicit "no new database tables, columns, RPCs, or Postgres functions" scope constraint, and all three counts are already cheaply reachable from existing tables/RPCs.
