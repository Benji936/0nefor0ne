/**
 * The numbers behind the Account page's activity panel: how many decks, how
 * much collection, how many trades in flight — and a link into the page that
 * owns each one.
 *
 * Every one of these numbers is already computed somewhere else in the app.
 * The point of this module is that it does not compute them a second way: the
 * collection counts come from onboarding's pile counter, and the proposal
 * counts use the same expressions the Trade Center uses for its own tab badge
 * and its own history filter. A stat that disagrees with the page it links to
 * is worse than no stat, and the only way to prevent that is to share the
 * predicate rather than to write a matching one and hope.
 */
import { getClient } from "./supabaseClient";
import { fetchPileCounts } from "./onboarding";
import { fetchMyProposals } from "./proposals";
import { isYourMove } from "./proposalQueue";

/**
 * How many decks this user has saved.
 *
 * Count-only: DecksPage fetches whole rows because it draws them, but nothing
 * here needs more than the number. Returns `null` rather than 0 when the read
 * fails, matching fetchPileCounts, so the panel can say it could not ask
 * instead of asserting that somebody has no decks.
 *
 * @param {string} userId
 * @returns {Promise<number|null>}
 */
export async function fetchDeckCount(userId) {
  if (!userId) return null;
  const { count, error } = await getClient()
    .from("decks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) {
    console.error("accountStats: could not count the decks", error);
    return null;
  }
  return count ?? 0;
}

/**
 * Trades whose next move is this user's.
 *
 * This was `pending && !i_am_proposer` — every proposal somebody sent you —
 * and it agreed with the Trade Center badge because the badge said the same
 * thing. Both were wrong once the staged workflow landed: a trade you sent can
 * be waiting on you to confirm a revision, and an accepted trade waits on your
 * half of the receipt. The card's own label reads "Waiting on you", so the
 * number under it now counts what is actually waiting on you.
 *
 * The definition lives in proposalQueue.isYourMove, which is also what the
 * proposals page files its piles by and what the row's button verb comes from.
 * Three surfaces, one answer.
 *
 * @param {Array<object>} proposals rows from fetch_my_proposals
 * @returns {number}
 */
export function awaitingAnswerCount(proposals) {
  return proposals.filter(isYourMove).length;
}

/**
 * Trades still live: pending in either direction, plus accepted.
 *
 * The complement of TradeCenter's `history()`. A bare `proposals.length` looks
 * right here and is wrong — it counts declined, cancelled and completed trades
 * as open.
 *
 * @param {Array<{status: string}>} proposals
 * @returns {number}
 */
export function openTradesCount(proposals) {
  return proposals.filter((p) => ["pending", "accepted"].includes(p.status)).length;
}

/**
 * A guard against a slow load painting over a fresher one.
 *
 * Account's session watch runs with `{ immediate: true }`, so it fires twice on
 * an ordinary signed-in load — once with no id, then with the real one — and
 * two loads overlap. On a sign-out or an account switch the stakes are higher
 * than a flicker: a read started by the previous user could land afterwards and
 * repaint their numbers. Each load claims a generation; each result checks that
 * its generation is still the newest before it is allowed to be written.
 *
 * @returns {{next: () => number, isCurrent: (token: number) => boolean}}
 */
export function createStatsGeneration() {
  let current = 0;
  return {
    next: () => ++current,
    isCurrent: (token) => token === current,
  };
}

/** A source that failed, in the one shape every caller handles. */
const ERROR_GROUP = { status: "error", data: null };
/** No session: nothing was asked, and nothing is pending. */
const GUEST_GROUP = { status: "guest", data: null };

/**
 * Start all three stat reads and hand back one promise per group.
 *
 * Synchronous on purpose. It returns a map of promises rather than awaiting
 * them, so each group leaves its loading state the moment its own source
 * settles and one slow or broken source cannot hold up — or blank — the other
 * two. A `Promise.all` here would reject the whole batch on a single failure,
 * which is the one thing this panel must not do.
 *
 * No promise in the map ever rejects and this function never throws:
 * fetchMyProposals throws where the other two return null, and that asymmetry
 * is flattened here so the component sees one contract. `data` is null for
 * anything that is not `ready`, so a failed group has no number to render by
 * accident.
 *
 * A falsy userId fires no requests at all and settles every group to `guest` —
 * settled rather than left pending, so a signed-out visitor cannot be shown a
 * skeleton that never resolves.
 *
 * @param {string|null|undefined} userId
 * @returns {{
 *   decks:      Promise<{status: string, data: {count: number}|null}>,
 *   collection: Promise<{status: string, data: {tradeCount: number, wishCount: number}|null}>,
 *   proposals:  Promise<{status: string, data: {awaiting: number, open: number}|null}>,
 * }}
 */
export function loadAccountStats(userId) {
  if (!userId) {
    return {
      decks:      Promise.resolve(GUEST_GROUP),
      collection: Promise.resolve(GUEST_GROUP),
      proposals:  Promise.resolve(GUEST_GROUP),
    };
  }

  const decks = fetchDeckCount(userId)
    .then((count) => (count === null ? ERROR_GROUP : { status: "ready", data: { count } }))
    .catch(() => ERROR_GROUP);

  const collection = fetchPileCounts(userId)
    .then((counts) => (counts === null ? ERROR_GROUP : { status: "ready", data: counts }))
    .catch(() => ERROR_GROUP);

  const proposals = fetchMyProposals()
    .then((rows) => ({
      status: "ready",
      // `total` is what separates "has never traded" from "has nothing open
      // right now": a user with four completed trades and none in flight must
      // get zeroes, not an invitation to make their first trade.
      data: { awaiting: awaitingAnswerCount(rows), open: openTradesCount(rows), total: rows.length },
    }))
    .catch(() => ERROR_GROUP);

  return { decks, collection, proposals };
}
