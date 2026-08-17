/**
 * Which group of proposals the trade centre is showing.
 *
 * There used to be an "All" chip, selected by default, which stacked every
 * section on one page. It was the only filter most people ever saw, so the
 * other four were decoration on top of a list you still had to scroll. Without
 * it exactly one group shows at a time, and the chips become the navigation
 * they were drawn as.
 *
 * Losing "All" means something has to choose the opening group, and that a
 * group emptying under you has to be handled — you can no longer fall back to
 * a filter that shows everything. Both are `resolveFilter`.
 */

/**
 * Chip order, and the order `resolveFilter` falls through.
 *
 * Deliberately "what needs you" first and "what is over" last: incoming
 * proposals are the only group where somebody is waiting on an answer.
 */
export const PROPOSAL_FILTERS = ["incoming", "outgoing", "accepted", "done", "cancelled"];

/**
 * A finished trade. Nothing else counts as done — an accepted trade is an
 * agreement, not an exchange, until both sides confirm.
 */
export function isDone(status) {
  return status === "completed";
}

/**
 * A trade that will not happen.
 *
 * `declined` lives here rather than in a chip of its own. The ask was for two
 * groups, and from the trader's side a proposal the other person refused and
 * one they withdrew are the same fact: it is over and nothing was exchanged.
 * The rows keep their own status pill, so a declined trade still reads as
 * "Declined" inside the group.
 */
export function isCancelled(status) {
  return status === "cancelled" || status === "declined";
}

/**
 * Split what used to be one "History" list into the two groups above.
 *
 * @param {Array<{status?: string}>} history
 * @returns {{ done: Array, cancelled: Array }}
 */
export function splitHistory(history = []) {
  return {
    done:      history.filter(p => isDone(p?.status)),
    cancelled: history.filter(p => isCancelled(p?.status)),
  };
}

/**
 * The filter to actually show, given what each group holds.
 *
 * Keeps the current choice while it still has rows, so a background refresh
 * cannot move somebody off the group they are reading. Otherwise falls to the
 * first group in PROPOSAL_FILTERS that has anything, and to null only when the
 * trader has no proposals at all — which the empty state handles instead.
 *
 * @param {Record<string, number>} counts
 * @param {string|null} current
 * @returns {string|null}
 */
export function resolveFilter(counts = {}, current = null) {
  if (current && counts[current] > 0) return current;
  return PROPOSAL_FILTERS.find(key => counts[key] > 0) ?? null;
}
