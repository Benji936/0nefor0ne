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

describe("a trader page spends teal only on the agreement itself", () => {
  // The one place in this pass where teal is right, and the rule that says
  // when. A trader page draws a table with two arms: their cards you want
  // (amethyst, the pile coming toward you) and your cards they want (pink, the
  // pile they want off you). Teal is the frame around both arms once they are
  // both live — that is two people lining up, which is the only thing teal ever
  // marks (DESIGN.md, The Agreement Rule).
  //
  // So unlike the deck pages, the count here is not zero: it is "only inside
  // the mutual chain". A teal line is attributed to the rule it sits in, so a
  // selector that names the mutual state covers the declarations under it.
  const TRADER = [
    "../components/trade/TraderProfileBody.vue",
    "../components/trade/TraderAnnounces.vue",
    "../components/trade/CardBinder.vue",
    "../components/Pages/App/TraderPage.vue",
  ];
  const TEAL = /--c-mutual|#2DD4BF|#076B82/gi;
  const NAMED = /mutual|agreement/i;
  // The token itself spells "mutual", so a naive name check passes every teal
  // line ever written and the guard becomes a no-op. Strip the tokens first:
  // what is left is the author's own words, which is what has to name the state.
  const nameless = (line) => line.replace(TEAL, "");

  const strayTeal = (src) => {
    const out = [];
    let rule = "";
    for (const line of src.split("\n")) {
      if (line.includes("{")) rule = line;
      if (TEAL.test(line) && !NAMED.test(nameless(line)) && !NAMED.test(nameless(rule))) {
        out.push(line.trim());
      }
    }
    return out;
  };

  it.each(TRADER)("%s reaches for teal only where it names the mutual match", (rel) => {
    expect(strayTeal(read(rel)), "teal outside the mutual chain is decoration").toEqual([]);
  });

  // The card tiles were outlined in raw white and lifted on a raw black drop
  // shadow, which the light theme rendered as an invisible edge over a bruise.
  // The star is the single allowed literal, and it is a named token with a
  // value per theme rather than a hex repeated at each use.
  it.each(TRADER)("%s uses no raw white, black or grey", (rel) => {
    const stray = read(rel)
      .split("\n")
      .filter((line) => /rgba?\(\s*(255|0|100)\s*,|color:\s*white|:\s*#fff\b|#ffffff/i.test(line))
      .filter((line) => !/--tpb-star/.test(line));
    expect(stray, "every colour on a trader page comes from a token").toEqual([]);
  });

  // The seam is the app's own vocabulary, drawn identically on the matches list
  // and on a trader's page, and it has to keep pointing the same way: amethyst
  // is what comes toward you, pink is what leaves. Swapping them would be
  // perfectly legible and completely wrong.
  const SIDES = [
    ["../components/trade/UserCard.vue", "mt-side--in", "mt-side--out", "mt-axis__label"],
    ["../components/trade/TraderProfileBody.vue", 'tpb-side[data-side="get"]', 'tpb-side[data-side="give"]', "tpb-axis__label"],
  ];
  it.each(SIDES)("%s keeps amethyst on the receiving side and pink on the giving one", (rel, get, give, label) => {
    const src = read(rel);
    const rule = (cls) => new RegExp(`\\.${cls.replace(/[[\]"]/g, "\\$&")}\\s+\\.${label}\\s*\\{\\s*color:\\s*var\\(--c-(\\w+)\\)`);
    expect(src.match(rule(get))?.[1]).toBe("trade");
    expect(src.match(rule(give))?.[1]).toBe("accent");
  });

  // And the arm between them, which is the half of the signal that says whether
  // anything travels at all.
  it.each(["../components/trade/UserCard.vue", "../components/trade/TraderProfileBody.vue"])(
    "%s lights the incoming arm amethyst and the outgoing arm pink",
    (rel) => {
      const src = read(rel);
      expect(src).toMatch(/__arm:first-child\.is-live\s*\{\s*border-top-color:\s*var\(--c-trade\)/);
      expect(src).toMatch(/__arm:last-child\.is-live\s*\{\s*border-top-color:\s*var\(--c-accent\)/);
    });
});

describe("a card page spends teal only when the card is a trade waiting to happen", () => {
  // The card page's seam is about one card rather than two people: the left
  // side is every trade pile holding it, the right is every wishlist hunting
  // it. Both live at once is the match condition itself — it is what
  // find_matches would surface — so it is the one state that earns teal, and
  // it is rare: five of the three hundred and one card names in this database
  // have somebody on both sides.
  const CARD = "../components/Pages/App/CardPage.vue";
  const TEAL = /--c-mutual|#2DD4BF|#076B82/gi;
  const NAMED = /mutual|agreement|both/i;
  const nameless = (line) => line.replace(TEAL, "");

  it("reaches for teal only where it names both sides being live", () => {
    const stray = [];
    let rule = "";
    for (const line of read(CARD).split("\n")) {
      if (line.includes("{")) rule = line;
      if (TEAL.test(line) && !NAMED.test(nameless(line)) && !NAMED.test(nameless(rule))) stray.push(line.trim());
    }
    expect(stray, "teal outside the both-sides state is decoration").toEqual([]);
  });

  it("uses no raw white, black or grey", () => {
    const stray = read(CARD)
      .split("\n")
      .filter((line) => /rgba?\(\s*(255|0|100)\s*,|color:\s*white|:\s*#fff\b|#ffffff/i.test(line));
    expect(stray, "every colour on a card page comes from a token").toEqual([]);
  });

  // Same seam, same directions, drawn by a third component now. Amethyst is
  // the side that has the card; pink is the side that wants it. The matches
  // list is the reference, and all three have to keep agreeing.
  it("keeps amethyst on the side holding the card and pink on the side hunting it", () => {
    const src = read(CARD);
    const label = (side) =>
      new RegExp(`\\.cx__side\\[data-side="${side}"\\] \\.cx__side-label\\s*\\{\\s*color:\\s*var\\(--c-(\\w+)\\)`);
    expect(src.match(label("have"))?.[1]).toBe("trade");
    expect(src.match(label("want"))?.[1]).toBe("accent");
    expect(src).toMatch(/-arm:first-child\.is-live\s*\{\s*border-top-color:\s*var\(--c-trade\)/);
    expect(src).toMatch(/-arm:last-child\.is-live\s*\{\s*border-top-color:\s*var\(--c-accent\)/);
  });

  // The restriction badge is the one component allowed hues from outside the
  // palette — red, amber and yellow are the game's own Forbidden/Limited
  // colours, not a fourth trade role. What it is not allowed is one value for
  // two themes: written for the dark page only, the amber chip measured 1.6:1
  // on the light one, against the 4.5 a 12px label needs.
  it("gives the banlist badge a value per theme rather than one that suits the dark page", () => {
    const src = read("../components/ui/card/CardBanlistBadge.vue");
    for (const token of ["--cbb-forbidden", "--cbb-limited", "--cbb-semi"]) {
      const declared = src.match(new RegExp(`${token}:\\s*#[0-9A-Fa-f]{6}`, "g")) ?? [];
      expect(declared, `${token} needs a light and a dark value`).toHaveLength(2);
    }
    expect(src, "the dark values belong under html.dark").toMatch(/html\.dark\s+\.cbb\s*\{/);
  });
});
