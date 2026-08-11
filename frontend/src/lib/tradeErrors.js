/**
 * Turning a Postgres exception into something a trader can act on.
 *
 * The trade RPCs raise plain-text exceptions written for whoever reads the
 * logs: "Only the counterparty may accept this trade", "trade cannot be
 * cancelled (current status: declined)". Those went straight into a snackbar,
 * which is how a person trading cards ends up reading the word "counterparty".
 *
 * Almost every one of these has the same cause. The trade moved while the
 * dialog was open: the other side accepted, declined, or cancelled, and the
 * button that was correct when the page loaded is not correct any more. That
 * is worth saying plainly, because the fix is to look again, not to retry.
 *
 * Returns an i18n key rather than a sentence. The caller owns the copy.
 */

/** Matched against the exception text, first hit wins. Order matters: the
 *  status checks are more specific than the participant checks. */
const PATTERNS = [
  // The trade moved on. By far the most common real failure, and the only one
  // where the user needs to do something different rather than try again.
  [/not pending|only .*pending|cannot be cancelled|current status|current:/i, "stale"],
  // Acting on somebody else's trade, or the wrong side of your own.
  [/only the counterparty|only the recipient|not a participant/i, "notYours"],
  [/not found/i, "gone"],
  [/not authenticated|jwt|session/i, "signedOut"],
];

/**
 * @param {unknown} err  whatever the RPC threw
 * @param {string} fallback  i18n key for anything unrecognised
 * @returns {string} an i18n key under `tradeError.`
 */
export function tradeErrorKey(err, fallback = "tradeError.generic") {
  const text = String(err?.message ?? err ?? "");
  if (!text) return fallback;
  for (const [pattern, key] of PATTERNS) {
    if (pattern.test(text)) return `tradeError.${key}`;
  }
  return fallback;
}

/** True when the failure means the trade changed underneath us, so the caller
 *  should reload rather than leave a stale row on screen. */
export function isStaleTradeError(err) {
  return tradeErrorKey(err) === "tradeError.stale";
}
