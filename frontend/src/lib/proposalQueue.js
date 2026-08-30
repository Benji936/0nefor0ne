/**
 * Which pile of the proposals page a trade belongs in, and whose turn it is.
 *
 * This replaces proposalFilters.js, which grouped by who *started* the trade:
 * "Incoming" was every pending proposal somebody sent you, "Outgoing" every one
 * you sent. That was true of the old flow, where a proposal sat still until the
 * recipient answered it, so who sent it and who was blocking were the same
 * person.
 *
 * The staged workflow (20260828132059_staged_binder_trade_workflow.sql) broke
 * that. A trade in agreement waits on whichever trader has not confirmed the
 * current revision, and that can be either of them, on any revision. So a trade
 * you started and which is now waiting on *you* was filed under "Outgoing" —
 * a heading that means "waiting for the other side to respond" — while its own
 * footer said "Confirm agreement". The page and the row contradicted each
 * other, and the page was the one people read first.
 *
 * Grouping by turn instead. Who sent it is still worth knowing, so it stays on
 * the row as a line of text; it just stops deciding which pile the trade is in.
 */

import { tradeNextAction } from "./tradeWorkflow";
import { pendingWaitKey } from "./tradePending";

/**
 * Pile order, and the order `resolveGroup` falls through: what you owe someone
 * an answer on, then what you are owed, then what is over.
 */
export const QUEUE_GROUPS = ["yours", "theirs", "done", "closed"];

/** A finished trade. An accepted trade is an agreement, not an exchange. */
export function isDone(status) {
  return status === "completed";
}

/**
 * A trade that will not happen. Declined and cancelled share a pile because
 * from the trader's side they are the same fact — it is over and nothing
 * changed hands. The row keeps its own status word, so a declined trade still
 * reads as declined inside the pile.
 */
export function isClosed(status) {
  return status === "cancelled" || status === "declined";
}

/** Still live: something could still happen to it. */
export function isOpen(status) {
  return status === "pending" || status === "accepted";
}

/**
 * Whether this trade is waiting on the person reading the page.
 *
 * Derived from the same two functions the row's own button is built from —
 * tradeNextAction for staged trades, pendingWaitKey for legacy ones — so the
 * pile a trade is filed in and the verb on its button cannot disagree.
 *
 * @param {object} proposal a row from fetch_my_proposals
 * @returns {boolean}
 */
export function isYourMove(proposal) {
  const status = proposal?.status;

  // Exchange. Confirming receipt is the one thing left that is yours to do;
  // photos are evidence rather than a gate (see tradePending.js), so a missing
  // one does not make an already-confirmed trade your move again.
  if (status === "accepted") return !proposal?.i_confirmed;

  if (status !== "pending") return false;

  const action = tradeNextAction(proposal);
  if (action === "chooseReturnCards") return true;   // selection, you are user 2
  if (action === "confirmAgreement")  return true;   // agreement, on this revision
  // Legacy proposals, which have no workflow_phase. Answering is yours, and so
  // is adding the photo of your own cards that the other side is waiting to see.
  if (action === "reviewTrade") {
    return ["yoursToReview", "photoYoursMissing"].includes(pendingWaitKey(proposal));
  }
  return false;
}

/**
 * The pile a single trade belongs to.
 *
 * @returns {"yours"|"theirs"|"done"|"closed"}
 */
export function queueGroup(proposal) {
  const status = proposal?.status;
  if (isDone(status))   return "done";
  if (isClosed(status)) return "closed";
  return isYourMove(proposal) ? "yours" : "theirs";
}

const asTime = (row) => {
  const t = Date.parse(row?.created_at ?? "");
  return Number.isNaN(t) ? 0 : t;
};

/**
 * Every proposal, sorted into the four piles.
 *
 * Open piles run oldest first. A queue of obligations is not an inbox: the
 * trade that has been sitting longest is the one somebody has been waiting on
 * longest, and it should not sink under things that arrived this morning. The
 * two finished piles run newest first, because there the question is "what
 * happened lately".
 *
 * @param {Array<object>} proposals
 * @returns {{yours: Array, theirs: Array, done: Array, closed: Array}}
 */
export function groupProposals(proposals = []) {
  const piles = { yours: [], theirs: [], done: [], closed: [] };
  for (const p of proposals ?? []) piles[queueGroup(p)].push(p);
  piles.yours.sort((a, b) => asTime(a) - asTime(b));
  piles.theirs.sort((a, b) => asTime(a) - asTime(b));
  piles.done.sort((a, b) => asTime(b) - asTime(a));
  piles.closed.sort((a, b) => asTime(b) - asTime(a));
  return piles;
}

/** How many trades each pile holds, keyed the way the segmented bar reads it. */
export function queueCounts(piles) {
  return Object.fromEntries(QUEUE_GROUPS.map((k) => [k, piles?.[k]?.length ?? 0]));
}

/**
 * The pile to actually show.
 *
 * Keeps the reader's choice while it still has rows, so a background refresh
 * cannot move somebody off the pile they are reading. Otherwise falls to the
 * first pile in QUEUE_GROUPS that has anything, and to null only when there are
 * no trades at all — which the empty state handles instead of a blank list
 * under a segment reading 0.
 *
 * @param {Record<string, number>} counts
 * @param {string|null} current
 * @returns {string|null}
 */
export function resolveGroup(counts = {}, current = null) {
  if (current && counts[current] > 0) return current;
  return QUEUE_GROUPS.find((key) => counts[key] > 0) ?? null;
}
