# UX Contract

## Product context

- Audience: Yu-Gi-Oh collectors who understand binders, printings, condition, language, and card values.
- Primary job: recreate an in-person binder trade without forcing one trader to choose both sides.
- Active locales: English, French, German, and Italian.
- Content register: direct, collector-native, and concise. Locale changes require review in all four locale files.
- Accessibility target: the project targets WCAG 2.1 AA. New trade controls need visible focus, text or icon state cues, reduced-motion support, and practical phone targets.

## Business-context sources

| Domain / scope | Authoritative source | Source type | Reviewed date |
|---|---|---|---|
| Product purpose and accessibility | `PRODUCT.md` | Product brief | 2026-08-28 |
| Visual language and token roles | `DESIGN.md` | Design system | 2026-08-28 |
| Trade lifecycle and permissions | `supabase/migrations/20260828132059_staged_binder_trade_workflow.sql` | Database contract | 2026-08-28 |
| Client trade operations | `frontend/src/lib/proposals.js` | API adapter | 2026-08-28 |
| Legacy exchange completion | `supabase/migrations/20260817_complete_trade_photos_not_a_gate.sql` | Database contract | 2026-08-28 |

## Visual contract

- `DESIGN.md` and `frontend/src/assets/main.css` remain the visual sources of truth.
- The trade workflow uses existing semantic roles: amethyst for trade actions, pink for wants or cancellation, and teal for mutual agreement.
- This workflow does not introduce global tokens or alter unrelated screens.
- `TradeDetailPage.vue` sets its own `--td-*` surface tokens, mirroring the landing page's panel ground, partial-
  alpha borders, lit top edge and 22/14/9 radii. It also sets its display type in Space Grotesk, which diverges
  from `DESIGN.md` §3's device-sans-throughout. Both are scoped to this page and neither changes a token another
  screen reads.
- `ProposalsTab.vue` sets the same vocabulary as `--pq-*`, which `ProposalRow.vue` reads through fallbacks. Space
  Grotesk appears once on that page, on the single sentence under the heading; everything else is the app's face.
- The stage pill on a proposal row names the same four stops the trade page's spine draws, and folds a legacy
  proposal's `negotiation` phase into `agreement` exactly as `phaseStops` does, so a row and the page it opens
  can never name a trade's stage differently.
- Teal reaches a proposal row at exchange, the first stop that exists only because both sides agreed
  (`DESIGN.md`, The Agreement Rule). Selection is neutral, agreement is amethyst, a trade that fell through is
  pink. The one pile with no role in the system — trades waiting on the other trader — lights its segment
  neutral rather than borrowing one.
- Teal appears on `TradeDetailPage.vue` only on the seam between the two piles, and only once both sides have
  agreed (`DESIGN.md`, The Agreement Rule).
- Card art uses the Yu-Gi-Oh card ratio, `59 / 86`, with `object-fit: contain`.
- Where a trade happens is settled in one place, the Suggest terms dialog, and by one component, `LocationPicker`,
  which owns both the choice between meeting and posting and the place that goes with the first. A trade is only
  `in_person` once somewhere is actually named; choosing to post clears any place already on it. `settlementTerms`
  is the single derivation of those four columns, so the propose dialog and the trade page cannot disagree about
  what "in person, nowhere named" means. Changing either bumps the revision and clears both confirmations —
  where you meet is part of what the two of you agreed to.
- Matches are filtered by the city and country a trader wrote on their profile, because that is all a trader row
  carries: there are no coordinates, so there is no distance to sort by. "Near me" fills those same two filters
  from the viewer's own profile rather than introducing a second notion of nearness that could disagree with
  them, and it is a toggle — pressing it again is the way back out. A profile with no location gets a link to go
  and set one instead of a button that would do nothing.
- A deck counts in copies, not in cards. Ownership is a count per card id, and every entry's copies are split
  across owned, sourced, missing and unreadable so that holding one of the three a deck asks for reads as one
  owned and two missing. The completion strip draws a tick per copy and the rule under each card tile is that
  same strip one entry wide: a third amethyst and two thirds pink for one of three. The tile also writes the
  split as `1/3`, and reads as missing while any copy is outstanding.
- The pool is allocated once per deck, across main, extra and side together. The same card can sit in the main
  and side decks, and those entries draw on one pile of copies — allocating per section would let a single copy
  cover all of them.
- Marking a card as coming from elsewhere is a count, not a flag. The corner control marks one more copy per
  click and clears on the click after the last, so two of a three-of can be handled while the third stays on the
  shopping list. It reaches only the copies you do not already hold: sourcing a copy that is in your trade pile
  would be offering to un-own it. A card the deck asks for once behaves exactly as the toggle it replaced, keeps
  its 28px disc and its `aria-pressed`; a card carrying a count grows into a pill and drops `aria-pressed`,
  which cannot describe three states, stating the count in its label instead.
- Marks are stored as one array entry per marked copy behind a leading `0` tag, in the same `int4[]` column and
  the same localStorage key as before. The tag is load-bearing: without it a two-element array cannot be told
  apart from the old whole-entry format. An untagged array is read the old way — every copy of that entry — and
  rewritten in counted form the next time a mark is touched, so no existing mark changes meaning.

A Cardmarket link says which printing, and which copy. It is addressed by product id —
`/en/YuGiOh/Products?idProduct=820817&sellerCountry=4&language=1&minCondition=2` — which resolves straight to
that product's page. There is no slug to build, no expansion to look up and no search to disambiguate, so a
card printed at nine rarities in one set is answerable exactly: nine ids, one of which is the copy in hand.

The id costs nothing to obtain. `card_prices` already returns `product_id` and already keys on rarity, so
every surface showing a price has the id already; `readPrice` now carries it through instead of discarding it.
Only a card opened without a loaded price pays for a lookup, and only the first link on a page pays for the
reader's country.

There are two outcomes, and the second is not a failure: a card whose printing is identified gets the product
link, and a card whose owner never recorded a printing falls back to a search. There is no third rung — every
card in the collection that carries a set code resolves to exactly one product id, checked, so an
expansion-listing fallback would be unreachable code.

The search term is the print code with its region removed: `RA04-EN024` becomes `ra04-024`. Cardmarket files a
card by set and number, so the printed code finds nothing and the bare set code finds the whole set; dropping
just the region is the form that lands on the card, and it is the form the repo owner tested. The region is
whatever letters sit between the hyphen and the number, so no list of region codes has to be maintained.

Nothing is defaulted. A copy with no language recorded omits that filter rather than assuming English; a
reader in a country Cardmarket does not sell from omits `sellerCountry` rather than guessing a neighbour.
Seller-country ids are ordered by ISO code, not by name — Germany 7, Switzerland 4, the United Kingdom 13 —
and were read from Cardmarket's own filter markup rather than assembled from a list of country names, which
would have put Switzerland at 34 and sent every Swiss reader to Croatia's sellers. The ids run to 37 but 32
and 34 do not exist. Portuguese is language 8, not 6.

## Trade lifecycle

| Stage | User 1 | User 2 | Exit condition |
|---|---|---|---|
| Selection | Chooses cards from User 2's binder and sends the request. | Reviews User 1's binder and chooses return cards. | User 2 submits at least one available card from User 1. |
| Agreement | May change only the cards they want, suggest terms, or confirm the current revision. | May change only the cards they want, suggest terms, or confirm the current revision. | Both traders confirm the same revision. |
| Exchange | Uses the existing chat, verification photos, settlement details, and receipt confirmation. | Uses the same exchange tools. | Both traders confirm completion. |
| Completed | May review history and rate the other trader. | May review history and rate the other trader. | Terminal. |
| Cancelled or declined | May review the record. | May review the record. | Terminal. |

Legacy proposals remain usable. A proposal without `workflow_phase` follows the former negotiation flow; accepted legacy proposals enter exchange.

## Canonical UI map

| Capability | Canonical owner | Allowed variants | Verification |
|---|---|---|---|
| Binder selection | `ProposeTradeDialog.vue` | request, return selection, revise wanted cards, legacy edit/counter | keyboard, responsive layout, unit/API tests |
| Binder rendering | `CardBinder.vue` | read-only (trader profile), selectable (proposal dialog), activatable (own collection) | pocket is a button only when selectable or `activate` |
| Collection display | `CardElement.vue` | list row, grid tile | two metadata lines, quantity stamp, browser check |
| Correcting a copy | `EditCardCopy.vue` | edit, remove | `cardCopy.test.js` |
| Collection order | `lib/collectionSort.js` | name, value, set code, recently added | `collectionSort.test.js` |
| Deck completion | `lib/deckStats.js` | strip, card grid, list row, import preview | `deckStats.test.js` |
| Owned copies | `lib/decks.js` `countCopies` | deck pages, import preview | `decks.test.js` |
| Sourced copies | `lib/deckIgnore.js` | per-copy mark on a deck card | `deckIgnore.test.js` |
| Settlement terms | `lib/tradeWorkflow.js` `settlementTerms` | propose dialog, Suggest terms | `tradeWorkflow.test.js` |
| Cardmarket links | `lib/cardmarketLink.js` | binder link sheet, list row, proposal suggestions | `cardmarketLink.test.js` |
| Meetup location | `LocationPicker.vue` | Suggest terms, legacy edit/counter | trade-page browser check |
| Trade review | `TradeDetailPage.vue` | selection, agreement, exchange, history | responsive browser check |
| Proposal queue | `ProposalsTab.vue` | your move, their move, done, closed | segment counts against pile contents |
| Proposal summary | `ProposalRow.vue` | selection, agreement, exchange, done, closed | overflow and action-state check |
| Select/listbox | Vuetify `v-select` | trade method and cash payer | label and keyboard check |
| Feedback | Existing `v-snackbar` and inline dialog error | success and error | failure-path check |
| Conversation | Existing `TradeChatPanel.vue`, docked by `TradeChatSleeve.vue` | right-edge panel on desktop, bottom sheet on phone | confirm chat never moves into the top bar; confirm the cards stay visible beside an open desktop panel |

## Flow ledger

| Operation | Trigger | Pending | Success | Failure recovery |
|---|---|---|---|---|
| Request cards | User 1 selects one or more cards and sends. | Disable duplicate submission and show button progress. | Open the staged proposal in selection. | Keep selections and show the server error. |
| Choose return cards | User 2 selects one or more cards and submits. | Lock the dialog action. | Move the trade to agreement and increment its revision. | Keep selections and allow retry. |
| Revise wanted cards | Either trader changes cards owned by the other trader. | Lock the dialog action. | Replace only that trader's wanted side, increment the revision, and clear both confirmations. | Keep edits and reload on a stale revision. |
| Suggest terms | Either trader changes how the trade settles: meeting somewhere and where, or by mail, and any cash offset. | Keep the terms dialog open and show progress. | Increment the revision, clear both confirmations, reload, and close the dialog. | Keep the dialog and values open for retry. |
| Confirm agreement | Either trader confirms the visible revision. | Disable duplicate confirmation. | Record that revision; when both match, advance to exchange. | Reload if the revision changed and show the error. |
| Complete exchange | Either trader confirms receipt through the existing action. | Show progress. | Preserve the existing two-person completion and rating flow. | Preserve the current exchange state and allow retry. |
| Cancel | A participant chooses cancel and confirms when required. | Disable duplicate cancellation. | Keep the existing cancelled history record. | Return to the current state with an error. |

## Navigation and responsive behavior

- Trade details keep their existing route, `/:locale/trade/:id`.
- Desktop shows two card piles with a narrow center balance and an action rail. The rail holds what to do next,
  how the trade settles, and the history, and sticks to the viewport as the main column scrolls.
- Chat is docked, not stacked. A handle fixed to the bottom-right corner opens it as a panel at the right edge,
  with no scrim, so the two card piles stay lit and readable while you write about them. On phone widths the
  same panel is a bottom sheet with a scrim. It is reachable from any scroll position and never takes the
  reader's place on the page.
- The chat panel stays mounted while the sleeve is shut, hidden and `inert`. That keeps its realtime
  subscription live, so the handle can count messages that arrive while it is closed, and an unsent draft
  survives closing it.
- The host closes the sleeve whenever it raises a dialog of its own, so a panel is never stranded behind a modal.
- Smaller screens stack card piles, totals, actions, settlement, photos, and history in reading order. Chat is not
  in that stack: it is the corner handle, and its sheet covers the page when opened.
- The proposals page files open trades by whose turn it is, not by who started them. `lib/proposalQueue.js` owns
  that split and derives it from the same `tradeNextAction` and `pendingWaitKey` the row's own button is built
  from, so a pile and the verb inside it cannot disagree. Who sent the proposal stays on the row as text.
- `proposalQueue.isYourMove` is the one definition of "waiting on you", and three surfaces read it: the first
  pile on the proposals page, the Trade Center's phone tab badge, and the account card's "Waiting on you" figure.
  `accountStats.test.js` fails if any of them drifts.
- The two open piles run oldest first — a queue of obligations, where the trade that has waited longest should
  not sink under this morning's. The two settled piles run newest first.
- Exactly one pile shows at a time, so its control is a segmented bar, not chips. Empty piles stay in place,
  disabled, and the bar becomes two rows of two below a 560px container so nothing is hidden behind a swipe.
- A proposal row is a strip: who and when and which stage on the first line, the two piles facing each other
  across the same seam the trade page draws, and one button saying the verb. Its prose line appears only when it
  says something the button does not. Below 620px of row width the piles stack with the seam between them; below
  780px the button moves under the cards instead of beside them.
- Proposal summaries and binder panes scroll horizontally when every card cannot fit. They show every card instead of replacing cards with a `+N` count. A proposal row's fan tightens its overlap as the pile grows so that eight cards still fit the column four sat in, before it falls back to scrolling.
- The proposals empty state carries a link into the matches tab rather than describing where one might be.
- Dense card lists keep headers and totals stable while the list area scrolls.
- Truncated card metadata retains its full value through the card detail or tooltip.
- The collection offers three views of one half: compact rows, card tiles, and the binder. The binder is the same
  `CardBinder` a trader's profile and the proposal dialog draw, opened on the whole open half rather than on one
  wishlist — a binder's pages are already its structure, and filtering it by list as well would nest a filter
  inside a filter inside a tab. View and order both persist in `localStorage`, and both are validated against the
  current option list on restore so a key from an older build cannot leave the page in a state it cannot draw.
- A collection row carries two metadata lines, because a copy is two separate facts: the printing (set code and
  rarity, monospace, per The Mono Identifier Rule) says which card object it is, and the state line (condition,
  language, and 1st Edition when true) says what state that copy is in. `first_edition` was stored from the
  beginning and rendered nowhere, which is what made a wrong entry invisible. It shows only when true.
- The quantity is a stamp at rest and a stepper when wanted: hovering the row on a fine pointer, or tapping the
  stamp on a touch one. A spinner on every row of a 200-card binder made the collection read as a form, and the
  locked state already proved a static count reads correctly.
- Correcting a copy reuses AddCard's second step field for field, so the form that recorded the mistake is the
  form that fixes it. Two rules live in `lib/cardCopy.js` rather than the dialog: moving a printing clears
  `cardmarket_product_id`, because that pin outranks every other price signal and was chosen for the old
  printing; and quantity cannot fall below the copies locked into accepted trades, the same floor the stepper
  enforces.
- Removing a copy is an explicit two-step action in that dialog. It used to be reachable only by decrementing the
  quantity to zero, which is a deletion disguised as arithmetic.
- The collection has an order. The fetch asks for no `.order()`, and an unordered scan promises nothing, so a
  pile could come back rearranged between loads; `sortCollection` supplies a total order client-side, and every
  comparator falls back to name and then id so rows that tie still land in the same place on every render.

## Async, validation, and permissions

- Mutations are pessimistic. Buttons show busy state and prevent duplicate submits.
- The server checks authentication, participant role, card ownership, availability, quantity, workflow stage, and revision.
- User 2 alone can complete return selection. During agreement, each trader can revise only cards owned by the other trader.
- Every card or term change increments `revision` and clears both agreement confirmations.
- Agreement confirmation includes the observed revision. A stale confirmation fails and reloads the trade.
- A failed dialog mutation preserves the form and selection for retry.
- Photos remain evidence, not an exchange-completion gate.
- There is no read state for `trade_message`: no `read_at`, no `last_read`. The sleeve's "N new" counts only what
  arrived while this page was open, and its copy says so. Persisting it needs a migration.

## Verification

- Static checks: focused Vitest workflow tests, full frontend tests, `git diff --check`, and a Vite client build.
- Database check: run Supabase database lint against a running local stack before applying the migration.
- Browser matrix: signed-in desktop and phone widths for selection, agreement, exchange, and a trade with more than five cards per side; signed-out route guard.
- Accessibility checks: keyboard traversal, visible focus, labelled selectors, dialog focus restoration, reduced motion, and no color-only state.
- Visual check: card images preserve `59 / 86`; chat opens from its corner handle rather than in the page header,
  and the two piles stay readable beside it; the stacked order is piles, actions, settlement, photos, history.

Current evidence, 2026-08-28:

- Workflow tests: 11 passed.
- Client production build: passed.
- Locale parsing and `git diff --check`: passed.
- Full frontend suite: 1,026 passed; one unrelated date-sensitive `people.test.js` assertion expects “week” after the fixture has aged into “month.”
- Premium strict audit: 25 existing project-wide findings; none point to the changed trade workflow files.
- Supabase lint: blocked because no local Docker/Postgres stack is running on port 54322.
- Browser check: the signed-out trade route renders its login guard without an error overlay. Authenticated state-matrix verification still needs a test session with staged trade data.

Deck copies, 2026-08-30:

- Full frontend suite: 1,146 passed, including 36 new copy-allocation and copy-counting tests.
- Client production build: passed, 30 of 30 routes and 777 prerendered pages.
- Browser check, signed in against a real 57-card deck: a card asked for twice against one copy held draws a
  half-amethyst rule and reads `1/2`; two of three draws two thirds and reads `2/3`; a card fully covered keeps
  its undivided amethyst rule and its `2×`. The strip and the deck tally moved to 7 owned, 23 sourced,
  27 missing, and the wishlist button fell from 34 to 27 — the seven copies now covered.
- Locale parity: 1,518 keys in each of the four files, no drift.
- Accessibility: the visible fraction is hidden from the accessibility tree and a written line stands in for it
  after the card name, so the split is never carried by colour alone. Verified in both themes.

Per-copy sourcing, 2026-08-30:

- Full frontend suite: 1,176 passed, including 22 encoding tests and 8 covering the counted mark.
- Client production build: passed, 30 of 30 routes and 777 prerendered pages.
- Migration, against the account's own 57-card deck: an existing 16-id mark loaded as 23 marked copies and the
  tally read 23 sourced / 34 missing — identical to before the change. One click rewrote the whole array in
  counted form, tagged, with 16 distinct cards and 23 copies still in it.
- Browser check: a two-of cycled 2 → 0 → 1 → 2, the strip and tally following each step (23/34 → 21/36 → 22/35
  → 23/34), the rule under the card splitting into one sourced and one missing segment at the halfway stop, and
  the entry correctly reading as missing while a copy was outstanding. The deck was left exactly as found.
- Keyboard: the mark is a real button, focusable, and becomes visible on focus rather than only on hover.

Near me and the meetup location, 2026-08-30:

- Full frontend suite: 1,186 passed, including 10 covering `settlementTerms`.
- Client production build: passed, 30 of 30 routes and 777 prerendered pages.
- Gap this closed: `LocationPicker` rendered only under `isEditing || isCountering`, both legacy paths, so a
  trade created through the staged workflow had no way to name a place. Trade 37 was live in exactly that state —
  `agreement` phase, `trade_method` `in_person`, `meetup_location` null. The database side already accepted it:
  `revise_trade_terms` writes the place and nulls it for mail, so no migration was needed.
- Browser check, matches: the button reads its place off the viewer's profile, fills both filters, narrows the
  list, shows `clear filters`, and un-fills on a second press. A profile country no match is in stays visible in
  its own select rather than leaving it blank next to an empty list. With no profile location the control is a
  link to the account page. On a phone the place is dropped from the label and kept in the accessible name.
- Browser check, terms: the dialog opens on the trade's current mode, a searched place lands with its address,
  and the payload derives as `in_person` with the place attached. Verified without saving — the trade was live
  with another trader's agreement on it, and saving would have cleared that. Trade 37 confirmed unchanged after.
- Not fixed here: `.mobile-bottom-nav` overflows a 375px viewport by 49px on every page. Pre-existing and
  app-wide, so it is raised separately rather than folded into this change.
- Sitemap: the committed file held 16 card pages, the exact length of the `TOP_CARD_IDS` fallback that
  `generate-sitemap.mjs` uses when Supabase is unreachable — so a degraded run had been committed. Regenerated
  from `get_trending_cards`: 194 card pages, 771 URLs. The build's own check confirms every URL has a
  prerendered page behind it and no duplicates. Worth watching: a sitemap generated without database access
  silently shrinks to 16 cards rather than failing.

Cardmarket links, 2026-08-31:

- Full frontend suite: 1,226 passed across 67 files, including 40 link-building tests.
- Fixed in passing: the trade page and the card page both searched the full print code ("RA04-EN024"), which
  Cardmarket files nothing under, so those links returned no results at all.
- Client production build: passed, 30 of 30 routes, 777 prerendered pages, 771 sitemap URLs all backed by a page.
- Locale parity: 1,522 keys in each of the four files, no drift.
- Every Cardmarket URL in the app is built by this module; nothing hand-builds one. Checked by grep: the
  literal `cardmarket.com` appears in `src/` exactly once, as the module's own `ORIGIN`.
- Browser check, signed in, against real data. Collection binder: all 27 cards resolve to `kind: "product"`;
  Aleister the Invoker (RA04-EN024, Collector's Rare) resolves to `idProduct=820817` — the V.6 Collector's
  Rare, one of nine products for that card in that one set, confirmed against the live product page earlier in
  the session. Trade 37: both cards resolve by id with the reader's `sellerCountry=4`. Card page
  (Tour Guide From the Underworld): per-printing rows link by id where the printing resolves to one product —
  BLGG-EN005 at two rarities gives two different ids — and to `searchString=ra05-090` where it does not.
- Two links that stay a search, on purpose. `PrintingPicker` is open precisely because the printing is not yet
  known, so there is no id to link to. The card page's JSON-LD offers use the deterministic search form
  because that page is prerendered and prices load after mount; an id-based URL there would differ between the
  prerendered HTML and the hydrated page. The card page also omits `sellerCountry`, for the same reason — it
  is a public page with no session at build time.
- Seller-country and language ids were read from the `sellerCountry[N]` / `language[N]` checkbox labels on a
  live product page, and `minCondition` from its own select (which does number Poor 7; the app still omits it,
  because "at least Poor" excludes nothing).
- Not verified: that Cardmarket visibly applies these parameters on the rendered page. cardmarket.com began
  serving its challenge page to this environment after earlier requests and did not clear; the check was
  abandoned rather than worked around. The parameter names, ids and spelling are the site's own, taken from its
  markup and from a working URL supplied by the repo owner.
- Rejected on evidence, recorded so it is not retried: building the product path from name and version label.
  Sixteen slugs were generated and fetched — eleven right, five wrong, and all five returned 200 while
  silently serving the expansion listing. The same card's printings use `Dragon-s-Fighting-Spirit-V-2`,
  `Dragons-Fighting-Spirit-V-3-Secret-Rare` and `Dragons-Fighting-Spirit` across three expansions. The
  `idProduct` route makes the whole question moot.
