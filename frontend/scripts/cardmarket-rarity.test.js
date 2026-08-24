import { describe, it, expect } from "vitest";
import {
  rarityKey,
  displayRarity,
  groupPrintings,
  resolvePrintings,
} from "./cardmarket-rarity.mjs";

/** A Cardmarket single, with exactly the fields the real file carries. */
const prod = (idProduct, idExpansion, idMetacard, name) => ({
  idProduct, idExpansion, idMetacard, name,
});

describe("rarityKey absorbs spelling, not meaning", () => {
  it("ignores case, spaces and punctuation", () => {
    expect(rarityKey("Collector's Rare")).toBe("collectorsrare");
    expect(rarityKey("Collectors Rare")).toBe("collectorsrare");
    expect(rarityKey("  COLLECTORS   RARE  ")).toBe("collectorsrare");
  });

  it("absorbs YGOPRODeck's own typo, which is 80 of its 81 RA05 rows", () => {
    expect(rarityKey("PLatinum Secret Rare")).toBe(rarityKey("Platinum Secret Rare"));
  });

  it("normalises a curly apostrophe to a straight one", () => {
    expect(rarityKey("Collector’s Rare")).toBe(rarityKey("Collector's Rare"));
  });

  it("keeps rarities apart that might be different products", () => {
    const keys = ["Secret Rare", "Prismatic Secret Rare", "Extra Secret Rare"].map(rarityKey);
    expect(new Set(keys).size).toBe(3);
  });

  it("is null for nothing usable", () => {
    expect(rarityKey("")).toBeNull();
    expect(rarityKey(null)).toBeNull();
    expect(rarityKey(undefined)).toBeNull();
    expect(rarityKey("   ")).toBeNull();
  });
});

describe("displayRarity", () => {
  it("canonicalises the two spellings that differ between sources", () => {
    expect(displayRarity("PLatinum Secret Rare")).toBe("Platinum Secret Rare");
    expect(displayRarity("Collectors Rare")).toBe("Collector's Rare");
  });

  it("keeps every other rarity in its own wording", () => {
    expect(displayRarity("Common")).toBe("Common");
    expect(displayRarity("Ghost Rare")).toBe("Ghost Rare");
    expect(displayRarity("Duel Terminal Normal Parallel Rare")).toBe("Duel Terminal Normal Parallel Rare");
  });

  it("tidies whitespace without rewording", () => {
    expect(displayRarity("  Ghost   Rare ")).toBe("Ghost Rare");
  });

  it("drops the notes YGOPRODeck files under set_rarity", () => {
    for (const junk of ["New", "Reprint", "2", "3", "European debut", "New artwork"]) {
      expect(displayRarity(junk)).toBeNull();
    }
  });

  it("does not guess at an abbreviation", () => {
    // "Cr" appears once in the whole database. It probably means Collector's
    // Rare. Probably is not good enough to put a price behind.
    expect(displayRarity("Cr")).toBeNull();
    expect(displayRarity("force-SMW")).toBeNull();
  });

  it("is null for nothing usable", () => {
    expect(displayRarity(null)).toBeNull();
    expect(displayRarity("")).toBeNull();
  });
});

describe("groupPrintings keys on the card, not its spelling", () => {
  it("keeps one card's two spellings together", () => {
    // 61 metacards carry two names. Grouping by name would price one card twice.
    const g = groupPrintings([
      prod(1, 900, 339006, "Fairy Tale Tails"),
      prod(2, 900, 339006, "Fairy Tail Tales"),
    ]);
    expect(g.size).toBe(1);
  });

  it("keeps together a group whose names differ by an en-dash", () => {
    // Real: CORI expansion 6536 metacard 464816 holds three products, one of
    // which spells the name with U+2013.
    const g = groupPrintings([
      prod(894755, 6536, 464816, "Magician of Dark Chaos – Black Chaos"),
      prod(894838, 6536, 464816, "Magician of Dark Chaos - Black Chaos"),
      prod(894839, 6536, 464816, "Magician of Dark Chaos - Black Chaos"),
    ]);
    expect(g.size).toBe(1);
    expect([...g.values()][0]).toHaveLength(3);
  });

  it("keeps the same card in two sets apart", () => {
    const g = groupPrintings([
      prod(1, 900, 500, "Purrely"),
      prod(2, 901, 500, "Purrely"),
    ]);
    expect(g.size).toBe(2);
  });
});

describe("resolvePrintings names a rarity only when the card has one", () => {
  const RA02 = 5604;
  const expansions = new Map([[RA02, "RA02"]]);

  // The seven RA02 Purrely products. Cardmarket says nothing about which is
  // which; neither does this module.
  const purrely = [769695, 769776, 769857, 769941, 770026, 770107, 770188]
    .map((id) => prod(id, RA02, 671672, "Purrely"));

  const ra02Rarities = [
    "Collector's Rare", "Platinum Secret Rare", "Quarter Century Secret Rare",
    "Secret Rare", "Super Rare", "Ultimate Rare", "Ultra Rare",
  ];

  it("refuses to name any of RA02 Purrely's seven versions", () => {
    // The load-bearing test. Seven products, seven rarities, and no field in
    // the catalogue connecting them. Lining them up by idProduct order would
    // put 5.62 EUR behind a guess; the app shows a band and asks instead.
    const out = resolvePrintings(purrely, expansions, new Map([["purrely RA02", ra02Rarities]]));
    expect([...out.values()].every((v) => v.rarity === null)).toBe(true);
    expect([...out.values()].every((v) => v.source === null)).toBe(true);
  });

  it("gives an ordinary single-printing card its one rarity", () => {
    const one = [prod(709318, 5234, 800, "Purrely Sleepy Memory")];
    const out = resolvePrintings(one, new Map([[5234, "CYAC"]]), new Map([["purrely sleepy memory CYAC", ["Common"]]]));
    expect(out.get(709318)).toEqual({ rarity: "Common", source: "unique" });
  });

  it("labels every product when a set printed the card at one rarity only", () => {
    // Two products, one rarity. Whichever is which, both are Common -- that is
    // a claim about the card, not about either product's position.
    const two = [prod(1, 900, 500, "Alpha"), prod(2, 900, 500, "Alpha")];
    const out = resolvePrintings(two, new Map([[900, "AAA"]]), new Map([["alpha AAA", ["Common", "Common"]]]));
    expect(out.get(1)).toEqual({ rarity: "Common", source: "unique" });
    expect(out.get(2)).toEqual({ rarity: "Common", source: "unique" });
  });

  it("prices a card in two sets from each set's own rarity", () => {
    const two = [prod(1, 900, 500, "Alpha"), prod(2, 901, 500, "Alpha")];
    const out = resolvePrintings(
      two,
      new Map([[900, "AAA"], [901, "BBB"]]),
      new Map([["alpha AAA", ["Common"]], ["alpha BBB", ["Secret Rare"]]]),
    );
    expect(out.get(1).rarity).toBe("Common");
    expect(out.get(2).rarity).toBe("Secret Rare");
  });

  it("leaves rarity null when the card has two rarities in the set", () => {
    const two = [prod(1, 900, 500, "Alpha"), prod(2, 900, 500, "Alpha")];
    const out = resolvePrintings(two, new Map([[900, "AAA"]]), new Map([["alpha AAA", ["Ultra Rare", "Secret Rare"]]]));
    expect(out.get(1).rarity).toBeNull();
    expect(out.get(2).rarity).toBeNull();
  });

  it("leaves rarity null when the set code was never resolved", () => {
    const one = [prod(1, 999, 500, "Alpha")];
    const out = resolvePrintings(one, new Map(), new Map([["alpha AAA", ["Common"]]]));
    expect(out.get(1).rarity).toBeNull();
  });

  it("ignores a junk rarity rather than treating it as a second one", () => {
    // "New" is not a rarity, so this card still has exactly one.
    const one = [prod(1, 900, 500, "Alpha")];
    const out = resolvePrintings(one, new Map([[900, "AAA"]]), new Map([["alpha AAA", ["Common", "New"]]]));
    expect(out.get(1)).toEqual({ rarity: "Common", source: "unique" });
  });

  it("treats two spellings of one rarity as one rarity", () => {
    const one = [prod(1, 900, 500, "Alpha")];
    const out = resolvePrintings(
      one, new Map([[900, "AAA"]]),
      new Map([["alpha AAA", ["PLatinum Secret Rare", "Platinum Secret Rare"]]]),
    );
    expect(out.get(1)).toEqual({ rarity: "Platinum Secret Rare", source: "unique" });
  });

  it("does not depend on the order products arrive in", () => {
    // Array order carries no meaning, so shuffling the input must not change
    // a single result.
    const ids = [5, 1, 4, 2, 3];
    const build = (order) => resolvePrintings(
      order.map((id) => prod(id, 900, 500, "Alpha")),
      new Map([[900, "AAA"]]),
      new Map([["alpha AAA", ["Common"]]]),
    );
    const a = build(ids);
    const b = build([...ids].reverse());
    for (const id of ids) expect(a.get(id)).toEqual(b.get(id));
  });
});
