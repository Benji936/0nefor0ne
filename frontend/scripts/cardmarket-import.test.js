import { describe, it, expect } from "vitest";
import { buildExpansionMap, buildSetRarities } from "./cardmarket-import.mjs";

// A YGOPRODeck card with one or more printings.
const card = (name, ...printings) => ({
  name,
  card_sets: printings.map(([set_code, set_rarity]) => ({ set_code, set_rarity })),
});
// A Cardmarket single.
const single = (idExpansion, name) => ({ idProduct: Math.random(), idExpansion, name });
// A Cardmarket non-single: the only place an expansion is ever named.
const boxOf = (idExpansion, name) => ({ idProduct: Math.random(), idExpansion, name });

describe("buildExpansionMap matches on card lists, not names", () => {
  const ygo = [
    card("Alpha", ["ABC-EN001", "Common"]),
    card("Beta",  ["ABC-EN002", "Rare"]),
    card("Gamma", ["ABC-EN003", "Common"]),
    card("Delta", ["ABC-EN004", "Common"]),
  ];

  it("places an expansion whose cards are the set's cards, however it is named", () => {
    // Cardmarket calls it something else entirely; the card list still says
    // which set it is.
    const singles = ["Alpha","Beta","Gamma","Delta"].map(n => single(900, n));
    const { map } = buildExpansionMap(singles, [boxOf(900, "Totally Different Name Booster")], ygo, {});
    expect(map.get(900)).toBe("ABC");
  });

  it("refuses an expansion that merely shares some cards", () => {
    // A reprint set holding half of ABC is not ABC. This is the Maze of
    // Memories case: expansion 6508 shares 36 of MAMO's 122 cards and is
    // "Limit Over Collection: The Heroes".
    const singles = [single(901, "Alpha"), single(901, "Zeta"), single(901, "Eta"), single(901, "Theta")];
    const { map } = buildExpansionMap(singles, [boxOf(901, "Reprint Collection Booster")], ygo, {});
    expect(map.get(901)).toBeUndefined();
  });

  it("drops OCG expansions, which an -EN set code never means", () => {
    const singles = ["Alpha","Beta","Gamma","Delta"].map(n => single(902, n));
    const { map } = buildExpansionMap(singles, [boxOf(902, "Alpha Set (OCG) Booster")], ygo, {});
    expect(map.get(902)).toBeUndefined();
  });

  it("assigns one expansion per set, so a small promo cannot steal it", () => {
    // The promo contains only cards from ABC, so it scores a perfect
    // containment; the real 4-card expansion has to win anyway.
    const singles = [
      ...["Alpha","Beta","Gamma","Delta"].map(n => single(903, n)),
      single(904, "Alpha"), single(904, "Beta"),
    ];
    const ns = [boxOf(903, "The Real Set Booster"), boxOf(904, "Two Card Promo Booster")];
    const { map } = buildExpansionMap(singles, ns, ygo, {});
    expect(map.get(903)).toBe("ABC");
    expect(map.get(904)).toBeUndefined();
  });

  it("reports what it could not place, largest first", () => {
    const singles = [single(905, "Zeta"), single(905, "Eta"), single(906, "Theta")];
    const ns = [boxOf(905, "Unknown Big Booster"), boxOf(906, "Unknown Small Booster")];
    const { unmatched } = buildExpansionMap(singles, ns, ygo, {});
    expect(unmatched.map(u => u.name)).toEqual(["Unknown Big Booster", "Unknown Small Booster"]);
  });
});

describe("a set YGOPRODeck has not finished cataloguing still matches", () => {
  it("matches on how much of the set it holds, not how much of it we know", () => {
    // Cardmarket lists 101 cards in Duelist's Advance; YGOPRODeck knows 48.
    // Scaled down: 24 known, expansion of 60 holding 23 of them.
    // ofSet = 0.96, ofExp = 0.38 -- the primary rule rejects it.
    const known = Array.from({ length: 24 }, (_, i) => card(`Known${i}`, [`NEW-EN${i}`, "Common"]));
    const singles = [
      ...known.slice(0, 23).map(c => single(920, c.name)),
      ...Array.from({ length: 37 }, (_, i) => single(920, `Uncatalogued${i}`)),
    ];
    const { map } = buildExpansionMap(singles, [boxOf(920, "New Set Booster")], known, {});
    expect(map.get(920)).toBe("NEW");
  });

  it("refuses an expansion wildly larger than the set it contains", () => {
    // A 24-card set and a 300-product reprint collection holding every one of
    // them: ofSet is a perfect 1.00 and it is still not that set. 12.5x is well
    // past the 2.5x an under-catalogued set needs.
    const small = Array.from({ length: 24 }, (_, i) => card(`Promo${i}`, [`TIN-EN${i}`, "Common"]));
    const huge = [
      ...small.map(c => single(921, c.name)),
      ...Array.from({ length: 276 }, (_, i) => single(921, `Filler${i}`)),
    ];
    const { map } = buildExpansionMap(huge, [boxOf(921, "Giant Reprint Collection Booster")], small, {});
    expect(map.get(921)).toBeUndefined();
  });

  it("ignores a stub set too small for its card list to mean anything", () => {
    // YGOPRODeck carries a 14-card "Dark Beginning 2" beside the real 250-card
    // one. Below 20 cards the relaxed rule does not apply, so a stub cannot
    // claim an expansion on the strength of a handful of names.
    // 8 known, expansion of 20 -> ofSet 1.00, ofExp 0.40: only the relaxed rule
    // could accept it, and the size guard says no.
    const stub = Array.from({ length: 8 }, (_, i) => card(`Stub${i}`, [`STB-EN${i}`, "Common"]));
    const singles = [
      ...stub.map(c => single(922, c.name)),
      ...Array.from({ length: 12 }, (_, i) => single(922, `Other${i}`)),
    ];
    const { map } = buildExpansionMap(singles, [boxOf(922, "Stub Booster")], stub, {});
    expect(map.get(922)).toBeUndefined();
  });

  it("prefers a full match over an under-catalogued one for the same set", () => {
    // The relaxed rule ranks below any primary match, so the expansion that
    // actually looks like the set wins even when both are candidates.
    const known = Array.from({ length: 24 }, (_, i) => card(`Known${i}`, [`NEW-EN${i}`, "Common"]));
    const singles = [
      ...known.map(c => single(930, c.name)),                                  // exact: 24/24
      ...known.slice(0, 23).map(c => single(931, c.name)),                     // partial, padded out
      ...Array.from({ length: 37 }, (_, i) => single(931, `Uncatalogued${i}`)),
    ];
    const ns = [boxOf(930, "Exact Booster"), boxOf(931, "Padded Booster")];
    const { map } = buildExpansionMap(singles, ns, known, {});
    expect(map.get(930)).toBe("NEW");
    expect(map.get(931)).toBeUndefined();
  });
});

describe("an override wins outright", () => {
  const ygo = [
    card("Alpha", ["ABC-EN001", "Common"]),
    card("Beta",  ["ABC-EN002", "Rare"]),
    card("Gamma", ["ABC-EN003", "Common"]),
    card("Delta", ["ABC-EN004", "Common"]),
  ];
  // Two expansions with identical card lists: the original printing and a
  // reprint. Cardmarket really does this -- Spell Ruler has a base booster and
  // an "(SDH)" one, and the reprint matched YGOPRODeck more tightly.
  const singles = [
    ...["Alpha","Beta","Gamma","Delta"].map(n => single(910, n)),
    ...["Alpha","Beta","Gamma","Delta"].map(n => single(911, n)),
  ];
  const ns = [boxOf(910, "Alpha Set (SDH) Booster"), boxOf(911, "Alpha Set Booster")];

  it("takes the set code off whichever expansion the matcher chose", () => {
    // Without this the override could only add a second claimant, and the wrong
    // printing would still answer half the lookups while the file looked right.
    const { map } = buildExpansionMap(singles, ns, ygo, { "Alpha Set": "ABC" });
    expect(map.get(911)).toBe("ABC");
    expect(map.get(910)).toBeUndefined();
    expect([...map.values()].filter(c => c === "ABC")).toHaveLength(1);
  });

  it("is keyed by the name without its packaging word", () => {
    const { map } = buildExpansionMap(singles, ns, ygo, { "Alpha Set Booster": "ABC" });
    expect(map.get(911)).toBeUndefined(); // the full name is not the key
  });
});

describe("buildSetRarities keeps the whole list, not a verdict", () => {
  it("records the rarity when a set printed the card at exactly one", () => {
    const m = buildSetRarities([card("Alpha", ["ABC-EN001", "Common"])]);
    expect(m.get("alpha ABC")).toEqual(["Common"]);
  });

  it("records both when a set printed the card at two", () => {
    // This used to collapse to null on the grounds that neither could be
    // proven. That threw away the only input capable of telling the two
    // products apart -- resolveVariants lines this list up against the
    // versions Cardmarket files, and a verdict here forecloses that.
    const m = buildSetRarities([card("Alpha", ["ABC-EN001", "Ultra Rare"], ["ABC-EN001", "Secret Rare"])]);
    expect(m.get("alpha ABC")).toEqual(["Ultra Rare", "Secret Rare"]);
  });

  it("keeps rarities from different sets apart", () => {
    const m = buildSetRarities([card("Alpha", ["ABC-EN001", "Common"], ["XYZ-EN050", "Secret Rare"])]);
    expect(m.get("alpha ABC")).toEqual(["Common"]);
    expect(m.get("alpha XYZ")).toEqual(["Secret Rare"]);
  });

  it("ignores printings with no set code", () => {
    const m = buildSetRarities([card("Alpha", ["", "Common"], [null, "Rare"])]);
    expect(m.size).toBe(0);
  });

  it("survives a card with no printings at all", () => {
    expect(buildSetRarities([{ name: "Alpha" }]).size).toBe(0);
  });
});
