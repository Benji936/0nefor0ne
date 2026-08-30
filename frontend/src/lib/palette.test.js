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

describe("teal stays on the agreement chain", () => {
  // The Agreement Rule in DESIGN.md: --c-mutual marks the moment two people
  // line up and every step that follows from it — matching, accepting,
  // confirming, rating. Nothing outside that chain may borrow it.
  //
  // The announce board broke the rule in four places at once. A Looking For
  // post wore teal on its badge and again on its archetype line; the kind
  // filter turned teal when Looking For was selected; and the events strip
  // spent it on a heading dot and a "Following" pill. None of those is an
  // agreement — a want is pink, an offer is amethyst, and following a community
  // is neither, so it takes the system's tinted neutral.
  //
  // Asserted as the rule rather than as the four selectors it happened to
  // occupy, so it still guards after the next redesign of this page.
  const BOARD = [
    "../components/Pages/App/trade-center/AnnouncesTab.vue",
    "../components/trade/AnnounceCard.vue",
    "../components/community/UpcomingEventsRow.vue",
  ];

  it.each(BOARD)("%s paints nothing in the mutual colour", (rel) => {
    const found = [
      ...read(rel).matchAll(/--c-mutual|#2DD4BF|#076B82/gi),
    ].map((m) => m[0]);
    expect(found, "nothing on the announce board is an agreement").toEqual([]);
  });
});

describe("teal on the community pages is the verified badge and nothing else", () => {
  // Same rule, a page where it cannot be "none at all". The directory broke it
  // twice: the remote-duel toggle lit teal when pressed, and a card announced
  // "offers remote duels" in teal. Neither is agreement — pressing a filter is
  // something the reader did, and duelling online is something a shop offers —
  // so both are amethyst now.
  //
  // What is left is the verified badge, which is teal here because it is teal
  // in the six other places the app draws it. Strictly a verified shop is a
  // trust mark, not an agreement between two people, so this is an open
  // question for the palette as a whole; repainting it on this page alone would
  // have left the same badge two colours in two views, which is worse than the
  // question. Asserted as "only where the line names the badge" so the rule
  // still bites if teal reappears as decoration.
  const DIRECTORY = [
    "../components/Pages/App/CommunityDirectory.vue",
    "../components/Pages/App/CommunityProfile.vue",
    "../components/community/CommunityCard.vue",
    "../components/community/NearbyEvents.vue",
    "../components/community/UnclaimedNearby.vue",
  ];

  // A teal declaration is attributed to the rule it sits in, not to its own
  // line: `.cp-verified { ... }` names the badge once in its selector and then
  // spends three lines on colours, none of which repeat the word. Anything that
  // is neither in a rule naming the badge nor on a line naming it is teal used
  // as decoration, which is what this is here to stop.
  const strayTeal = (src) => {
    const TEAL = /--c-mutual|#2DD4BF|#076B82/i;
    const NAMED = /verified/i;
    const out = [];
    let rule = "";
    for (const line of src.split("\n")) {
      if (line.includes("{")) rule = line;
      if (TEAL.test(line) && !NAMED.test(line) && !NAMED.test(rule)) out.push(line.trim());
    }
    return out;
  };

  it.each(DIRECTORY)("%s spends teal only on the verified mark", (rel) => {
    expect(strayTeal(read(rel)), "teal outside the agreement chain must name the verified badge").toEqual([]);
  });
});

describe("a decklist holds no agreements, so the deck pages spend no teal", () => {
  // The strictest form of the rule, and the one these pages had broken worst.
  // The completion bar painted the cards you had sourced elsewhere teal and the
  // ones you own pink; the type breakdown beside it spent all three semantic
  // colours at once, on Monster, Spell and Trap — categories, not roles.
  //
  // A deck measured against your collection splits into exactly two of the
  // system's meanings and neither of them is agreement: the cards you hold are
  // cards you could offer (amethyst) and the cards you lack are cards you want
  // (pink). Nothing here is two people lining up, so unlike the community pages
  // there is no badge to make an exception for: the count must be zero.
  const DECKS = [
    "../components/Pages/App/DecksPage.vue",
    "../components/Pages/App/DeckDetailPage.vue",
    "../components/library/DeckTicks.vue",
    "../components/library/DeckSection.vue",
  ];

  it.each(DECKS)("%s never reaches for the agreement colour", (rel) => {
    const found = [...read(rel).matchAll(/--c-mutual|#2DD4BF|#076B82/gi)].map((m) => m[0]);
    expect(found, "teal marks agreement and a decklist has none").toEqual([]);
  });

  // The other half of the same fix: these pages were carrying raw green, raw
  // red and a flat grey for the missing / sourced / unrecognized badges, none of
  // which the palette has (DESIGN.md, The No-Gray Rule), plus white labels on
  // brand-coloured chips (The Label Contrast Rule).
  it.each(DECKS)("%s uses no raw green, grey or white label", (rel) => {
    const stray = read(rel)
      .split("\n")
      .filter((line) => /rgba?\(\s*(34|100|0)\s*,|color:\s*white|:\s*#fff\b|#ffffff/i.test(line))
      // The one allowed literal is the page-scoped danger role, which the design
      // system has no token for; it is declared once and named --dk-danger.
      .filter((line) => !/--dk-danger/.test(line));
    expect(stray, "every colour on a deck page comes from a token").toEqual([]);
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

describe("a Looking For post is a want, and wants are pink", () => {
  // The state that had three drawings and two colours. An announce card in the
  // list wore a pink LF badge, with a comment saying why: "a Looking For post
  // is a want and pink is what wanting is called here." The dialog that creates
  // that post filled its Looking For switch with teal, and the dialog that
  // opens it drew the same badge in teal again.
  //
  // Teal is the agreement chain — the moment two people line up — and a
  // Looking For post is one person asking, with nobody on the other side yet.
  // So the announce surfaces spend no teal at all, and the two dialogs have to
  // agree with the card about what pink means.
  const ANNOUNCE = [
    "../components/trade/CreateAnnounceDialog.vue",
    "../components/trade/AnnounceDetailDialog.vue",
    "../components/trade/AnnounceCard.vue",
    "../components/trade/WantListInput.vue",
  ];

  it.each(ANNOUNCE)("%s spends no teal", (rel) => {
    const stray = read(rel)
      .split("\n")
      .filter((line) => /--c-mutual|#2DD4BF|#076B82/i.test(line));
    expect(stray, "nothing on an announce is an agreement yet").toEqual([]);
  });

  // The card is the reference: it is what the poster sees afterwards, and the
  // form should have been the same colour while they were filling it in.
  it("the card, the switch and the badge name the same two colours", () => {
    expect(read("../components/trade/AnnounceCard.vue"))
      .toMatch(/isLf\.value \? "var\(--c-accent\)" : "var\(--c-trade\)"/);

    const dlg = read("../components/trade/CreateAnnounceDialog.vue");
    // Selling is the default; choosing Looking For repaints the whole form.
    expect(dlg).toMatch(/\.dlg\s*\{[^}]*--an-kind:\s*var\(--c-trade\)/s);
    expect(dlg).toMatch(/\.dlg\[data-kind="want"\]\s*\{\s*--an-kind:\s*var\(--c-accent\)/);

    // The detail dialog now says the kind in words rather than as an "LF"
    // badge, and reads the same variable the form does.
    const detail = read("../components/trade/AnnounceDetailDialog.vue");
    expect(detail).toMatch(/\.dlg\s*\{\s*--an-kind:\s*var\(--c-trade\)/);
    expect(detail).toMatch(/\.dlg\[data-kind="want"\]\s*\{\s*--an-kind:\s*var\(--c-accent\)/);
    expect(detail).toMatch(/\.an-head__eyebrow\s*\{[^}]*background:\s*var\(--an-kind\)/s);
  });

  // Narrower than the other pages' version of this rule, and deliberately so.
  // The card and the detail dialog both lay text over a photograph the user
  // uploaded, and a scrim on a photograph is the one place a fixed black is
  // right: the photo is the ground, the photo is not themed, and a veil that
  // inverted with the theme would put white text on a white wash. Those two
  // files are exempt. The form is not — it lays nothing over a photograph
  // except its own two chips, and those read the page's ground so they stay
  // legible on either theme.
  const FORM = [
    "../components/trade/CreateAnnounceDialog.vue",
    "../components/trade/WantListInput.vue",
  ];
  it.each(FORM)("%s uses no raw white, black or grey", (rel) => {
    const stray = read(rel)
      .split("\n")
      .filter((line) => /rgba?\(\s*(255|0|200|100)\s*,|color:\s*white|:\s*#fff\b|#ffffff|#ef4444/i.test(line));
    expect(stray, "every colour on the announce form comes from a token").toEqual([]);
  });
});

describe("the support page keeps Ko-fi's blue on Ko-fi's button", () => {
  // #72A4F2 is Ko-fi's brand colour, and the page is entitled to it on the
  // button that goes to Ko-fi — the shop marks work the same way. What it is
  // not entitled to is the panel's border, its gradient and its drop shadow,
  // which is where it was: the most saturated thing on a One for One page
  // belonged to somebody else.
  const src = read("../components/Pages/App/BuiltWithPage.vue");

  it("declares the blue once, as a token", () => {
    const literals = src.match(/#72[aA]4[fF]2/g) ?? [];
    expect(literals, "one declaration, read everywhere else through --sp-kofi").toHaveLength(1);
    expect(src).toMatch(/--sp-kofi:\s*#72A4F2/i);
  });

  it("spends it on the button and nothing else", () => {
    const users = src
      .split("\n")
      .filter((line) => /var\(--sp-kofi\)/.test(line));
    expect(users).toHaveLength(1);
    // …and that one use is the button's own background.
    expect(src).toMatch(/\.sp__kofi\s*\{[^}]*background:\s*var\(--sp-kofi\)/s);
  });

  // White on that blue measured 2.53:1 at 15px/700, against the 4.5 the size
  // needs — and with both values fixed it failed in the light theme and the
  // dark one alike. The ink is the app's own deep indigo, which clears 7:1.
  it("does not put white on it", () => {
    expect(src).not.toMatch(/\.sp__kofi\s*\{[^}]*color:\s*(#fff|#ffffff|white)\b/is);
    expect(src).toMatch(/\.sp__kofi\s*\{[^}]*color:\s*#1A0D45/is);
  });

  it("uses no raw white, black or grey elsewhere", () => {
    const stray = src
      .split("\n")
      .filter((line) => /rgba?\(\s*(255|0|100)\s*,|color:\s*white|:\s*#fff\b|#ffffff/i.test(line))
      .filter((line) => !/--sp-kofi|#1A0D45/.test(line));
    expect(stray, "every other colour on the page comes from a token").toEqual([]);
  });
});

describe("the announce detail dialog spends no colour the system does not have", () => {
  // Four literals lived in this file, each written once against the dark page
  // and each failing on the light one: Discord's blurple as text on a tint of
  // itself (3.53:1 light, 3.64 dark), the rating amber (1.77:1 light), a red
  // for delete (2.96:1 light) and — with no meaning in this palette at all — a
  // green on the button that adds a card to your pile (1.62:1 light).
  //
  // The first three are legitimate colours outside the three roles: a brand, a
  // warning and a danger. They keep their hue and get a value per theme. The
  // green does not: adding to your trade pile is amethyst and adding to your
  // wishlist is pink, which is what that button already says in words.
  const src = read("../components/trade/AnnounceDetailDialog.vue");

  it("holds no raw brand, warning, danger or success literals", () => {
    const stray = src
      .split("\n")
      .filter((line) => /#(ef4444|22c55e|5865F2|f59e0b)\b/i.test(line))
      .filter((line) => !/--an-(discord|star|danger):/.test(line));
    expect(stray, "declare it once as a token, with a value per theme").toEqual([]);
  });

  it.each(["--an-discord", "--an-star", "--an-danger"])("%s has a light and a dark value", (token) => {
    const declared = src.match(new RegExp(`${token}:\\s*#[0-9A-Fa-f]{6}`, "g")) ?? [];
    expect(declared).toHaveLength(2);
    expect(src).toMatch(/html\.dark \.shell \{/);
  });

  it("puts no green on the add-to-pile button", () => {
    expect(src).toMatch(/\.btn-tradelist\s*\{[^}]*color:\s*var\(--an-kind\)/s);
  });

  // The lesson that took three surfaces to learn. Text set in a brand colour on
  // a wash of the same brand colour is spending its own contrast: on the light
  // theme, 12% was too much for pink every time it was tried. Nothing in this
  // file may go back above 10%.
  // The same arithmetic, wherever an announce badge is drawn. The trader page
  // draws one too, in the right colours, at a wash that was too heavy for them.
  it("holds the same ceiling on the trader page's announce badges", () => {
    const ta = read("../components/trade/TraderAnnounces.vue");
    const heavy = [...ta.matchAll(/\.ta__kind--\w+\s*\{\s*background:\s*color-mix\(in srgb, var\(--c-\w+\) (\d+)%/g)]
      .map((m) => Number(m[1]))
      .filter((pct) => pct > 12);
    expect(heavy, "16% put three of these four combinations under 4.5:1").toEqual([]);
  });

  it("keeps a wash under text of the same hue thin enough to read", () => {
    // Backgrounds only. A border in the same hue carries no text on top of it,
    // so it can be as strong as it likes — and is, at 34%.
    const heavy = [...src.matchAll(/background:\s*color-mix\(in srgb, var\(--an-kind\) (\d+)%/g)]
      .map((m) => Number(m[1]))
      .filter((pct) => pct > 12);
    expect(heavy, "pink on a pink wash fell to 4.17:1 at 12%").toEqual([]);
  });
});
