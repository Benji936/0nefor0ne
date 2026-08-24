import { describe, it, expect } from "vitest";
import {
  planPrinting, planExpansion, assignRows,
  SOURCE_DIRECT, SOURCE_ELIMINATION,
} from "./cardmarket-elimination.mjs";

/** A page row as the expansion-page extractor hands it over. */
const row = (idProduct, versionNo, rarity, cardName = "Celtic Mystic") => ({
  idProduct, cardName, versionNo,
  versionLabel: versionNo ? `V.${versionNo} - ${rarity}` : null, rarity,
});

describe("planPrinting resolves a printing only when the whole set closes", () => {
  it("names the last product when one id and one row are left", () => {
    const out = planPrinting({
      idMetacard: 464800,
      localIds: [894689, 894690],
      rows: [row(894689, 1, "Secret Rare"), row(null, 2, "Starlight Rare")],
    });
    expect(out.status).toBe("elimination");
    expect(out.identities).toEqual([
      { idProduct: 894689, versionNo: 1, versionLabel: "V.1 - Secret Rare", rarity: "Secret Rare", source: SOURCE_DIRECT },
      { idProduct: 894690, versionNo: 2, versionLabel: "V.2 - Starlight Rare", rarity: "Starlight Rare", source: SOURCE_ELIMINATION },
    ]);
  });

  it("marks a fully pictured printing direct, with no elimination claimed", () => {
    const out = planPrinting({
      idMetacard: 1, localIds: [10, 11],
      rows: [row(10, 1, "Super Rare"), row(11, 2, "Ultra Rare")],
    });
    expect(out.status).toBe("direct");
    expect(out.identities.every((i) => i.source === SOURCE_DIRECT)).toBe(true);
  });

  it("refuses two unknowns even though the counts match", () => {
    // The heart of it: 2 ids and 2 rows have two possible pairings and nothing
    // in the data picks one. Counts agreeing is not the same as being unique.
    const out = planPrinting({
      idMetacard: 1, localIds: [10, 11],
      rows: [row(null, 1, "Secret Rare"), row(null, 2, "Starlight Rare")],
    });
    expect(out.status).toBe("unresolved");
    expect(out.reason).toMatch(/2 unnamed product\(s\) against 2 unnamed row\(s\)/);
  });

  it("refuses three-product printings with two unknowns", () => {
    const out = planPrinting({
      idMetacard: 1, localIds: [10, 11, 12],
      rows: [row(10, 1, "Secret"), row(null, 2, "Ultra"), row(null, 3, "Starlight")],
    });
    expect(out.status).toBe("unresolved");
  });

  it("resolves a three-product printing with one unknown", () => {
    const out = planPrinting({
      idMetacard: 1, localIds: [10, 11, 12],
      rows: [row(10, 1, "Secret"), row(12, 2, "Ultra"), row(null, 3, "Starlight")],
    });
    expect(out.status).toBe("elimination");
    expect(out.identities.find((i) => i.source === SOURCE_ELIMINATION).idProduct).toBe(11);
  });

  it("refuses when the page is short a row", () => {
    const out = planPrinting({
      idMetacard: 1, localIds: [10, 11, 12],
      rows: [row(10, 1, "Secret"), row(null, 2, "Ultra")],
    });
    expect(out.status).toBe("unresolved");
    expect(out.reason).toMatch(/2 rows for 3 products/);
  });

  it("refuses when the page names an id we do not hold", () => {
    const out = planPrinting({
      idMetacard: 1, localIds: [10, 11],
      rows: [row(999, 1, "Secret"), row(null, 2, "Ultra")],
    });
    expect(out.status).toBe("unresolved");
    expect(out.reason).toMatch(/not in this printing: 999/);
  });

  it("refuses when one id is claimed by two rows", () => {
    const out = planPrinting({
      idMetacard: 1, localIds: [10, 11],
      rows: [row(10, 1, "Secret"), row(10, 2, "Ultra")],
    });
    expect(out.status).toBe("unresolved");
    expect(out.reason).toMatch(/more than one row/);
  });

  it("refuses when a row states no variant at all", () => {
    const out = planPrinting({
      idMetacard: 1, localIds: [10, 11],
      rows: [row(10, 1, "Secret"), { idProduct: null, cardName: "X", versionNo: null, versionLabel: null, rarity: null }],
    });
    expect(out.status).toBe("unresolved");
    expect(out.reason).toMatch(/no version or rarity/);
  });

  it("refuses when two rows describe the same variant", () => {
    const out = planPrinting({
      idMetacard: 1, localIds: [10, 11],
      rows: [row(10, 2, "Starlight Rare"), row(null, 2, "Starlight Rare")],
    });
    expect(out.status).toBe("unresolved");
    expect(out.reason).toMatch(/share the identity/);
  });

  it("never returns a partial identity list for an unresolved printing", () => {
    const out = planPrinting({
      idMetacard: 1, localIds: [10, 11, 12],
      rows: [row(10, 1, "Secret"), row(null, 2, "Ultra"), row(null, 3, "Starlight")],
    });
    expect(out.identities).toEqual([]);
  });

  it("says so when the printing is absent from the page entirely", () => {
    expect(planPrinting({ idMetacard: 1, localIds: [10, 11], rows: [] }).reason)
      .toBe("printing absent from page");
  });
});

describe("assignRows bridges page to catalogue on name, and checks the bridge", () => {
  it("folds the dash Cardmarket writes two ways inside one printing", () => {
    // Real CORI rows: the catalogue holds both an en dash and a hyphen for the
    // same printing, so an unfolded comparison splits one card into two.
    const { assigned } = assignRows({
      localProducts: [
        { id_product: 894706, id_metacard: 464802, name: "Inferno of the Sacred Beasts – Uria, Lord of Searing Flames" },
        { id_product: 894707, id_metacard: 464802, name: "Inferno of the Sacred Beasts - Uria, Lord of Searing Flames" },
      ],
      pageRows: [row(894706, 1, "Secret", "Inferno of the Sacred Beasts - Uria, Lord of Searing Flames")],
    });
    expect(assigned).toHaveLength(1);
    expect(assigned[0].rows).toHaveLength(1);
  });

  it("refuses a name two printings answer to", () => {
    const { assigned, conflicts } = assignRows({
      localProducts: [
        { id_product: 1, id_metacard: 100, name: "Twin Card" },
        { id_product: 2, id_metacard: 200, name: "Twin Card" },
      ],
      pageRows: [row(1, 1, "Secret", "Twin Card")],
    });
    expect(assigned).toEqual([]);
    expect(conflicts).toHaveLength(2);
  });

  it("reports rows for cards we do not hold rather than dropping them", () => {
    const { orphanRows } = assignRows({
      localProducts: [{ id_product: 1, id_metacard: 100, name: "Known" }],
      pageRows: [row(1, 1, "Secret", "Known"), row(2, 1, "Secret", "Unknown Card")],
    });
    expect(orphanRows.map((r) => r.cardName)).toEqual(["Unknown Card"]);
  });
});

describe("planExpansion persists per printing, not per expansion", () => {
  const localProducts = [
    // A: both pictured.
    { id_product: 10, id_metacard: 1, name: "A" },
    { id_product: 11, id_metacard: 1, name: "A" },
    // B: one pictured, one placeholder -- recoverable.
    { id_product: 20, id_metacard: 2, name: "B" },
    { id_product: 21, id_metacard: 2, name: "B" },
    // C: both placeholders -- ambiguous.
    { id_product: 30, id_metacard: 3, name: "C" },
    { id_product: 31, id_metacard: 3, name: "C" },
    // D: a single-product printing, which needs no identity at all.
    { id_product: 40, id_metacard: 4, name: "D" },
  ];
  const pageRows = [
    row(10, 1, "Secret", "A"), row(11, 2, "Ultra", "A"),
    row(20, 1, "Secret", "B"), row(null, 2, "Starlight", "B"),
    row(null, 1, "Secret", "C"), row(null, 2, "Starlight", "C"),
    row(40, null, null, "D"),
  ];

  it("does not let the ambiguous printing withhold the settled ones", () => {
    const { plans, summary } = planExpansion({ localProducts, pageRows });
    expect(summary).toMatchObject({
      multiProductPrintings: 3, singleProductPrintings: 1,
      resolvedDirect: 1, resolvedByElimination: 1, unresolved: 1,
      identitiesDirect: 3, identitiesByElimination: 1,
    });
    expect(plans.find((p) => p.name === "C").identities).toEqual([]);
  });

  it("writes nothing for the single-product printing", () => {
    const { plans } = planExpansion({ localProducts, pageRows });
    expect(plans.map((p) => p.name)).toEqual(["A", "B", "C"]);
  });

  it("counts placeholders separately from named rows", () => {
    const { summary } = planExpansion({ localProducts, pageRows });
    expect(summary).toMatchObject({ pageRows: 7, pageRowsWithId: 4, pageRowsPlaceholder: 3 });
  });
});
