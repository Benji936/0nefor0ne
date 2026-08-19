// Serializing JSON-LD into a <script> block, safely.
//
// JSON.stringify escapes quotes and backslashes but NOT "<", and the browser
// looks for the literal "</script" while reading a script body — it does not
// parse JSON to find the end. So any interpolated value containing "</script>"
// closes the block early and everything after it is parsed as HTML. That value
// does not have to be typed by an attacker to be a problem: SetPage builds its
// schema from route.params.setSlug, so the URL alone is enough.
//
// Escaping "<" is the whole fix. A ld+json block is data, not code — the
// browser never executes it — so the only way out of it is to end the tag, and
// "<" cannot. (U+2028 and U+2029 need no handling here for the same reason:
// they matter to a JS parser, and this is never parsed as JS.)
//
// One helper rather than a .replace() at each call site, because the failure is
// silent: an unescaped block looks correct in the page, in the head, and in
// Google's testing tool. Only a hostile value shows the difference, and a page
// added later that forgets the escape gives no sign it is missing.

/** JSON for a <script type="application/ld+json"> body, with "<" neutralised. */
export function ldJson(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

/** A ready-made useHead() script entry. Prefer this to hand-building one. */
export function ldScript(obj) {
  return { type: 'application/ld+json', innerHTML: ldJson(obj) };
}
