import { describe, expect, it, vi } from "vitest";
import * as sweep from "./cardmarket-sweep.mjs";
import { assertNoFailures, attemptedExpansionIds, boundedGroupBatch, collectorNumberRiskKeys, confirmedTcgExpansionIds, createAgentBrowser, identityRows, isJapaneseRoute, japaneseExpansionIds, needsCollectorNumberEnrichment, needsIdentityEnrichment, pageCountFromText, parseAgentBrowserResult, pendingRoutes, planScrapedExpansion, readAllPages, runExpansion, runTargetedPrinting, scrapeExpansion, targetedSearchUrl, waitForChallengeClear, waitForListingReady, withRetries } from "./cardmarket-sweep.mjs";

describe("confirmedTcgExpansionIds", () => {
  it("keeps only expansions the importer mapped to a TCG set code", () => {
    expect([...confirmedTcgExpansionIds([
      { id_expansion: 4562, set_code: null },
      { id_expansion: 4565, set_code: "TAMA" },
      { id_expansion: 4565, set_code: "TAMA" },
    ])]).toEqual([4565]);
  });
});

describe("japaneseExpansionIds", () => {
  it("uses Cardmarket's canonical OCG catalogue label instead of guessing from page names", () => {
    const ids = japaneseExpansionIds([
      { idExpansion: 4520, name: "Secret Shiny Box (OCG) Box" },
      { idExpansion: 4521, name: "Premium Pack 2022 (OCG) Booster" },
      { idExpansion: 4565, name: "Tactical Masters Booster" },
    ]);

    expect([...ids]).toEqual([4520, 4521]);
  });
});

describe("isJapaneseRoute", () => {
  it("recognizes Cardmarket's explicit OCG, Japanese, and JP route markers", () => {
    expect(isJapaneseRoute({ cardmarket_name: "Eternity Code (OCG)" })).toBe(true);
    expect(isJapaneseRoute({ slug: "Phantom-Rage-Japanese" })).toBe(true);
    expect(isJapaneseRoute({ cardmarket_set_code: "PHRA-JP" })).toBe(true);
    expect(isJapaneseRoute({ cardmarket_set_code: "20CP-JPF" })).toBe(true);
    expect(isJapaneseRoute({ cardmarket_name: "Tactical Masters", cardmarket_set_code: "TAMA" })).toBe(false);
  });
});

describe("needsCollectorNumberEnrichment", () => {
  const verified = (overrides) => ({
    id_metacard: 42,
    name: "Blue-Eyes White Dragon",
    identity_source: "cardmarket_expansion_page",
    ...overrides,
  });

  it("finds a verified repeated rarity with a missing printed number", () => {
    expect(needsCollectorNumberEnrichment([
      verified({ rarity: "Quarter Century Secret Rare", collector_number: "024" }),
      verified({ rarity: "Quarter-Century Secret Rare", collector_number: null }),
    ])).toBe(true);
  });

  it("ignores groups whose repeated rarity already has every printed number", () => {
    expect(needsCollectorNumberEnrichment([
      verified({ rarity: "Ultra Rare", collector_number: "001" }),
      verified({ rarity: "Ultra Rare", collector_number: "002" }),
    ])).toBe(false);
  });

  it("waits for normal identity enrichment before backfilling printed numbers", () => {
    expect(needsCollectorNumberEnrichment([
      verified({ rarity: "Common", collector_number: null }),
      { id_metacard: 42, identity_source: null, rarity: "Common", collector_number: null },
    ])).toBe(false);
  });

  it("can restrict work to printing groups with genuinely different YGOPRODeck numbers", () => {
    const products = [
      verified({ set_code: "RA04", rarity: "Ultra Rare", collector_number: null }),
      verified({ set_code: "RA04", rarity: "Ultra Rare", collector_number: null }),
    ];

    expect(needsCollectorNumberEnrichment(products, new Set(["blue-eyes white dragon|RA04|ultrarare"]))).toBe(true);
    expect(needsCollectorNumberEnrichment(products, new Set(["blue-eyes white dragon|RA04|secretrare"]))).toBe(false);
  });
});

describe("collectorNumberRiskKeys", () => {
  it("finds only same-set same-rarity printings whose normalized numbers differ", () => {
    const keys = collectorNumberRiskKeys([{
      id: 42,
      name: "Blue-Eyes White Dragon",
      card_sets: [
        { set_code: "RA04-EN002", set_rarity: "Quarter Century Secret Rare" },
        { set_code: "RA04-FR002", set_rarity: "Quarter-Century Secret Rare" },
        { set_code: "RA04-EN108", set_rarity: "Quarter Century Secret Rare" },
        { set_code: "RA04-EN150", set_rarity: "Ultra Rare" },
      ],
    }, {
      id: 99,
      name: "Dark Magician",
      card_sets: [
        { set_code: "LOB-E001", set_rarity: "Ultra Rare" },
        { set_code: "LOB-EN001", set_rarity: "Ultra Rare" },
      ],
    }]);

    expect([...keys]).toEqual(["blue-eyes white dragon|RA04|quartercenturysecretrare"]);
  });
});

describe("attemptedExpansionIds", () => {
  it("prevents automatic retries for every previously audited status", () => {
    expect([...attemptedExpansionIds([
      { id_expansion: 1, status: "complete" },
      { id_expansion: 2, status: "partial" },
      { id_expansion: 3, status: "failed" },
    ])]).toEqual([1, 2, 3]);
  });
});

describe("failedExpansionIds", () => {
  it("retries only expansions whose most recent run failed", () => {
    expect(sweep.failedExpansionIds).toBeTypeOf("function");
    expect([...sweep.failedExpansionIds([
      { id_expansion: 1, status: "failed", started_at: "2026-08-26T10:00:00Z" },
      { id_expansion: 1, status: "complete", started_at: "2026-08-26T11:00:00Z" },
      { id_expansion: 2, status: "partial", started_at: "2026-08-26T10:00:00Z" },
      { id_expansion: 3, status: "failed", started_at: "2026-08-26T12:00:00Z" },
      { id_expansion: 3, status: "partial", started_at: "2026-08-26T09:00:00Z" },
    ])]).toEqual([3]);
  });
});

describe("partialExpansionIds", () => {
  it("selects only expansions whose most recent run is partial", () => {
    expect(sweep.partialExpansionIds).toBeTypeOf("function");
    expect([...sweep.partialExpansionIds([
      { id_expansion: 1, status: "partial", started_at: "2026-08-26T10:00:00Z" },
      { id_expansion: 1, status: "complete", started_at: "2026-08-26T11:00:00Z" },
      { id_expansion: 2, status: "failed", started_at: "2026-08-26T12:00:00Z" },
      { id_expansion: 3, status: "partial", started_at: "2026-08-26T12:00:00Z" },
    ])]).toEqual([3]);
  });
});

describe("needsIdentityEnrichment", () => {
  it("skips expansions that have no unresolved sibling versions", () => {
    expect(needsIdentityEnrichment([
      { id_product: 1, id_metacard: 10, identity_source: null },
      { id_product: 2, id_metacard: 20, identity_source: null },
    ])).toBe(false);
  });

  it("checks an expansion when sibling products lack verified identities", () => {
    expect(needsIdentityEnrichment([
      { id_product: 1, id_metacard: 10, identity_source: "cardmarket_expansion_page" },
      { id_product: 2, id_metacard: 10, identity_source: null },
    ])).toBe(true);
  });
});

describe("waitForChallengeClear", () => {
  it("pauses on a Cloudflare challenge until the user clears it", async () => {
    const pages = [
      { title: "Just a moment...", rows: [] },
      { title: "Just a moment...", rows: [] },
      { title: "Force of the Breaker", rows: [{ alt: "Card" }] },
    ];
    const sleep = vi.fn().mockResolvedValue();
    const onChallenge = vi.fn();

    const page = await waitForChallengeClear(async () => pages.shift(), {
      sleep,
      onChallenge,
      pollMs: 2_000,
      maxWaitMs: 10_000,
    });

    expect(page.title).toBe("Force of the Breaker");
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(onChallenge).toHaveBeenCalledTimes(1);
  });
});

describe("waitForListingReady", () => {
  it("does not accept an empty or partially rendered gallery", async () => {
    const snapshots = [
      { title: "Maze", pageCount: 1, rows: [] },
      { title: "Maze", pageCount: 1, rows: [{ href: "/card-1" }] },
      { title: "Maze", pageCount: 1, rows: [{ href: "/card-1" }, { href: "/card-2" }] },
      { title: "Maze", pageCount: 1, rows: [{ href: "/card-1" }, { href: "/card-2" }] },
    ];
    const sleep = vi.fn().mockResolvedValue();

    const page = await waitForListingReady(async () => snapshots.shift(), { sleep });

    expect(page.rows).toHaveLength(2);
    expect(sleep).toHaveBeenCalledTimes(3);
  });
});

describe("assertNoFailures", () => {
  it("makes a reported expansion failure fail the CLI", () => {
    expect(() => assertNoFailures(1)).toThrow("1 expansion(s) failed");
    expect(() => assertNoFailures(0)).not.toThrow();
  });
});

describe("withRetries", () => {
  it("retries a rate-limited read with bounded exponential backoff", async () => {
    const read = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("limited"), { retryable: true }))
      .mockRejectedValueOnce(Object.assign(new Error("limited"), { retryable: true }))
      .mockResolvedValue("page");
    const sleep = vi.fn().mockResolvedValue();

    await expect(withRetries(read, { maxAttempts: 3, baseDelayMs: 250, sleep }))
      .resolves.toBe("page");
    expect(read).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([250, 500]);
  });
});

describe("browserErrorIsRetryable", () => {
  it("treats killed and aborted browser commands as transient", () => {
    expect(sweep.browserErrorIsRetryable).toBeTypeOf("function");
    expect(sweep.browserErrorIsRetryable({ killed: true }, "Command failed")).toBe(true);
    expect(sweep.browserErrorIsRetryable({}, "Navigation failed: net::ERR_ABORTED")).toBe(true);
  });
});

describe("pendingRoutes", () => {
  it("resumes with normal expansions that have no completed run", () => {
    const routes = [
      { id_expansion: 1, enrichment_status: "normal" },
      { id_expansion: 2, enrichment_status: "normal" },
      { id_expansion: 3, enrichment_status: "listing_anomaly" },
      { id_expansion: 4, enrichment_status: "manual_review" },
    ];

    expect(pendingRoutes(routes, new Set([1])).map((r) => r.id_expansion)).toEqual([2]);
  });

  it("admits only RA05's known listing anomaly in dedicated safe mode", () => {
    const routes = [
      { id_expansion: 6424, enrichment_status: "listing_anomaly" },
      { id_expansion: 7000, enrichment_status: "listing_anomaly" },
      { id_expansion: 6424, enrichment_status: "normal" },
    ];

    expect(sweep.ra05Routes).toBeTypeOf("function");
    expect(sweep.ra05Routes(routes).map((route) => route.id_expansion)).toEqual([6424]);
  });
});

describe("pageCountFromText", () => {
  it("reads Cardmarket's rendered Page n of total footer", () => {
    expect(pageCountFromText("Results\nPage 1 of 5\nGeneral terms")).toBe(5);
  });
});

describe("readAllPages", () => {
  it("reads past Supabase's 1,000-row response cap", async () => {
    const rows = Array.from({ length: 1_002 }, (_, id) => ({ id }));
    const readPage = async (from, to) => rows.slice(from, to + 1);

    const result = await readAllPages(readPage, 1_000);

    expect(result).toHaveLength(1_002);
    expect(result.at(-1)).toEqual({ id: 1_001 });
  });
});

describe("planScrapedExpansion", () => {
  it("turns complete rendered rows into direct sibling identities", () => {
    const localProducts = [
      { id_product: 873125, id_metacard: 42, name: "Pumpking" },
      { id_product: 873126, id_metacard: 42, name: "Pumpking" },
    ];
    const rawRows = [
      {
        imageUrl: "https://product-images.s3.cardmarket.com/5/MZMU/873125/873125.jpg",
        alt: "Pumpking (V.1 - Secret Rare)",
        href: "/en/YuGiOh/Products/Singles/Maze/Pumpking-V1",
      },
      {
        imageUrl: "https://product-images.s3.cardmarket.com/5/MZMU/873126/873126.jpg",
        alt: "Pumpking (V.2 - Collectors Rare)",
        href: "/en/YuGiOh/Products/Singles/Maze/Pumpking-V2",
      },
    ];

    const result = planScrapedExpansion({ localProducts, rawRows });

    expect(result.identities).toMatchObject([
      { idProduct: 873125, versionNo: 1, rarity: "Secret Rare" },
      { idProduct: 873126, versionNo: 2, rarity: "Collectors Rare" },
    ]);
  });

  it("refuses an empty browser page when the expansion has products", () => {
    const result = planScrapedExpansion({
      localProducts: [{ id_product: 1, id_metacard: 42, name: "Card" }],
      rawRows: [],
    });

    expect(result).toMatchObject({ status: "refused", identities: [] });
  });
});

describe("identityRows", () => {
  it("maps one verified group to the columns guarded by identity precedence", () => {
    expect(identityRows([{
      idProduct: 873125,
      versionNo: 1,
      versionLabel: "V.1 - Secret Rare",
      rarity: "Secret Rare",
      source: "cardmarket_expansion_page",
    }], "2026-08-26T10:00:00.000Z")).toEqual([{
      id_product: 873125,
      version_no: 1,
      version_label: "V.1 - Secret Rare",
      rarity: "Secret Rare",
      rarity_source: "cardmarket_page",
      identity_source: "cardmarket_expansion_page",
      identity_at: "2026-08-26T10:00:00.000Z",
    }]);
  });

  it("carries required catalogue columns so PostgreSQL can validate the upsert", () => {
    const identities = [{ idProduct: 873125, versionNo: 1, source: "cardmarket_expansion_page" }];
    const localProducts = [{ id_product: 873125, name: "Pumpking", id_expansion: 6433, id_metacard: 42 }];

    expect(identityRows(identities, "2026-08-26T10:00:00.000Z", localProducts)[0])
      .toMatchObject({ id_product: 873125, name: "Pumpking", id_expansion: 6433, id_metacard: 42 });
  });
});

describe("runExpansion", () => {
  it("persists identities only after the printing resolves completely", async () => {
    const written = [];
    const localProducts = [
      { id_product: 873125, id_metacard: 42, name: "Pumpking" },
      { id_product: 873126, id_metacard: 42, name: "Pumpking" },
    ];
    const rawRows = [
      {
        imageUrl: "https://product-images.s3.cardmarket.com/5/MZMU/873125/873125.jpg",
        alt: "Pumpking (V.1 - Secret Rare)",
        href: "/en/YuGiOh/Products/Singles/Maze/Pumpking-V1",
      },
      {
        imageUrl: "https://product-images.s3.cardmarket.com/5/MZMU/873126/873126.jpg",
        alt: "Pumpking (V.2 - Collectors Rare)",
        href: "/en/YuGiOh/Products/Singles/Maze/Pumpking-V2",
      },
    ];

    const result = await runExpansion({
      route: { id_expansion: 6433 },
      localProducts,
      scrape: async () => rawRows,
      persist: async (rows) => written.push(...rows),
      observedAt: "2026-08-26T10:00:00.000Z",
    });

    expect(result.status).toBe("complete");
    expect(written.map((row) => row.id_product)).toEqual([873125, 873126]);
  });

  it("persists identities from resolved printings while leaving ambiguous printings untouched", async () => {
    const written = [];
    const result = await runExpansion({
      route: { id_expansion: 6433 },
      localProducts: [
        { id_product: 873125, id_metacard: 42, name: "Pumpking" },
        { id_product: 873126, id_metacard: 42, name: "Pumpking" },
        { id_product: 873127, id_metacard: 43, name: "Unresolved" },
        { id_product: 873128, id_metacard: 43, name: "Unresolved" },
      ],
      scrape: async () => [
        {
          imageUrl: "https://product-images.s3.cardmarket.com/5/MZMU/873125/873125.jpg",
          alt: "Pumpking (V.1 - Secret Rare)",
          href: "/en/YuGiOh/Products/Singles/Maze/Pumpking-V1",
        },
        {
          imageUrl: "https://product-images.s3.cardmarket.com/5/MZMU/873126/873126.jpg",
          alt: "Pumpking (V.2 - Collectors Rare)",
          href: "/en/YuGiOh/Products/Singles/Maze/Pumpking-V2",
        },
      ],
      persist: async (rows) => written.push(...rows),
    });

    expect(result.status).toBe("partial");
    expect(written.map((row) => row.id_product)).toEqual([873125, 873126]);
  });
});

describe("scrapeExpansion", () => {
  it("reads every Cardmarket listing page exactly once", async () => {
    const opened = [];
    const browser = {
      open: async (url) => opened.push(url),
      readPage: async () => ({
        pageCount: opened.length === 1 ? 3 : 1,
        rows: [{ imageUrl: `image-${opened.length}`, alt: `Card ${opened.length}`, href: `/card-${opened.length}` }],
      }),
    };

    const rows = await scrapeExpansion({ singles_url: "/en/YuGiOh/Products/Singles/Maze" }, browser);

    expect(opened).toEqual([
      "https://www.cardmarket.com/en/YuGiOh/Products/Singles/Maze",
      "https://www.cardmarket.com/en/YuGiOh/Products/Singles/Maze?site=2",
      "https://www.cardmarket.com/en/YuGiOh/Products/Singles/Maze?site=3",
    ]);
    expect(rows).toHaveLength(3);
  });

  it("uses the advertised count when the pagination footer renders late", async () => {
    const opened = [];
    const browser = {
      open: async (url) => opened.push(url),
      readPage: async () => ({ pageCount: 1, rows: [{ imageUrl: "image", alt: "Card", href: "/card" }] }),
    };

    await scrapeExpansion({
      singles_url: "/en/YuGiOh/Products/Singles/Maze",
      advertised_card_count: 90,
    }, browser);

    expect(opened).toHaveLength(3);
  });

  it("trusts Cardmarket's rendered page total over the advertised product count", async () => {
    const opened = [];
    const browser = {
      open: async (url) => opened.push(url),
      readPage: async () => ({ pageCount: 10, rows: [{ imageUrl: "image", alt: "Card", href: "/card" }] }),
    };

    await scrapeExpansion({
      singles_url: "/en/YuGiOh/Products/Singles/Quarter-Century-Stampede",
      advertised_card_count: 1_020,
    }, browser);

    expect(opened).toHaveLength(10);
  });

  it("resumes from saved pages instead of scraping a large expansion again", async () => {
    const opened = [];
    let saved = null;
    const browser = {
      open: async (url) => opened.push(url),
      readPage: async () => ({ pageCount: 3, rows: [{ href: "/card-3" }] }),
    };
    const checkpoint = {
      pageCount: 3,
      renderedPageCount: 3,
      pages: {
        1: [{ href: "/card-1" }],
        2: [{ href: "/card-2" }],
      },
    };

    const rows = await scrapeExpansion({
      id_expansion: 5989,
      singles_url: "/en/YuGiOh/Products/Singles/Quarter-Century-Stampede",
      advertised_card_count: 90,
    }, browser, {
      loadCheckpoint: async () => checkpoint,
      saveCheckpoint: async (value) => { saved = value; },
    });

    expect(opened).toEqual([
      "https://www.cardmarket.com/en/YuGiOh/Products/Singles/Quarter-Century-Stampede?site=3",
    ]);
    expect(rows.map((row) => row.href)).toEqual(["/card-1", "/card-2", "/card-3"]);
    expect(saved.pages[3]).toEqual([{ href: "/card-3" }]);
  });
});

describe("targeted Cardmarket searches", () => {
  it("can skip a known partial group without skipping later work", () => {
    expect(boundedGroupBatch(["partial", "next", "later"], { offset: 1, limit: 1 }))
      .toEqual(["next"]);
  });

  it("scopes an exact-name search to the expansion", () => {
    const url = new URL(targetedSearchUrl({
      id_expansion: 5989,
      singles_url: "/en/YuGiOh/Products/Singles/Quarter-Century-Stampede",
    }, "Ash Blossom & Joyous Spring"));

    expect(url.searchParams.get("idExpansion")).toBe("5989");
    expect(url.searchParams.get("searchString")).toBe("Ash Blossom & Joyous Spring");
    expect(url.searchParams.get("exactMatch")).toBe("on");
  });

  it("persists a complete printing immediately", async () => {
    const opened = [];
    const written = [];
    const localProducts = [
      { id_product: 820001, id_expansion: 5989, id_metacard: 42, name: "Card" },
      { id_product: 820002, id_expansion: 5989, id_metacard: 42, name: "Card" },
    ];
    const browser = {
      open: async (url) => opened.push(url),
      readPage: async () => ({ pageCount: 1, rows: [
        { imageUrl: "https://product-images.s3.cardmarket.com/5/RA04/820001/820001.jpg", alt: "Card (V.1 - Super Rare)", href: "/en/YuGiOh/Products/Singles/RA04/Card-V1" },
        { imageUrl: "https://product-images.s3.cardmarket.com/5/RA04/820002/820002.jpg", alt: "Card (V.2 - Ultra Rare)", href: "/en/YuGiOh/Products/Singles/RA04/Card-V2" },
      ] }),
    };

    const result = await runTargetedPrinting({
      route: { id_expansion: 5989, singles_url: "/en/YuGiOh/Products/Singles/Quarter-Century-Stampede" },
      localProducts,
      browser,
      persist: async (rows) => written.push(...rows),
      observedAt: "2026-08-27T10:00:00.000Z",
    });

    expect(opened).toHaveLength(1);
    expect(result.status).toBe("complete");
    expect(written.map((row) => row.id_product)).toEqual([820001, 820002]);
  });

  it("resolves RA05 placeholder images from their product detail pages", async () => {
    const detailReads = [];
    const written = [];
    const localProducts = [
      { id_product: 880774, id_expansion: 6424, id_metacard: 42, name: "Albion" },
      { id_product: 880775, id_expansion: 6424, id_metacard: 42, name: "Albion" },
    ];
    const placeholder = "https://static.cardmarket.com/img/3660af732e89ee7bfadc4b521fe525c1/cardImageNotAvailable.png";
    const browser = {
      open: async () => {},
      readPage: async () => ({ pageCount: 1, rows: [
        { imageUrl: placeholder, alt: "Albion (V.1 - Super Rare)", href: "/ra05/albion-v1" },
        { imageUrl: placeholder, alt: "Albion (V.2 - Ultra Rare)", href: "/ra05/albion-v2" },
      ] }),
      readProductId: async (href) => {
        detailReads.push(href);
        return href.endsWith("v1") ? 880774 : 880775;
      },
    };

    const result = await runTargetedPrinting({
      route: { id_expansion: 6424, singles_url: "/en/YuGiOh/Products/Singles/Rarity-Collection-5" },
      localProducts,
      browser,
      persist: async (rows) => written.push(...rows),
      observedAt: "2026-08-28T12:00:00.000Z",
      resolvePlaceholderIds: true,
    });

    expect(result.status).toBe("complete");
    expect(detailReads).toEqual(["/ra05/albion-v1", "/ra05/albion-v2"]);
    expect(written.map((row) => [row.id_product, row.rarity])).toEqual([
      [880774, "Super Rare"],
      [880775, "Ultra Rare"],
    ]);
  });

  it("reads printed numbers only when a rarity occurs more than once", async () => {
    const detailReads = [];
    const written = [];
    const localProducts = [
      { id_product: 820631, id_expansion: 5989, id_metacard: 42, name: "Aleister" },
      { id_product: 821130, id_expansion: 5989, id_metacard: 42, name: "Aleister" },
    ];
    const browser = {
      open: async () => {},
      readPage: async () => ({ pageCount: 1, rows: [
        { imageUrl: "https://product-images.s3.cardmarket.com/5/RA04/820631/820631.jpg", alt: "Aleister (V.4 - Platinum Secret Rare)", href: "/en/YuGiOh/Products/Singles/RA04/Aleister-V4" },
        { imageUrl: "https://product-images.s3.cardmarket.com/5/RA04/821130/821130.jpg", alt: "Aleister (V.8 - Platinum Secret Rare)", href: "/en/YuGiOh/Products/Singles/RA04/Aleister-V8" },
      ] }),
      readCollectorNumber: async (href) => {
        detailReads.push(href);
        return href.endsWith("V4") ? "024" : "278";
      },
    };

    await runTargetedPrinting({
      route: { id_expansion: 5989, singles_url: "/en/YuGiOh/Products/Singles/Quarter-Century-Stampede" },
      localProducts,
      browser,
      persist: async (rows) => written.push(...rows),
      observedAt: "2026-08-27T10:00:00.000Z",
    });

    expect(detailReads).toHaveLength(2);
    expect(written.map((row) => [row.id_product, row.collector_number])).toEqual([
      [820631, "024"],
      [821130, "278"],
    ]);
  });

  it("does not report collector backfill complete when a required number is missing", async () => {
    const written = [];
    const result = await runTargetedPrinting({
      route: { id_expansion: 1048, singles_url: "/en/YuGiOh/Products/Singles/Magic-Ruler" },
      localProducts: [
        { id_product: 105448, id_expansion: 1048, id_metacard: 42, name: "Serpent Night Dragon" },
        { id_product: 579840, id_expansion: 1048, id_metacard: 42, name: "Serpent Night Dragon" },
      ],
      browser: {
        open: async () => {},
        readPage: async () => ({ rows: [
          { imageUrl: "https://product-images.s3.cardmarket.com/5/MRL/105448/105448.jpg", alt: "Serpent Night Dragon (V.1 - Secret Rare)", href: null },
          { imageUrl: "https://product-images.s3.cardmarket.com/5/MRL/579840/579840.jpg", alt: "Serpent Night Dragon (V.2 - Secret Rare)", href: null },
        ] }),
      },
      persist: async (rows) => written.push(...rows),
      requireCollectorNumbers: true,
    });

    expect(result.status).toBe("partial");
    expect(written).toEqual([]);
  });
});

describe("parseAgentBrowserResult", () => {
  it("unwraps the structured result without accepting a failed command", () => {
    const stdout = JSON.stringify({ success: true, data: { result: { pageCount: 5, rows: [] } }, error: null });
    expect(parseAgentBrowserResult(stdout)).toEqual({ pageCount: 5, rows: [] });
  });
});

describe("createAgentBrowser", () => {
  it("reads the detail href when the gallery box is itself the anchor", async () => {
    const image = { dataset: {}, currentSrc: "", src: "image.jpg", alt: "Card" };
    const box = {
      matches: (selector) => selector.includes("/Products/Singles/"),
      querySelector: (selector) => selector === "img" ? image : null,
      getAttribute: (name) => name === "href" ? "/en/YuGiOh/Products/Singles/Set/Card-V1" : null,
    };
    const fakeDocument = {
      body: { innerText: "Page 1 of 1" },
      querySelectorAll: (selector) => selector === ".galleryBox" ? [box] : [],
    };
    const command = async (args) => {
      if (args[0] === "wait") return "";
      const result = Function("document", `return ${args[2]}`)(fakeDocument);
      return JSON.stringify({ success: true, data: { result }, error: null });
    };
    const browser = createAgentBrowser({ command });

    await expect(browser.readPage()).resolves.toMatchObject({
      rows: [{ href: "/en/YuGiOh/Products/Singles/Set/Card-V1" }],
    });
  });

  it("reads the collector number from Cardmarket's hidden detail definition list", async () => {
    const numberValue = { textContent: " 002 " };
    const numberLabel = { textContent: "Number", nextElementSibling: numberValue };
    const fakeDocument = {
      body: { innerText: "Rarity\nPrinted in\nQuarter Century Stampede" },
      querySelectorAll: (selector) => selector === "dt" ? [numberLabel] : [],
    };
    const command = async (args) => {
      if (args[0] !== "--json") return "";
      const result = Function("document", `return ${args[2]}`)(fakeDocument);
      return JSON.stringify({ success: true, data: { result }, error: null });
    };
    const browser = createAgentBrowser({ command });

    await expect(browser.readCollectorNumber("/en/YuGiOh/Products/Singles/RA04/Card-V1"))
      .resolves.toBe("002");
  });

  it("waits for the document body before scrolling a newly opened page", async () => {
    const calls = [];
    const browser = createAgentBrowser({ command: async (args) => calls.push(args) });

    await browser.open("https://www.cardmarket.com/example");

    const bodyWait = calls.findIndex((args) => args[0] === "wait" && args[1] === "body");
    const scroll = calls.findIndex((args) => args[0] === "eval");
    expect(bodyWait).toBeGreaterThan(-1);
    expect(bodyWait).toBeLessThan(scroll);
    expect(calls[scroll][1]).toContain("document.body?.scrollHeight");
  });

  it("reads the complete rendered gallery shape", async () => {
    const result = { title: "Maze", pageCount: 5, rows: [{ imageUrl: "image", alt: "Card", href: "/card" }] };
    const command = async () => JSON.stringify({ success: true, data: { result }, error: null });
    const browser = createAgentBrowser({ command });

    await expect(browser.readPage()).resolves.toEqual(result);
  });

  it("retries only the current page read after a transient command failure", async () => {
    vi.useFakeTimers();
    const result = { title: "Maze", pageCount: 1, rows: [{ alt: "Card" }] };
    let reads = 0;
    const command = async (args) => {
      if (args[0] === "wait") return "";
      if (args[0] !== "--json") throw new Error(`unexpected command: ${args.join(" ")}`);
      reads += 1;
      if (reads === 1) throw Object.assign(new Error("browser timed out"), { retryable: true });
      return JSON.stringify({ success: true, data: { result }, error: null });
    };
    const browser = createAgentBrowser({ command });

    const read = browser.readPage();
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(read).resolves.toEqual(result);
    expect(reads).toBe(3);
    vi.useRealTimers();
  });

  it("keeps the browser session alive while Cardmarket shows its interstitial", async () => {
    vi.useFakeTimers();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const results = [
      { title: "Just a moment...", pageCount: 1, rows: [] },
      { title: "Maze", pageCount: 1, rows: [{ alt: "Card" }] },
      { title: "Maze", pageCount: 1, rows: [{ alt: "Card" }] },
    ];
    const command = async (args) => args[0] === "wait" ? "" : JSON.stringify({
        success: true,
        data: { result: results.shift() },
        error: null,
      });
    const browser = createAgentBrowser({ command });

    const read = browser.readPage();
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(read).resolves.toMatchObject({ title: "Maze" });
    expect(warning).toHaveBeenCalledTimes(1);
    warning.mockRestore();
    vi.useRealTimers();
  });
});
