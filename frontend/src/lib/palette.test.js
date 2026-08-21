import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  parseCssThemes,
  parseVuetifyThemes,
  ROLE_PAIRS,
  contrast,
  AA_NORMAL,
} from "./palette.js";

/**
 * The guard that should have existed before the palette drifted.
 *
 * Two failures happened for want of this file. The Vuetify theme kept the old
 * hexes after the CSS side was corrected, so `color="primary"` rendered a
 * colour the system no longer had. And a button whose label colour was written
 * as an object property rather than a CSS declaration was missed by a sweep,
 * then made worse when its background moved underneath it.
 *
 * Both are caught below: the first by comparing the two files, the second by
 * asserting the contrast of every role against the label colour that is
 * supposed to sit on it.
 */

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const css = parseCssThemes(read("../assets/main.css"));
const vuetify = parseVuetifyThemes(read("../main.js"));

describe("the two palette declarations agree", () => {
  it.each(ROLE_PAIRS)("dark: Vuetify %s matches --%s", (vuetifyKey, token) => {
    expect(vuetify.neonDusk[vuetifyKey]).toBe(css.dark[token]);
  });

  it.each(ROLE_PAIRS)("light: Vuetify %s matches --%s", (vuetifyKey, token) => {
    expect(vuetify.neonDuskLight[vuetifyKey]).toBe(css.light[token]);
  });
});

describe("labels on brand colours clear AA", () => {
  // The Label Contrast Rule in DESIGN.md: text on a brand colour is
  // --c-on-accent, never a literal white, because the brand colours invert
  // between themes and a fixed label can only pass in one of them.
  const ROLES = ["c-accent", "c-trade", "c-mutual", "c-muted"];

  for (const theme of ["dark", "light"]) {
    for (const role of ROLES) {
      it(`${theme}: --c-on-accent on --${role}`, () => {
        const ratio = contrast(css[theme]["c-on-accent"], css[theme][role]);
        expect(ratio, `${css[theme]["c-on-accent"]} on ${css[theme][role]} = ${ratio}`)
          .toBeGreaterThanOrEqual(AA_NORMAL);
      });
    }
  }

  it("a literal white label would fail, which is the whole point of the token", () => {
    // Guards the reasoning, not just the result: if someone "simplifies"
    // --c-on-accent back to white, this says why that was wrong.
    expect(contrast("#FFFFFF", css.dark["c-accent"])).toBeLessThan(AA_NORMAL);
    expect(contrast("#FFFFFF", css.dark["c-trade"])).toBeLessThan(AA_NORMAL);
  });
});

describe("brand colours clear AA as text on every surface they sit on", () => {
  const ROLES = ["c-accent", "c-trade", "c-mutual", "c-muted", "c-text"];
  const SURFACES = ["c-bg", "c-surface", "c-surface-2"];

  for (const theme of ["dark", "light"]) {
    for (const role of ROLES) {
      for (const surface of SURFACES) {
        it(`${theme}: --${role} on --${surface}`, () => {
          const ratio = contrast(css[theme][role], css[theme][surface]);
          expect(ratio, `${css[theme][role]} on ${css[theme][surface]} = ${ratio}`)
            .toBeGreaterThanOrEqual(AA_NORMAL);
        });
      }
    }
  }
});

describe("no component hardcodes a label that belongs to a brand colour", () => {
  // The UserCard failure, asserted as the rule rather than as the shape it
  // happened to take. This used to grep for `btnText:`, the object property the
  // original sweep had missed — which quietly stopped guarding anything the
  // moment that property was refactored away. The rule survives refactors: the
  // card paints labels on --c-trade / --c-accent / --c-mutual, so it must name
  // the token, and no colour in it may be a literal white.
  it("UserCard names the token and never a literal white", () => {
    const src = read("../components/trade/UserCard.vue");
    expect(src, "a label sits on a brand colour here, so the token must appear")
      .toContain("var(--c-on-accent)");

    const whites = [
      ...src.matchAll(/colou?r\s*[:=]\s*["']?\s*(?:#fff(?:fff)?|white)\b/gi),
      ...src.matchAll(/\btext-white\b/g),
    ].map((m) => m[0]);
    expect(whites, "a label on a brand colour must be var(--c-on-accent)").toEqual([]);
  });
});
