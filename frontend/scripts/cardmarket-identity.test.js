import { describe, it, expect } from "vitest";
import { parseIdentity, validatePage, nameKey, rarityKey } from "./cardmarket-identity.mjs";

describe("parseIdentity reads the heading Cardmarket renders", () => {
  it("reads the captured Card Trooper page", () => {
    // Real, from idProduct 262487 on 2026-08-24.
    expect(parseIdentity({
      h1Text: "Card Trooper (V.2 - Mosaic Rare)",
      rarityLabel: "Mosaic Rare",
    })).toEqual({
      ok: true, cardName: "Card Trooper", versionNo: 2,
      versionLabel: "V.2 - Mosaic Rare", rarity: "Mosaic Rare",
    });
  });

  it("reads a seven-version Rarity Collection heading", () => {
    expect(parseIdentity({ h1Text: "Purrely (V.5 - Quarter Century Secret Rare)" }))
      .toEqual({
        ok: true, cardName: "Purrely", versionNo: 5,
        versionLabel: "V.5 - Quarter Century Secret Rare",
        rarity: "Quarter Century Secret Rare",
      });
  });

  it("takes the rarity from the icon when the heading gives only a version", () => {
    expect(parseIdentity({ h1Text: "Card Trooper (V.2)", rarityLabel: "Mosaic Rare" }))
      .toMatchObject({ ok: true, versionNo: 2, rarity: "Mosaic Rare", versionLabel: "V.2" });
  });

  it("leaves rarity null when neither heading nor icon states one", () => {
    expect(parseIdentity({ h1Text: "Card Trooper (V.2)" }))
      .toMatchObject({ ok: true, versionNo: 2, rarity: null });
  });

  it("accepts a rarity with no version number", () => {
    // Fully identified without a V-number; refusing it would strand a printing.
    expect(parseIdentity({ h1Text: "Card Trooper (Mosaic Rare)" }))
      .toMatchObject({ ok: true, versionNo: null, rarity: "Mosaic Rare", versionLabel: "Mosaic Rare" });
  });

  it("accepts an en dash or em dash between version and rarity", () => {
    for (const dash of ["-", "–", "—"]) {
      expect(parseIdentity({ h1Text: `Purrely (V.5 ${dash} Secret Rare)` }))
        .toMatchObject({ ok: true, versionNo: 5, rarity: "Secret Rare" });
    }
  });

  it("keeps brackets that belong to the card's own name", () => {
    expect(parseIdentity({ h1Text: "Number 39: Utopia (Astral Pack) (V.1 - Super Rare)" }))
      .toMatchObject({ ok: true, cardName: "Number 39: Utopia (Astral Pack)", versionNo: 1 });
  });
});

describe("parseIdentity refuses rather than guesses", () => {
  it("refuses a heading with no suffix", () => {
    expect(parseIdentity({ h1Text: "Card Trooper" }))
      .toMatchObject({ ok: false, cardName: "Card Trooper" });
  });

  it("refuses when the heading and the rarity icon disagree", () => {
    // The integrity check. Two independent readings of the same page must agree
    // or the page is not what this parser thinks it is.
    const out = parseIdentity({ h1Text: "Card Trooper (V.2 - Mosaic Rare)", rarityLabel: "Common" });
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/disagrees/);
  });

  it("accepts a spelling difference between the two sources", () => {
    expect(parseIdentity({
      h1Text: "Purrely (V.6 - Collector's Rare)", rarityLabel: "Collectors Rare",
    })).toMatchObject({ ok: true, rarity: "Collector's Rare" });
  });

  it("refuses an empty or missing heading", () => {
    for (const h of ["", "   ", null, undefined]) {
      expect(parseIdentity({ h1Text: h }).ok).toBe(false);
    }
    expect(parseIdentity({}).ok).toBe(false);
    expect(parseIdentity().ok).toBe(false);
  });

  it("refuses a suffix that is only a version zero", () => {
    expect(parseIdentity({ h1Text: "Card Trooper (V.0)" }).ok).toBe(false);
  });

  it("refuses a heading that is only a suffix", () => {
    expect(parseIdentity({ h1Text: "(V.2 - Mosaic Rare)" }).ok).toBe(false);
  });
});

describe("validatePage guards what gets written", () => {
  const good = parseIdentity({ h1Text: "Card Trooper (V.2 - Mosaic Rare)", rarityLabel: "Mosaic Rare" });
  const url = "https://www.cardmarket.com/en/YuGiOh/Products/Singles/Battle-Pack-2-War-of-the-Giants/Card-Trooper-V-2";

  it("passes the page we actually asked for", () => {
    expect(validatePage({ parsed: good, expectedName: "Card Trooper", finalUrl: url }))
      .toEqual({ ok: true });
  });

  it("refuses a page for a different card", () => {
    expect(validatePage({ parsed: good, expectedName: "Purrely", finalUrl: url }).ok).toBe(false);
  });

  it("accepts the dash variants Cardmarket files under one card id", () => {
    // CORI holds "Magician of Dark Chaos – Black Chaos" beside two hyphenated
    // siblings under idMetacard 464816. All three must validate.
    const parsed = parseIdentity({ h1Text: "Magician of Dark Chaos – Black Chaos (V.1 - Ultra Rare)" });
    expect(validatePage({
      parsed, expectedName: "Magician of Dark Chaos - Black Chaos", finalUrl: url,
    })).toEqual({ ok: true });
  });

  it("refuses a challenge page even if something parsed", () => {
    expect(validatePage({
      parsed: good, expectedName: "Card Trooper", finalUrl: url,
      pageText: "Just a moment... cardmarket.com",
    }).ok).toBe(false);
  });

  it("refuses a final URL that is not a Cardmarket single", () => {
    for (const u of ["https://example.com/x", "https://www.cardmarket.com/en/YuGiOh/Products", "", null]) {
      expect(validatePage({ parsed: good, expectedName: "Card Trooper", finalUrl: u }).ok).toBe(false);
    }
  });

  it("passes an unparsed result straight through as a failure", () => {
    expect(validatePage({ parsed: { ok: false, reason: "x" }, expectedName: "y", finalUrl: url }).ok).toBe(false);
  });
});

describe("keys fold spelling, not meaning", () => {
  it("treats dash variants of a name as one card", () => {
    expect(nameKey("Fairy Tail – Matchgiru")).toBe(nameKey("Fairy Tail - Matchgiru"));
    expect(nameKey("GMX – COMPREX")).toBe(nameKey("GMX - COMPREX"));
  });

  it("keeps different cards apart", () => {
    expect(nameKey("Black Chaos")).not.toBe(nameKey("Black Luster Soldier"));
  });

  it("folds rarity punctuation only", () => {
    expect(rarityKey("Collector's Rare")).toBe(rarityKey("Collectors Rare"));
    expect(rarityKey("Secret Rare")).not.toBe(rarityKey("Prismatic Secret Rare"));
  });
});
