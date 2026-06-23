// Bulk Add Parser
//
// Pure, side-effect-free helpers for the paste-a-list bulk-add flow.
// Mirrors the line-loop structure of `ydk.js` (split -> trim -> skip -> accumulate).

/**
 * Matches a leading quantity prefix in one of the supported forms:
 *   - `3x Name`  (digits + x/X, optional space)
 *   - `x3 Name`  (x/X + digits, optional space)
 *   - `3 Name`   (digits + at least one space)
 *
 * Capture groups:
 *   1 -> qty from the `3x` form
 *   2 -> qty from the `x3` form
 *   3 -> qty from the `3 ` form
 *
 * Quantity-vs-name disambiguation rule (CRITICAL edge case):
 *   We only treat a leading number as a quantity when it matches one of the
 *   explicit prefix forms above. The `3 ` form requires the digits to be
 *   followed by whitespace AND leave a non-empty remainder, so:
 *     - `3 Ash Blossom`     -> qty 3, query "Ash Blossom"  (explicit prefix)
 *     - `7 Colored Fish`    -> qty 7, query "Colored Fish" (explicit prefix; a
 *                              legitimately numeric-leading name that, by the
 *                              paste convention, is indistinguishable from a
 *                              quantity — parsing it as qty 7 is the sensible,
 *                              documented behaviour. The user can correct qty
 *                              in the review step.)
 *     - `7 Colored Fish` with no space after a bare `7` (e.g. just `7`) leaves
 *                              an empty remainder and is dropped, never mis-read.
 *   A name with no leading number (e.g. `Maxx "C"`) never matches and gets qty 1.
 */
const QTY_PREFIX_RE = /^(?:(\d+)[xX]\s*|[xX](\d+)\s*|(\d+)\s+)/

/**
 * Strict set-code matcher (analysis R5). Stricter than the SKILL.md variant
 * `/^[A-Z0-9]+-\w+$/i` so malformed codes never reach `searchCardBySetCode`,
 * which throws on `split_code[1]` for inputs lacking a trailing numeric part.
 *
 * Requires: PREFIX `-` [optional letters] digits.
 *   true:  SDCB-EN001, LOB-005
 *   false: Maxx "C", LOB, LOB-
 */
const SET_CODE_RE = /^[A-Z0-9]+-[A-Z]*\d+$/i

/**
 * parseBulkLines(text)
 *
 * Splits pasted text into lines, trims them, skips blank and `#`-comment lines,
 * strips an optional leading quantity prefix, and returns one entry per usable
 * line. Lines whose query is empty after stripping are dropped.
 *
 * @param {string} text - Raw pasted list, one card per line.
 * @returns {{ qty: number, query: string }[]} - qty is always a positive integer (default 1).
 */
export function parseBulkLines(text) {
  if (!text || typeof text !== 'string') {
    return []
  }

  const result = []
  const lines = text.split(/\r?\n/)

  for (const rawLine of lines) {
    const line = rawLine.trim()

    // Skip blank lines and `#`-comment lines.
    if (line === '' || line.startsWith('#')) continue

    const match = line.match(QTY_PREFIX_RE)
    const rawQty = match ? (match[1] ?? match[2] ?? match[3]) : null
    let qty = rawQty != null ? parseInt(rawQty, 10) : 1

    // qty must always be a positive integer; guard against 0 / NaN.
    if (!Number.isInteger(qty) || qty < 1) qty = 1

    const query = match ? line.slice(match[0].length).trim() : line

    // Drop lines that have no query left after stripping the prefix.
    if (query === '') continue

    result.push({ qty, query })
  }

  return result
}

/**
 * isSetCode(query)
 *
 * @param {string} query - Card token to test.
 * @returns {boolean} - true only for strict `PREFIX-[letters]digits` set codes.
 */
export function isSetCode(query) {
  if (typeof query !== 'string') return false
  return SET_CODE_RE.test(query.trim())
}
