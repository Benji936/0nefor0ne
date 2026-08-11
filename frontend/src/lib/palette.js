/**
 * The palette, read from where it actually lives.
 *
 * TradeMarket declares its colours twice and cannot help it: `assets/main.css`
 * holds the --c-* custom properties that almost everything uses, and
 * `main.js` holds a Vuetify theme, because Vuetify resolves `color="primary"`
 * itself and cannot read a CSS variable to do it.
 *
 * Two declarations of one palette drift. They did drift: the CSS side was
 * corrected for contrast and the Vuetify side was left on the old values, so
 * `color="primary"` rendered a colour the design system no longer contained.
 *
 * Nothing here defines a colour. These functions parse the two files, so the
 * tests in palette.test.js assert against what ships rather than against a
 * third copy that would drift in its own turn.
 */

/** Every `--name: #value;` in a CSS block. */
function parseVars(block) {
  const out = {};
  for (const [, name, value] of block.matchAll(/--(c-[\w-]+)\s*:\s*(#[0-9A-Fa-f]{3,8})\s*;/g)) {
    out[name] = value.toUpperCase();
  }
  return out;
}

/**
 * The two themes from assets/main.css.
 *
 * Only the first `:root` and the first `html.dark` are read. Variations B and C
 * live further down the file inside a comment; taking the first of each keeps
 * the parser on the active theme without needing to understand CSS comments.
 *
 * @param {string} css
 * @returns {{light: Record<string,string>, dark: Record<string,string>}}
 */
export function parseCssThemes(css) {
  const light = css.match(/:root\s*\{([^}]*)\}/);
  const dark = css.match(/html\.dark\s*\{([^}]*)\}/);
  if (!light || !dark) throw new Error("main.css: could not find :root and html.dark");
  return { light: parseVars(light[1]), dark: parseVars(dark[1]) };
}

/**
 * The two Vuetify themes from main.js.
 *
 * @param {string} js
 * @returns {{neonDusk: Record<string,string>, neonDuskLight: Record<string,string>}}
 */
export function parseVuetifyThemes(js) {
  const out = {};
  for (const name of ["neonDusk", "neonDuskLight"]) {
    // `name:` then the first `colors: { ... }` after it.
    const at = js.indexOf(`${name}: {`);
    if (at === -1) throw new Error(`main.js: theme ${name} not found`);
    const colors = js.slice(at).match(/colors:\s*\{([^}]*)\}/);
    if (!colors) throw new Error(`main.js: theme ${name} has no colors block`);
    const map = {};
    for (const [, key, value] of colors[1].matchAll(/(\w+)\s*:\s*'(#[0-9A-Fa-f]{3,8})'/g)) {
      map[key] = value.toUpperCase();
    }
    out[name] = map;
  }
  return out;
}

/**
 * Which Vuetify colour is meant to be which --c-* token. The pairs that must
 * agree, and the only reason the two files can be compared at all.
 *
 * `secondary` is the accent (pink) and `info` is the mutual (teal): Vuetify's
 * names are generic, ours are semantic, and this is where the translation is
 * written down instead of being folklore.
 */
export const ROLE_PAIRS = [
  ["primary", "c-trade"],
  ["secondary", "c-accent"],
  ["info", "c-mutual"],
  ["background", "c-bg"],
  ["surface", "c-surface"],
];

/** sRGB relative luminance, per WCAG 2.1. */
function luminance(hex) {
  const h = hex.replace("#", "");
  const parts = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = parts.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** Contrast ratio between two hex colours, rounded the way a report reads it. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** WCAG 2.1 AA for normal-size text. Vuetify's button text is 14px/500, which
 *  is normal text, not large: 3:1 does not apply anywhere in this system. */
export const AA_NORMAL = 4.5;
