import { describe, it, expect } from "vitest";
import {
  CONDITIONS,
  LANGUAGES,
  languageTag,
  shortenRarity,
  printingLabel,
  printingOptions,
  parsePrinting,
  buildCopyPatch,
  isCopyUnchanged,
} from "./cardCopy.js";

/** A copy as the collection stores it, pinned to one Cardmarket product. */
const copy = (over = {}) => ({
  id: 7,
  name: "Marshmao☆Yummy",
  extension: "DOOD-EN024",
  rarity: "Secret Rare",
  language: "English",
  condition: "Near Mint",
  first_edition: false,
  quantity: 1,
  cardmarket_product_id: 812345,
  ...over,
});

/** The same values back out of the form, unchanged. */
const form = (over = {}) => ({
  extension: "DOOD-EN024",
  rarity: "Secret Rare",
  language: "English",
  condition: "Near Mint",
  first_edition: false,
  quantity: 1,
  ...over,
});

describe("the vocabulary a copy is described in", () => {
  it("offers conditions worst-preserving last, as a grading scale reads", () => {
    expect(CONDITIONS[0]).toBe("Mint");
    expect(CONDITIONS.at(-1)).toBe("Poor");
  });

  it("offers the languages Cardmarket prices separately", () => {
    expect(LANGUAGES).toContain("English");
    expect(LANGUAGES).toContain("Portuguese");
  });

  it("tags a language in two letters", () => {
    expect(languageTag("English")).toBe("EN");
    expect(languageTag("German")).toBe("DE");
    // Anything unmapped still gets a tag rather than a blank chip.
    expect(languageTag("Korean")).toBe("KO");
    expect(languageTag(null)).toBe("");
  });

  it("shortens a rarity to its initials", () => {
    expect(shortenRarity("Secret Rare")).toBe("SR");
    expect(shortenRarity("Quarter Century Secret Rare")).toBe("QCSR");
    expect(shortenRarity("common")).toBe("C");
    expect(shortenRarity(null)).toBe("");
  });
});

describe("printing labels", () => {
  const card = { card_sets: [
    { set_code: "DOOD-EN024", set_rarity: "Secret Rare" },
    { set_code: "DOOD-EN024", set_rarity: "Starlight Rare" },
  ] };

  it("builds the same label the add form stored, so an edit can preselect it", () => {
    expect(printingLabel(card.card_sets[0])).toBe("DOOD-EN024 | Secret Rare");
    expect(printingOptions(card)).toEqual([
      "DOOD-EN024 | Secret Rare",
      "DOOD-EN024 | Starlight Rare",
    ]);
  });

  it("keeps both printings of one print code, which differ only by rarity", () => {
    // The case a set-code-only key would collapse: same code, two products,
    // and a €40 difference between them.
    expect(new Set(printingOptions(card)).size).toBe(2);
  });

  it("splits a label back into the two columns it is stored in", () => {
    expect(parsePrinting("DOOD-EN024 | Secret Rare"))
      .toEqual({ extension: "DOOD-EN024", rarity: "Secret Rare" });
  });

  it("survives a label that is not one", () => {
    expect(parsePrinting("")).toEqual({ extension: null, rarity: null });
    expect(parsePrinting(undefined)).toEqual({ extension: null, rarity: null });
  });

  it("survives a card with no printings at all", () => {
    expect(printingOptions({})).toEqual([]);
    expect(printingOptions(null)).toEqual([]);
  });
});

describe("buildCopyPatch", () => {
  it("writes every field the add form writes", () => {
    const { patch, errors } = buildCopyPatch(copy(), form({ condition: "Played" }));
    expect(errors).toEqual([]);
    expect(patch).toMatchObject({
      extension: "DOOD-EN024", rarity: "Secret Rare",
      language: "English", condition: "Played",
      first_edition: false, quantity: 1,
    });
  });

  // The trap this module exists for. The pin outranks every other price signal,
  // so a printing change that left it behind would quote the old product for
  // ever, and nothing on screen would say so.
  it("drops the pinned Cardmarket product when the printing moves", () => {
    const { patch } = buildCopyPatch(copy(), form({ rarity: "Starlight Rare" }));
    expect(patch.cardmarket_product_id).toBe(null);
  });

  it("drops the pin when only the set code moves", () => {
    const { patch } = buildCopyPatch(copy(), form({ extension: "RA04-EN024" }));
    expect(patch.cardmarket_product_id).toBe(null);
  });

  it("keeps a hand-picked pin when the printing did not move", () => {
    // Re-saving the dialog after changing only the condition must not throw
    // away an answer somebody gave the printing picker.
    const { patch } = buildCopyPatch(copy(), form({ condition: "Good" }));
    expect("cardmarket_product_id" in patch).toBe(false);
  });

  it("refuses a copy with no printing", () => {
    const { errors } = buildCopyPatch(copy(), form({ extension: null }));
    expect(errors).toContain("printing");
  });

  it("refuses a quantity below one", () => {
    expect(buildCopyPatch(copy(), form({ quantity: 0 })).errors).toContain("quantity");
    expect(buildCopyPatch(copy(), form({ quantity: -2 })).errors).toContain("quantity");
    expect(buildCopyPatch(copy(), form({ quantity: 1.5 })).errors).toContain("quantity");
  });

  it("refuses a quantity below what accepted trades already hold", () => {
    // Two copies are committed; dropping to one would sell a card twice.
    expect(buildCopyPatch(copy(), form({ quantity: 1 }), 2).errors).toContain("reserved");
    expect(buildCopyPatch(copy(), form({ quantity: 2 }), 2).errors).toEqual([]);
  });

  it("treats a missing edition flag as unlimited rather than dropping it", () => {
    const { patch } = buildCopyPatch(copy(), form({ first_edition: undefined }));
    expect(patch.first_edition).toBe(false);
  });
});

describe("isCopyUnchanged", () => {
  it("is true when the dialog was opened and closed without a change", () => {
    const { patch } = buildCopyPatch(copy(), form());
    expect(isCopyUnchanged(copy(), patch)).toBe(true);
  });

  it("is false once any field moves", () => {
    const { patch } = buildCopyPatch(copy(), form({ condition: "Poor" }));
    expect(isCopyUnchanged(copy(), patch)).toBe(false);
  });

  it("compares the edition flag as a boolean, not by identity", () => {
    const { patch } = buildCopyPatch(copy({ first_edition: null }), form());
    expect(isCopyUnchanged(copy({ first_edition: null }), patch)).toBe(true);
  });
});
