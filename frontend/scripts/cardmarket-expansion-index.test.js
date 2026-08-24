import { describe, it, expect } from "vitest";
import {
  slugFromUrl, singlesUrlFromExpansionUrl, sampleProductId,
  readExpansionRow, readExpansionIndex,
} from "./cardmarket-expansion-index.mjs";

/** The real MZMU row, captured from /en/YuGiOh/Expansions on 2026-08-24. */
const MZMU = {
  setCode: "MZMU",
  name: "Maze of Muertos",
  dataUrl: "/en/YuGiOh/Expansions/Maze-of-Muertos",
  cardCountText: "142 Cards",
  imageUrl: "https://product-images.s3.cardmarket.com/5/MZMU/873126/873126.jpg",
};

describe("slugFromUrl takes the slug Cardmarket published", () => {
  it("reads the MZMU slug", () => {
    expect(slugFromUrl(MZMU.dataUrl)).toBe("Maze-of-Muertos");
  });

  it("handles other locales", () => {
    expect(slugFromUrl("/de/YuGiOh/Expansions/Maze-of-Muertos")).toBe("Maze-of-Muertos");
  });

  it("is null for anything else", () => {
    for (const u of ["", null, "/en/YuGiOh/Products/Singles/Maze-of-Muertos"]) {
      expect(slugFromUrl(u)).toBeNull();
    }
  });
});

describe("singlesUrlFromExpansionUrl substitutes a path, it does not invent a slug", () => {
  it("builds the URL we verified five pages of", () => {
    expect(singlesUrlFromExpansionUrl(MZMU.dataUrl))
      .toBe("/en/YuGiOh/Products/Singles/Maze-of-Muertos");
  });

  it("keeps the caller's locale", () => {
    expect(singlesUrlFromExpansionUrl("/fr/YuGiOh/Expansions/Maze-of-Muertos"))
      .toBe("/fr/YuGiOh/Products/Singles/Maze-of-Muertos");
  });

  it("refuses a URL that is not an expansion link", () => {
    for (const u of ["/en/YuGiOh/Products/Singles/X", "https://example.com/x", "", null]) {
      expect(singlesUrlFromExpansionUrl(u)).toBeNull();
    }
  });
});

describe("sampleProductId is the joinable key", () => {
  it("reads the id from the row's sample image", () => {
    expect(sampleProductId(MZMU.imageUrl)).toBe(873126);
  });

  it("requires the doubled id", () => {
    expect(sampleProductId("https://product-images.s3.cardmarket.com/5/MZMU/873126/1.jpg")).toBeNull();
  });

  it("is null for the transparent placeholder an unpopulated row uses", () => {
    expect(sampleProductId("/img/transparent.gif")).toBeNull();
  });
});

describe("readExpansionRow", () => {
  it("reads the captured MZMU row whole", () => {
    expect(readExpansionRow(MZMU)).toEqual({
      setCode: "MZMU",
      expansionName: "Maze of Muertos",
      slug: "Maze-of-Muertos",
      expansionUrl: "/en/YuGiOh/Expansions/Maze-of-Muertos",
      singlesUrl: "/en/YuGiOh/Products/Singles/Maze-of-Muertos",
      idExpansion: null,
      cardCount: 142,
      sampleProduct: 873126,
    });
  });

  it("keeps an empty expansion, with nothing to join on", () => {
    // Real row: "Magnificent Maestros", 0 Cards, placeholder image.
    const out = readExpansionRow({
      setCode: "MAMS", name: "Magnificent Maestros",
      dataUrl: "/en/YuGiOh/Expansions/Magnificent-Maestros",
      cardCountText: "0 Cards", imageUrl: "/img/transparent.gif",
    });
    expect(out).toMatchObject({ setCode: "MAMS", cardCount: 0, sampleProduct: null });
  });

  it("parses a thousands separator in the card count", () => {
    expect(readExpansionRow({ ...MZMU, cardCountText: "1,259 Cards" }).cardCount).toBe(1259);
  });

  it("returns null when there is no usable URL", () => {
    expect(readExpansionRow({ ...MZMU, dataUrl: null })).toBeNull();
    expect(readExpansionRow({})).toBeNull();
  });

  it("never reports an idExpansion, because the page does not publish one", () => {
    expect(readExpansionRow(MZMU).idExpansion).toBeNull();
  });
});

describe("readExpansionIndex", () => {
  it("counts what is joinable separately from what is present", () => {
    const { expansions, stats } = readExpansionIndex([
      MZMU,
      { setCode: "MAMS", name: "Magnificent Maestros",
        dataUrl: "/en/YuGiOh/Expansions/Magnificent-Maestros",
        cardCountText: "0 Cards", imageUrl: "/img/transparent.gif" },
    ]);
    expect(expansions).toHaveLength(2);
    expect(stats).toMatchObject({
      total: 2, withSetCode: 2, withName: 2, withSinglesUrl: 2,
      withIdExpansion: 0, joinableByProduct: 1,
    });
  });

  it("survives empty input", () => {
    expect(readExpansionIndex([]).expansions).toEqual([]);
    expect(readExpansionIndex(null).expansions).toEqual([]);
  });
});
