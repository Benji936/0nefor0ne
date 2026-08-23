import { describe, it, expect } from "vitest";
import { buildExpansionMap, buildRarityMap } from "./cardmarket-import.mjs";

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

describe("buildRarityMap keeps only what it can say for certain", () => {
  it("records a rarity when a set printed the card at exactly one", () => {
    const m = buildRarityMap([card("Alpha", ["ABC-EN001", "Common"])]);
    expect(m.get("alpha ABC")).toBe("Common");
  });

  it("records null when a set printed the card at two", () => {
    // Cardmarket files two unlabelled products for these, so there is no
    // honest way to say which product is which rarity.
    const m = buildRarityMap([card("Alpha", ["ABC-EN001", "Ultra Rare"], ["ABC-EN001", "Secret Rare"])]);
    expect(m.get("alpha ABC")).toBeNull();
  });

  it("keeps rarities from different sets apart", () => {
    const m = buildRarityMap([card("Alpha", ["ABC-EN001", "Common"], ["XYZ-EN050", "Secret Rare"])]);
    expect(m.get("alpha ABC")).toBe("Common");
    expect(m.get("alpha XYZ")).toBe("Secret Rare");
  });

  it("ignores printings with no set code", () => {
    const m = buildRarityMap([card("Alpha", ["", "Common"], [null, "Rare"])]);
    expect(m.size).toBe(0);
  });

  it("survives a card with no printings at all", () => {
    expect(buildRarityMap([{ name: "Alpha" }]).size).toBe(0);
  });
});
