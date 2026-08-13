---
title: Add community billing section with in-app plan visibility and cancellation
---

## Initial User Prompt

We need also a billing section for communities as well as a way to cancel their plan.

### Clarified scope (agreed with the user before drafting)

Community billing and cancellation are **not** greenfield — a survey of `main` found
working infrastructure already in place, and the user confirmed the gap is the
*surface*, not the plumbing:

> "A real billing section, not one button" — today the only billing UI is a
> single "Manage subscription" link buried in the account page's community row,
> which redirects straight to Stripe.

What owners cannot see without leaving the site: what plan they are on, what it
costs, which billing interval they chose, when it renews, or whether it is
already set to cancel.

Wanted: a real billing section for communities — current plan, price and
interval, renewal or cancellation date, payment method summary, and invoice
history — plus a clear way to cancel the plan and to reactivate before period
end. The Stripe Customer Portal stays as the deep link for card changes and
invoice PDFs rather than being the entire billing experience.

---

## Description

Owners of a claimed community pay a recurring subscription (yearly or monthly,
priced per currency by `communityPricing()`), but the product tells them almost
nothing about it. The account page renders one "Manage subscription" button per
verified community that redirects to the Stripe Customer Portal. Everything an
owner might want to know — plan, price, interval, next charge date, whether the
plan is already cancelling — is only visible on Stripe's domain, and only after
a round trip.

This task builds a billing section owners can read on our own pages, and lets
them cancel and reactivate without leaving the site.

**The blocking discovery:** the data needed to render such a section is not
mirrored. `stripe-webhook` writes five fields to `community_claim`, and none of
them distinguishes a renewing subscription from one that is already scheduled to
end. Stripe keeps `status: "active"` after a cancellation is scheduled and only
flips it to `canceled` at period end, so `current_period_end` is today an
unlabelled date that means "next charge" *or* "access ends" with no way to tell
which. A billing panel built on the current schema would show a confident,
wrong sentence to every owner mid-cancellation.

So the work is a data change first and a UI change second.

### In scope

- Mirroring the subscription facts needed to describe a plan truthfully
- A billing section showing plan, price, interval, and a correctly-labelled
  renewal *or* end date
- In-app cancel (at period end) and reactivate-before-period-end
- Correct handling of communities paid through a Discord Guild Subscription,
  which have no Stripe customer at all

### Out of scope

- Changing prices, plans, currencies, or free-trial lengths
- Plan switching (monthly ↔ yearly) in-app — the portal keeps that
- Invoice PDFs and card editing — the portal keeps those; we deep-link
- Refunds, proration, dunning UI, or tax handling
- Anything touching the Discord Guild Subscription billing path itself

---

## PDCA Cycle 1

Scoped deliberately small per PDCA: make the plan state *legible and truthful*,
and make cancellation reversible. Payment-method summary and invoice history are
deferred to Cycle 2 because both need data we do not hold and would otherwise
stall the part the user actually asked for.

### PLAN

**Problem**
An owner cannot answer "what am I paying, and when does it renew?" without
leaving the site, and the product cannot answer "is this plan ending?" at all.

**Current state (baseline, measured against `main`)**

| Fact an owner wants | Stored today? | Renderable today? |
|---|---|---|
| Plan is active | `subscription_status` | Yes |
| Billing interval | `billing_interval` (`month`/`year`) | Yes |
| Price | Derivable via `communityPricing()` + `formatPrice()` | Yes |
| Next charge date | `current_period_end` | Ambiguous — see below |
| Already cancelling? | **No column** | **No** |
| Card brand / last4 | No | No |
| Invoice history | No | No |

Billing UI surface on `main`: one button, [Account.vue:386](frontend/src/components/Pages/App/Account.vue:386).
Owner-facing billing facts visible without leaving the site: **0**.

**Root cause**
`stripe-webhook` mirrors only what ownership decisions needed. Ownership needs
`status`; it never needed to know *why* a still-active subscription would end.
`cancel_at_period_end` was therefore never mirrored, and `current_period_end`
was stored without the flag that gives it meaning. The thin UI is a symptom:
there was nothing truthful to render.

**Hypothesis**
If we mirror `cancel_at_period_end` and surface the mirrored facts as a billing
panel with an in-app cancel/reactivate flow, owners can answer every plan
question without leaving the site, and no owner is ever shown a renewal date for
a subscription that is actually ending.

**Change**

1. **Schema** — add `cancel_at_period_end boolean` to `community_claim`, frozen
   in `community_claim_guard()` exactly like every other billing column
   (a claimer who could write it could make the page promise a renewal that will
   never happen). Backfill `false` where a subscription exists.
2. **Webhook** — mirror `sub.cancel_at_period_end` alongside the existing five
   fields. It arrives on the `customer.subscription.updated` event that Stripe
   already sends when a cancellation is scheduled *or* undone, so no new event
   subscription is needed.
3. **Read path** — extend `fetchMyClaimSources()` (or a sibling) to return the
   full billing shape per community, not just `{ stripe, discord }`.
4. **Cancel / reactivate Edge Function** — a `claim-cancel` function taking
   `{ community_id, action: 'cancel' | 'reactivate' }`, owner-checked the same
   way `claim-portal` is, calling `stripe.subscriptions.update(id,
   { cancel_at_period_end: true | false })`. Stripe emits the update event, and
   the existing webhook mirrors the result — the function never writes the
   claim row itself, preserving the "webhook is the only writer" invariant.
5. **UI** — a billing section per owned community showing plan, price+interval,
   and a date labelled from `cancel_at_period_end`: *"Renews on X"* vs
   *"Ends on X — reactivate before then to keep it"*. Cancel and Reactivate
   buttons; portal demoted to a secondary "Manage card and invoices" link.
6. **Discord-paid communities** — keep the existing separate branch; the panel
   states that billing is handled in Discord and links there rather than showing
   an empty plan.

**Success criteria (measurable)**

| # | Criterion | Measure |
|---|---|---|
| 1 | Owners can read their plan without leaving the site | Plan, price, interval and a labelled date all render from mirrored data — 4 facts, was 0 |
| 2 | A cancelling subscription never shows a renewal date | Test: claim row with `cancel_at_period_end = true` renders "Ends on", not "Renews on" |
| 3 | Cancel is reversible in-app | Test: cancel then reactivate returns the row to `cancel_at_period_end = false` and the copy to "Renews on" |
| 4 | The claim row stays webhook-owned | Test: `claim-cancel` issues no write to `community_claim`; a client UPDATE of `cancel_at_period_end` is nulled by the guard |
| 5 | Discord-paid communities show no dead controls | Test: a community with `discord_entitlement_at` and no `stripe_subscription_id` renders the Discord branch, no cancel button |
| 6 | No regression in ownership | Existing `stripe-webhook` grant/lapse tests still pass |

**Risks**

| Risk | Mitigation |
|---|---|
| Mirrored state drifts if a webhook delivery is lost | The panel reads mirrored data but the portal remains the source of truth for edits; consider a "last synced" read in Cycle 2 |
| `cancel_at_period_end` true on a `past_due` subscription | Treat status as the outer label and the flag as the modifier; enumerate the combinations in tests rather than assuming two states |
| Cancelling the last community leaves an owner mid-flow | Copy must state what is lost and when — content is kept, the badge and ownership revert per `claim.origin` (see `stripe-webhook` header) |

**Known defect found while surveying (fix alongside, cheap)**
`claim-portal` hardcodes `return_url` to `/en/community/{slug}`, so a French,
German or Italian owner returns from Stripe onto the English page. Should use
the caller's locale.

### DO

Implemented as planned, in the planned order. Files touched:

| # | File | Change |
|---|---|---|
| 1 | `supabase/migrations/20260813_claim_cancel_at_period_end.sql` | **new** — adds `cancel_at_period_end`, backfills `false` where a subscription exists, re-declares `community_claim_guard()` with the column frozen |
| 2 | `supabase/functions/stripe-webhook/index.ts` | mirrors `sub.cancel_at_period_end`, coerced to a boolean |
| 3 | `supabase/functions/claim-cancel/index.ts` | **new** — owner-gated cancel/reactivate; writes nothing to the claim row |
| 4 | `frontend/src/lib/communityBilling.js` | **new** — pure state machine + date formatting |
| 5 | `frontend/src/lib/community.js` | `fetchMyClaimSources()` returns the billing shape; `setSubscriptionCancellation()` added; `openBillingPortal()` takes a locale |
| 6 | `frontend/src/components/community/CommunityBillingLine.vue` | **new** — the panel |
| 7 | `frontend/src/components/Pages/App/Account.vue` | row restructured into `.acct-item`; lone button and its `billingBusy`/`manageSubscription` removed |
| 8 | `frontend/src/locales/{en,fr,de,it}.json` | 17 keys each |
| 9 | `frontend/src/lib/communityBilling.test.js` | **new** — 16 tests |
| 10 | `supabase/functions/claim-portal/index.ts` | `return_url` follows the caller's locale (the defect noted in PLAN) |

**Deviations from plan:** one. The plan proposed extending `fetchMyClaimSources()`
"or a sibling"; it was extended in place, keeping the `stripe`/`discord`
booleans so nothing that already read them had to change.

**Unplanned addition:** the locale whitelist in `claim-portal`. `return_url`
feeds a redirect Stripe performs, so accepting the body value unchecked would
have turned a copy fix into an open redirect wearing our own domain.

### CHECK

| # | Criterion | Result |
|---|---|---|
| 1 | Plan readable without leaving the site | **Met** — plan, price, interval and a labelled date render from mirrored data. 4 facts, was 0 |
| 2 | A cancelling subscription never shows a renewal date | **Met** — enforced in `billingState()`, covered by two tests that both carry status `active` |
| 3 | Cancel is reversible in-app | **Met** in logic — `canReactivate` is true exactly while a cancellation is pending, false once it has actually ended |
| 4 | Claim row stays webhook-owned | **Met** — `claim-cancel` issues no write to `community_claim`; the column is frozen in the guard |
| 5 | Discord-paid communities show no dead controls | **Met** — test asserts all three actions are unavailable |
| 6 | No ownership regression | **Met** — 492 tests pass (was 476), full SSG build passes 30/30 routes |

**Not verified, and worth stating plainly:**

- **The rendered panel has never been seen.** The account page is behind auth,
  and I did not sign in. What was verified: the dev server serves the page with
  zero console errors, and the compiled component plus its four locale strings
  are present in the built bundle — so it compiles and ships. Whether it *looks*
  right at each state is unconfirmed.
- **No component test exists** because the project has no component-test tooling
  at all (`@vue/test-utils` is absent and there is not one `mount()` in the
  suite). Adding that dependency mid-implementation was not mine to decide, so
  the render path is covered by inspection only.
- **Nothing has been run against Stripe.** No subscription was cancelled or
  reactivated end to end. The webhook change, the new function and the migration
  are all unexercised against the real service.
- **The migration has not been applied.** The file is written; nothing was run
  against the database.

**Known limitation shipped deliberately:** the price shown is derived from the
current price table, not mirrored from the subscription. It is correct today —
there has only ever been one price per currency per interval — but it describes
what the plan *would* cost rather than what this subscriber is charged, so it
would begin lying the day a price changes or anyone is grandfathered. Flagged in
a comment at the computed property, and promoted to Cycle 2 below.

### ACT

**Standardise:**
- `billingState()` is now the only sanctioned way to read subscription state in
  the UI. `fetchMyClaimSources()`'s doc comment says so, as does the field
  comment in `Account.vue`, because the failure mode is silent and re-inventable.
- The "webhook is the only writer" invariant survived a second writer being
  added next to it, and the reasoning is recorded in `claim-cancel`'s header.

**Carry into Cycle 2** — now three items, not two:
1. Payment method summary (deferred in PLAN)
2. Invoice history (deferred in PLAN)
3. **Mirror the real charged amount** (`unit_amount` + `currency` off the
   subscription's price) — newly identified, and the cheapest of the three since
   it rides the same event already being handled

**Before this can be called done:** apply the migration, deploy the two
functions, and run one real cancel-then-reactivate against a live subscription.
That is the evidence Cycle 1's hypothesis actually needs and does not yet have.

---

### Addendum — defect found after DO, fixed

Raised by the owner: *"I can't check, I've made my subscription via Discord."*
Trying to look at the panel through the Discord door exposed a real bug in the
first implementation, not just a missing display.

**The bug.** `stripe_subscription_id` is never cleared. `stripe-webhook` writes
it on every event including the cancellation, so `claim.stripe` — defined as
`!!stripe_subscription_id` — stays true forever once somebody has ever
subscribed. The first `billingState()` checked `claim.discord && !claim.stripe`
before anything else, so the Discord branch was unreachable for any community
that had ever touched Stripe. An owner who cancelled their card and now pays
through a Guild Subscription was told **"This subscription has ended"** while
their community sat there verified: the page contradicted the badge beside it,
and disagreed with `recompute_community_verified`, which has accepted either
source since 20260809.

**Why the original test did not catch it.** It asserted the Discord preference
using `stripe: false` — a state that does not occur once a subscription exists.
The test passed and the real path was broken. Replaced with a case built on
`stripe: true`, and verified to fail against the old precedence before being
kept.

**The fix.** `billingState()` now asks Stripe *whether it is currently paying*
rather than whether it exists. Stripe wins only while active, trialing,
cancelling or past due; otherwise Discord is consulted. Split into a
`stripeState()` helper so the two questions cannot be conflated again.

**Also added,** since the Discord door had nothing behind it: the panel now
names the source and dates it — "Active through Discord · Since 1 July · Your
Guild Subscription pays for this. Cancel or change it in Discord's subscription
settings." `discord_entitlement_at` is written once on the transition into the
entitlement and nulled when it ends, so it is a start date, not a freshness
stamp — the copy says "since" for exactly that reason.

Tests: 22 in this file (was 16), 498 in the suite (was 492). Build still clean.

**Carried into Cycle 2:** every state above is still unseen in a browser, and
now that includes the Discord path the owner actually uses.

### Addendum 2 — "tell them to cancel in Discord"

The Discord state had no control at all where the Stripe path has a Cancel
button. Absence reads as "there is no way out" rather than "the way out is
elsewhere", so a note now occupies that slot: a dashed, non-pressable label
reading **Cancel in Discord** with the Discord glyph, alongside the fuller
sentence in the status line. Not a button, because there is genuinely nothing
for us to call — a control that only explains itself is worse than a label.

Two defects fixed while adding it, neither of which any test or build would have
caught:

1. **The panel's buttons were unstyled.** They carried `.acct-linkbtn`, which is
   defined inside Account.vue's `<style scoped>`. Scoped styles reach a child
   component's root element and nothing inside it, so all three buttons would
   have shipped as bare browser buttons. The rules now live in the component as
   `.cbl-btn`.
2. **`mdi-discord` renders as an empty box** — the glyph is absent from the
   bundled webfont. `CommunityVerifyPage.vue` had already hit this and left a
   note; `PlatformIcon` draws it inline instead.

Also removed: `community.billedViaDiscord`, orphaned in all four locales when
the lone button it labelled was replaced.

**Reinforces the CHECK finding.** Both defects compile, pass 498 tests and clear
the SSG build, and are visible only by looking at the page. The absence of
component-test tooling is not a cosmetic gap in coverage here — it is the reason
this class of bug reaches production.

### Addendum 3 — migration applied, and a security near-miss

The owner opened the page and saw **"No subscription."** on a community that is
verified and paid.

**Two defects, one visible.**

1. *The cause.* The migration had not been applied, so the read named a column
   that did not exist and PostgREST rejected the whole query.
2. *The one that mattered.* `fetchMyClaimSources()` caught that error and
   returned `{}` — indistinguishable from "no claim rows exist" — which the
   panel rendered as the flat assertion **"No subscription."** A dropped query
   became a statement about somebody's money, directly beneath their own
   verified badge. It now returns `null` on failure; `Account.vue` keeps that
   apart from an empty result and the panel says *"Couldn't load billing
   details"* and hides every action, because each one would operate on a
   subscription whose state we do not know. New key: `community.billingUnavailable`.

**The near-miss.** Before applying, the live `community_claim_guard()` body was
read from `pg_proc.prosrc` — as 20260809's header instructs, having been burned
once. The file's body, written from 20260808, was missing the
`discord_entitlement_at` freeze that 20260809 added a day later. `CREATE OR
REPLACE` swaps the whole function, so applying it would have **removed that
freeze**, letting any authenticated client PATCH the column on their own claim
row. `recompute_community_verified` accepts it as proof of payment: a free
verified community for anyone who looked. The file was rebuilt from prosrc and
the freeze sets diffed programmatically — nothing lost, exactly
`cancel_at_period_end` added on each branch — before anything ran.

**Applied** as `claim_cancel_at_period_end`. Verified after: the column exists as
`boolean`, and the guard still freezes `discord_entitlement_at` on both INSERT
and UPDATE.

**Criterion 6 now has real evidence.** The owner's live row is
`stripe_subscription_id` present, `subscription_status = 'canceled'`,
`discord_entitlement_at = 2026-08-09`, `verified = true` — the stale-Stripe
fallback case, in production, on the only owned community there is. The original
code would have told them their subscription had ended.

**Lesson for the process, not just this task:** every defect in Addenda 1–3 was
invisible to the build and the test suite. Three of them needed somebody to open
the page; one needed reading production's schema. Neither is a step this plan
had.

### Addendum 4 — portal withheld on the Discord path

Clicking **Card and invoices** on the Discord-paid community returned a 500 and
an error box. Owner's decision: hide the button when billing runs through
Discord. Done — `hasPortal()` now also requires the state not to be `DISCORD`,
so that row shows only the `Cancel in Discord` note.

Two supporting fixes:

- **`hasPortal()` was gated on the wrong column.** It checked
  `stripe_subscription_id`; `claim-portal` opens against `stripe_customer_id`.
  They usually agree, but an abandoned checkout leaves a customer with no
  subscription — a button that 409s, which is exactly what
  `fetchMyClaimSources`'s original comment exists to prevent.
- **The failure reason was thrown away twice.** `claim-portal` returned `detail`
  without logging it, so `function_logs` held nothing useful, and the client
  discarded the body in favour of a generic alert — undoing the work
  `lib/edgeFunction.js` does specifically to recover error bodies supabase-js
  drops. Both now log.

**Left undiagnosed, deliberately:** the 500 itself. The claim row has a live
`stripe_customer_id` (`cus_V1ka…`), so the function reached Stripe and Stripe
refused; hiding the button removes the symptom for Discord-paid communities but
a card-paying owner would still hit it. Leading hypothesis is that the Stripe
Customer Portal has no saved configuration in the Dashboard, which matches this
feature's go-live having been gated on Stripe setup. Second candidate is a
test/live key mismatch against that customer. Both are settings rather than
code. **This must be resolved before anyone subscribes by card.**

---

## PDCA Cycle 2 (planned, not started)

**Problem to address next:** payment method summary and invoice history, the two
Cycle 1 deferrals.

Both need data we do not hold. Two candidate approaches to decide between when
Cycle 1 is measured:

- **Mirror more** — store card brand/last4 from the subscription's default
  payment method, and recent invoice rows, via additional webhook events
  (`invoice.paid`, `payment_method.attached`). Fast to render, more state to
  keep honest.
- **Read live** — an Edge Function that fetches invoices and the payment method
  from Stripe on demand. Always accurate, slower, and adds a Stripe dependency
  to a page load.

Recommendation deferred: Cycle 1 will show whether mirrored billing state drifts
in practice, which is the deciding evidence.
