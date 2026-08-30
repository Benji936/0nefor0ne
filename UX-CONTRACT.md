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
| Suggest terms | Either trader changes method or cash offset. | Keep the terms dialog open and show progress. | Increment the revision, clear both confirmations, reload, and close the dialog. | Keep the dialog and values open for retry. |
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
