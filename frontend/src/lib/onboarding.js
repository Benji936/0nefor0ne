/**
 * First-run state.
 *
 * Everything this app shows is derived from cards the user has entered: a match
 * is your trade pile intersected with somebody else's wish list. An account
 * with nothing in it therefore has nothing to show anywhere — Matches,
 * Proposals and the collection are all empty by construction — and no amount of
 * explaining the navigation changes that. So the first run is not a tour of the
 * chrome, it is the shortest path to a populated account.
 *
 * Which is why `needsOnboarding` is answered from the cards rather than from a
 * "seen it" flag. A flag can read "done" for an account that is still empty,
 * and acting on it would drop somebody into an app with nothing in it — the
 * exact state the flow exists to prevent.
 *
 * The skip is stored separately and *only* suppresses the automatic redirect.
 * Somebody who deliberately signed up to browse should not be herded back here
 * every time they log in, but /start stays reachable, and the empty states
 * still link to it.
 */

import { getClient } from "@/lib/supabaseClient";

/** Ordered step ids. `done` is the payoff screen, not a task. */
export const STEPS = ["trade", "wish", "done"];

/** localStorage key for "stop redirecting me here". Device-local by design: it
 *  is a preference about one browser's behaviour, not a fact about the account. */
export const SKIP_KEY = "onboardingSkipped";

/**
 * Route names that opening the app may divert away from into the first run.
 *
 * These are the routes whose entire content is derived from your own piles, so
 * they are exactly the ones that render blank for an account with none —
 * diverting from them costs nothing, because there was nothing there.
 *
 * The omissions are the point. A card, a set, an archetype, a shared trade or
 * somebody's profile was asked for by name, usually from a link somebody sent.
 * Redirecting off one of those would be a worse experience than the emptiness
 * this flow exists to fix, so it does not — those people are offered the flow
 * the next time they open the app itself rather than a page inside it.
 */
export const ONBOARDING_ENTRY_ROUTES = ["home", "dashboard", "TradeCenter", "library", "decks"];

/**
 * Whether opening the app on this route may divert into the first run.
 * @param {string} routeName
 * @returns {boolean}
 */
export function divertsFrom(routeName) {
  return ONBOARDING_ENTRY_ROUTES.includes(routeName);
}

/**
 * Position of a step, or -1 for anything unrecognised.
 * @param {string} step
 * @returns {number}
 */
export function stepIndex(step) {
  return STEPS.indexOf(step);
}

/**
 * The step after this one, or null at the end. Unknown steps resolve to the
 * first step rather than null: a bad `?step=` in the URL should start the flow,
 * not silently finish it.
 * @param {string} step
 * @returns {string|null}
 */
export function nextStep(step) {
  const i = stepIndex(step);
  if (i === -1) return STEPS[0];
  return STEPS[i + 1] ?? null;
}

/**
 * The step before this one, or null at the start.
 * @param {string} step
 * @returns {string|null}
 */
export function prevStep(step) {
  const i = stepIndex(step);
  if (i <= 0) return null;
  return STEPS[i - 1];
}

/**
 * Coerce anything (a URL param, a stale link) into a real step.
 * @param {unknown} step
 * @returns {string}
 */
export function normalizeStep(step) {
  return STEPS.includes(step) ? step : STEPS[0];
}

/**
 * Whether this account still has nothing to trade on.
 *
 * Both piles are required, not either: a trade pile with no wish list produces
 * matches only for the half of the pair where somebody else wants your cards,
 * and a wish list with no trade pile gives you nothing to offer back.
 *
 * @param {{tradeCount?: number, wishCount?: number}} counts
 * @returns {boolean}
 */
export function isEmptyAccount({ tradeCount = 0, wishCount = 0 } = {}) {
  return tradeCount <= 0 || wishCount <= 0;
}

/**
 * Whether to send this person to /start automatically.
 *
 * @param {{tradeCount?: number, wishCount?: number, skipped?: boolean}} state
 * @returns {boolean}
 */
export function needsOnboarding({ tradeCount = 0, wishCount = 0, skipped = false } = {}) {
  if (skipped) return false;
  return isEmptyAccount({ tradeCount, wishCount });
}

/**
 * Read the skip preference. Takes the storage object so this stays callable
 * during SSR (where there is no localStorage) and testable without stubbing a
 * global.
 *
 * @param {Storage|null|undefined} storage
 * @returns {boolean}
 */
export function readSkipped(storage) {
  try {
    return storage?.getItem(SKIP_KEY) === "true";
  } catch {
    // Safari in private mode throws on access rather than returning null.
    // Not knowing the preference is the same as not having one.
    return false;
  }
}

/**
 * Persist the skip preference. Silent on failure for the same reason as above —
 * losing it costs one redirect, and there is nothing useful to tell the user.
 *
 * @param {Storage|null|undefined} storage
 * @param {boolean} skipped
 */
export function writeSkipped(storage, skipped = true) {
  try {
    storage?.setItem(SKIP_KEY, skipped ? "true" : "false");
  } catch {
    /* ignore */
  }
}

/**
 * How many live cards sit in each pile.
 *
 * Two head counts rather than one fetch: the only question is whether either
 * pile is empty, and a row limit would report a large one-sided collection as
 * an empty one. `null` on failure, so callers can tell "no cards" apart from
 * "could not ask" — the first is a reason to onboard, the second is not.
 *
 * @param {string} userId
 * @returns {Promise<{tradeCount:number, wishCount:number}|null>}
 */
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

/**
 * The single answer to "where does this session go now".
 *
 * Shared by both entry points — the OAuth callback and the sign-in dialog — so
 * the two cannot drift into disagreeing about who is new.
 *
 * @param {string} userId
 * @param {string} locale
 * @param {Storage|null} storage
 * @returns {Promise<string|null>} the /start path, or null to leave the caller's
 *   own destination alone.
 */
export async function startPathIfNeeded(userId, locale, storage) {
  if (readSkipped(storage)) return null;
  const counts = await fetchPileCounts(userId);
  if (!counts) return null;
  return needsOnboarding(counts) ? `/${locale}/start` : null;
}
