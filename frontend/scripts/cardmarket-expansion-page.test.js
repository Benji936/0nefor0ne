import { describe, it, expect } from "vitest";
import {
  idProductFromImage, isPlaceholderImage, parseAlt, readRow,
  readExpansionPage, slugKey,
} from "./cardmarket-expansion-page.mjs";

const IMG = (id, set = "MZMU") =>
  `https://product-images.s3.cardmarket.com/5/${set}/${id}/${id}.jpg`;

describe("idProductFromImage takes the id from the path, or nothing", () => {
  it("reads the captured Pumpking image", () => {
    expect(idProductFromImage(IMG(873125)))
      .toEqual({ set: "MZMU", idProduct: 873125 });
  });

  it("requires the id to appear twice", () => {
    // A single number in a path is not enough: the doubled id is what makes
    // this safe against stray numbers in a URL.
    expect(idProductFromImage("https://product-images.s3.cardmarket.com/5/MZMU/873125/999.jpg")).toBeNull();
  });

  it("reads a hyphenated OCG set code", () => {
    expect(idProductFromImage("https://product-images.s3.cardmarket.com/5/UT01-JP/902618/902618.jpg"))
      .toEqual({ set: "UT01-JP", idProduct: 902618 });
  });

  it("accepts other image extensions", () => {
    expect(idProductFromImage(IMG(1).replace(".jpg", ".webp"))?.idProduct).toBe(1);
  });

  it("is null for anything that is not a product image", () => {
    for (const u of ["", null, undefined, "/img/logo.svg",
                     "https://example.com/5/MZMU/873125/873125.jpg"]) {
      expect(idProductFromImage(u)).toBeNull();
    }
  });
});

describe("parseAlt splits the identity Cardmarket renders", () => {
  it("reads version and rarity", () => {
    expect(parseAlt("Pumpking the King of Grave Ghosts (V.1 - Secret Rare)")).toEqual({
      cardName: "Pumpking the King of Grave Ghosts",
      versionNo: 1, versionLabel: "V.1 - Secret Rare", rarity: "Secret Rare",
    });
  });

  it("reads a version with no rarity", () => {
    expect(parseAlt("Card Trooper (V.2)"))
      .toMatchObject({ versionNo: 2, versionLabel: "V.2", rarity: null });
  });

  it("treats a card with no suffix as a single-version product", () => {
    expect(parseAlt("Santa Claws"))
      .toEqual({ cardName: "Santa Claws", versionNo: null, versionLabel: null, rarity: null });
  });

  it("keeps a hyphenated card name intact", () => {
    // Real row from MZMU page 1.
    expect(parseAlt("Elemental HERO Thunder Giant - Voltic Thunder (V.1 - Super Rare)"))
      .toMatchObject({ cardName: "Elemental HERO Thunder Giant - Voltic Thunder", versionNo: 1 });
  });

  it("is null for nothing usable", () => {
    expect(parseAlt("")).toBeNull();
    expect(parseAlt(null)).toBeNull();
  });
});

describe("readRow reads both attributes and refuses on disagreement", () => {
  const good = {
    imageUrl: IMG(873125),
    alt: "Pumpking the King of Grave Ghosts (V.1 - Secret Rare)",
    href: "/en/YuGiOh/Products/Singles/Maze-of-Muertos/Pumpking-the-King-of-Grave-Ghosts-V1-Secret-Rare",
  };

  it("resolves the captured row at full confidence", () => {
    expect(readRow(good)).toMatchObject({
      ok: true, idProduct: 873125, versionNo: 1,
      versionLabel: "V.1 - Secret Rare", rarity: "Secret Rare", confidence: 1.0,
    });
  });

  it("accepts a slug that stops at the version", () => {
    // Both slug shapes exist: "...-V1-Secret-Rare" and "...-V-1".
    expect(readRow({ ...good, href: ".../Tour-Guide-From-the-Underworld-V-1",
      alt: "Tour Guide From the Underworld (V.1 - Rare)" }).ok).toBe(true);
  });

  it("accepts a row with no href at reduced confidence", () => {
    const out = readRow({ imageUrl: good.imageUrl, alt: good.alt });
    expect(out).toMatchObject({ ok: true, confidence: 0.9, idProduct: 873125 });
  });

  it("refuses when the href is for a different card", () => {
    expect(readRow({ ...good, href: ".../Some-Other-Card-V1-Secret-Rare" }).ok).toBe(false);
  });

  it("skips a row whose image yields no id, rather than guessing", () => {
    expect(readRow({ imageUrl: "/img/placeholder.svg", alt: good.alt }))
      .toMatchObject({ ok: false });
  });

  it("keeps a no-artwork row, with its identity and no id", () => {
    // Real CORI row: Cardmarket has no picture for this product, so every
    // un-illustrated product on the page shares one image. The alt is still
    // correct, and dropping the row hides a product that exists.
    const out = readRow({
      imageUrl: "//static.cardmarket.com/img/3660af732e89ee7bfadc4b521fe525c1/cardImage",
      alt: "Celtic Mystic (V.2 - Starlight Rare)",
    });
    expect(out).toMatchObject({
      ok: true, placeholder: true, idProduct: null,
      cardName: "Celtic Mystic", versionNo: 2, rarity: "Starlight Rare",
    });
  });

  it("marks a pictured row as not a placeholder", () => {
    expect(readRow(good).placeholder).toBe(false);
  });

  it("marks a single-version product as single", () => {
    expect(readRow({ imageUrl: IMG(873245), alt: "Santa Claws" }))
      .toMatchObject({ ok: true, single: true, versionNo: null, rarity: null });
  });
});

describe("readExpansionPage keeps the failures visible", () => {
  it("separates products from placeholders from skipped rows", () => {
    const { products, placeholders, skipped } = readExpansionPage([
      { imageUrl: IMG(873125), alt: "Pumpking the King of Grave Ghosts (V.1 - Secret Rare)" },
      { imageUrl: "/img/logo.svg", alt: "not a product" },
      { imageUrl: IMG(873245), alt: "Santa Claws" },
      { imageUrl: "//static.cardmarket.com/img/3660af732e89ee7bfadc4b521fe525c1/cardImage",
        alt: "Celtic Mystic (V.2 - Starlight Rare)" },
    ]);
    expect(products.map(p => p.idProduct)).toEqual([873125, 873245]);
    expect(placeholders.map(p => p.cardName)).toEqual(["Celtic Mystic"]);
    expect(skipped).toHaveLength(1);
  });

  it("survives empty input", () => {
    expect(readExpansionPage([])).toEqual({ products: [], placeholders: [], skipped: [] });
    expect(readExpansionPage(null)).toEqual({ products: [], placeholders: [], skipped: [] });
  });
});

describe("isPlaceholderImage tells no-artwork apart from broken markup", () => {
  it("recognises the shared no-artwork image", () => {
    expect(isPlaceholderImage("//static.cardmarket.com/img/3660af732e89ee7bfadc4b521fe525c1/cardImage")).toBe(true);
  });

  it("does not treat an unexpected image as a placeholder", () => {
    // A markup change must stay a refusal, not become a silently kept row.
    for (const u of ["/img/logo.svg", "/img/transparent.gif", "", null, IMG(1)]) {
      expect(isPlaceholderImage(u)).toBe(false);
    }
  });
});

describe("slugKey folds punctuation", () => {
  it("makes dash variants comparable", () => {
    expect(slugKey("Fairy Tail – Matchgiru")).toBe(slugKey("Fairy-Tail-Matchgiru"));
  });
});
