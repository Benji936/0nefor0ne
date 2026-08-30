import { idProductFromImage, isPlaceholderImage, readExpansionPage } from "./cardmarket-expansion-page.mjs";
import { planExpansion } from "./cardmarket-elimination.mjs";
import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const CARDMARKET_CHALLENGE = /just a moment|attention required|cloudflare/i;
const CARDMARKET_NONSINGLES = "https://downloads.s3.cardmarket.com/productCatalog/productList/products_nonsingles_3.json";
const YGOPRO_CARDS = "https://db.ygoprodeck.com/api/v7/cardinfo.php";
const CHECKPOINT_DIRECTORY = "/private/tmp/trademarket-cardmarket-sweep";
const DETAIL_PAGE_EVAL = `(() => {
  const text = document.body?.innerText ?? "";
  const numberLabel = [...document.querySelectorAll("dt")]
    .find((element) => /^Number$/i.test(element.textContent?.trim() ?? ""));
  const collectorNumber = numberLabel?.nextElementSibling?.textContent?.trim()
    || text.match(/\\bNumber\\s+([^\\s]+)/i)?.[1]
    || null;
  return { title: document.title, collectorNumber };
})()`;
const DETAIL_PRODUCT_ID_EVAL = `(() => {
  const values = [...document.querySelectorAll('input[name="idProduct"]')]
    .map((input) => Number(input.value))
    .filter((value) => Number.isSafeInteger(value) && value > 0);
  const ids = [...new Set(values)];
  return { title: document.title, ids };
})()`;
const RA05_EXPANSION_ID = 6424;

export function japaneseExpansionIds(products) {
  return new Set((products ?? [])
    .filter((product) => /\(OCG\)/i.test(product?.name ?? ""))
    .map((product) => Number(product.idExpansion)));
}

export function isJapaneseRoute(route) {
  const label = [route?.cardmarket_name, route?.slug, route?.singles_url]
    .filter(Boolean)
    .join(" ");
  return /\(OCG\)|Japanese/i.test(label)
    || /-JP[A-Z]*$/i.test(route?.cardmarket_set_code ?? "");
}

export function confirmedTcgExpansionIds(products) {
  return new Set((products ?? [])
    .filter((product) => product?.set_code)
    .map((product) => Number(product.id_expansion)));
}

export async function waitForChallengeClear(readPage, {
  sleep = wait,
  onChallenge = (title) => console.warn(`Cardmarket verification required (${title}). Complete it in the headed browser; the sweep is paused.`),
  pollMs = 2_000,
  maxWaitMs = 15 * 60_000,
} = {}) {
  let waitedMs = 0;
  let announced = false;
  while (true) {
    const page = await readPage();
    if (!CARDMARKET_CHALLENGE.test(page?.title ?? "")) return page;
    if (!announced) {
      onChallenge(page.title);
      announced = true;
    }
    if (waitedMs >= maxWaitMs) throw new Error("Cardmarket verification was not cleared before the wait timeout");
    const delayMs = Math.min(pollMs, maxWaitMs - waitedMs);
    await sleep(delayMs);
    waitedMs += delayMs;
  }
}

export async function waitForListingReady(readPage, {
  sleep = wait,
  pollMs = 1_000,
  maxWaitMs = 30_000,
  stableReads = 2,
} = {}) {
  let waitedMs = 0;
  let previousSignature = null;
  let stableCount = 0;

  while (true) {
    const page = await readPage();
    if (CARDMARKET_CHALLENGE.test(page?.title ?? "")) return page;

    const rows = page?.rows ?? [];
    const signature = JSON.stringify({ pageCount: page?.pageCount ?? 1, rows });
    stableCount = rows.length > 0 && signature === previousSignature ? stableCount + 1 : 1;
    previousSignature = signature;

    if (rows.length > 0 && stableCount >= stableReads) return page;
    if (waitedMs >= maxWaitMs) throw new Error("Cardmarket listing did not finish rendering before the wait timeout");

    const delayMs = Math.min(pollMs, maxWaitMs - waitedMs);
    await sleep(delayMs);
    waitedMs += delayMs;
  }
}

export function assertNoFailures(failureCount) {
  if (failureCount > 0) throw new Error(`${failureCount} expansion(s) failed`);
}

export function needsIdentityEnrichment(products) {
  const siblings = new Map();
  for (const product of products ?? []) {
    if (product.id_metacard == null) continue;
    const group = siblings.get(product.id_metacard) ?? [];
    group.push(product);
    siblings.set(product.id_metacard, group);
  }
  const verifiedSources = new Set([
    "cardmarket_expansion_page",
    "cardmarket_expansion_elimination",
  ]);
  return [...siblings.values()].some((group) =>
    group.length > 1 && group.some((product) => !verifiedSources.has(product.identity_source)));
}

function normalizedRarity(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizedCardName(value) {
  return String(value ?? "").normalize("NFKC").trim().toLowerCase();
}

function printingCodeParts(value) {
  const [setCode, ...suffixParts] = String(value ?? "").toUpperCase().split("-");
  let collectorNumber = suffixParts.join("-");
  collectorNumber = collectorNumber.replace(/^(?:EN|FR|DE|IT|PT|SP|NL)/, "");
  collectorNumber = collectorNumber.replace(/^(?:E|F|D|I|P|S)(?=\d)/, "");
  return { setCode, collectorNumber };
}

export function collectorNumberRiskKeys(cards) {
  const printings = new Map();
  for (const card of cards ?? []) {
    const cardName = normalizedCardName(card.name);
    if (!cardName) continue;
    for (const printing of card.card_sets ?? []) {
      const { setCode, collectorNumber } = printingCodeParts(printing.set_code);
      const rarity = normalizedRarity(printing.set_rarity);
      if (!setCode || !collectorNumber || !rarity) continue;
      const key = `${cardName}|${setCode}|${rarity}`;
      const numbers = printings.get(key) ?? new Set();
      numbers.add(collectorNumber);
      printings.set(key, numbers);
    }
  }
  return new Set([...printings]
    .filter(([, numbers]) => numbers.size > 1)
    .map(([key]) => key));
}

export function needsCollectorNumberEnrichment(products, riskKeys = null) {
  const siblings = new Map();
  for (const product of products ?? []) {
    if (product.id_metacard == null) continue;
    const group = siblings.get(product.id_metacard) ?? [];
    group.push(product);
    siblings.set(product.id_metacard, group);
  }
  const verifiedSources = new Set([
    "cardmarket_expansion_page",
    "cardmarket_expansion_elimination",
  ]);
  return [...siblings.values()].some((group) => {
    if (group.length < 2 || group.some((product) => !verifiedSources.has(product.identity_source))) return false;
    const byRarity = new Map();
    for (const product of group) {
      const key = normalizedRarity(product.rarity);
      if (!key) continue;
      const sameRarity = byRarity.get(key) ?? [];
      sameRarity.push(product);
      byRarity.set(key, sameRarity);
    }
    return [...byRarity].some(([rarity, sameRarity]) => {
      if (sameRarity.length < 2 || sameRarity.every((product) => product.collector_number)) return false;
      if (!riskKeys) return true;
      const setCode = String(sameRarity[0]?.set_code ?? "").toUpperCase();
      const cardName = normalizedCardName(sameRarity[0]?.name);
      return riskKeys.has(`${cardName}|${setCode}|${rarity}`);
    });
  });
}

export function parseAgentBrowserResult(stdout) {
  const line = String(stdout ?? "").trim().split("\n").findLast((part) => part.trim().startsWith("{"));
  if (!line) throw new Error("agent-browser returned no JSON result");
  const envelope = JSON.parse(line);
  if (!envelope.success) throw new Error(envelope.error?.message ?? envelope.error ?? "agent-browser command failed");
  return envelope.data?.result;
}

const LISTING_PAGE_EVAL = `(() => {
  const rows = [...document.querySelectorAll(".galleryBox")].map((box) => {
    const image = box.querySelector("img");
    const link = box.matches('a[href*="/Products/Singles/"]')
      ? box
      : box.querySelector('a[href*="/Products/Singles/"]');
    return {
      imageUrl: image?.dataset?.echo || image?.currentSrc || image?.src || null,
      alt: image?.alt || "",
      href: link?.getAttribute("href") || null,
    };
  });
  const match = document.body.innerText.match(/\\bPage\\s+\\d+\\s+of\\s+(\\d+)\\b/i);
  return { title: document.title, pageCount: match ? Number(match[1]) : 1, rows };
})()`;

export function createAgentBrowser({ command }) {
  return {
    async open(url) {
      await withRetries(async () => {
        await command(["open", url]);
        await command(["wait", "body"]);
        await command(["eval", "window.scrollTo(0, document.body?.scrollHeight ?? 0)"]);
        await command(["wait", "400"]);
      });
    },
    async readPage() {
      return withRetries(() => waitForChallengeClear(async () =>
        waitForListingReady(async () =>
          parseAgentBrowserResult(await command(["--json", "eval", LISTING_PAGE_EVAL])), {
          sleep: (ms) => command(["wait", String(ms)]),
        })));
    },
    async readCollectorNumber(href) {
      await command(["open", new URL(href, "https://www.cardmarket.com").href]);
      await command(["wait", "body"]);
      const page = await withRetries(() => waitForChallengeClear(async () =>
        parseAgentBrowserResult(await command(["--json", "eval", DETAIL_PAGE_EVAL])), {
        sleep: (ms) => command(["wait", String(ms)]),
      }));
      return page.collectorNumber ?? null;
    },
    async readProductId(href) {
      await command(["open", new URL(href, "https://www.cardmarket.com").href]);
      await command(["wait", "body"]);
      const page = await withRetries(() => waitForChallengeClear(async () =>
        parseAgentBrowserResult(await command(["--json", "eval", DETAIL_PRODUCT_ID_EVAL])), {
        sleep: (ms) => command(["wait", String(ms)]),
      }));
      return page.ids?.length === 1 ? page.ids[0] : null;
    },
  };
}

export function identityRows(identities, observedAt = new Date().toISOString(), localProducts = []) {
  const localById = new Map(localProducts.map((product) => [Number(product.id_product), product]));
  return (identities ?? []).map((identity) => ({
    ...(localById.get(Number(identity.idProduct)) ? {
      name: localById.get(Number(identity.idProduct)).name,
      id_expansion: localById.get(Number(identity.idProduct)).id_expansion,
      id_metacard: localById.get(Number(identity.idProduct)).id_metacard ?? null,
    } : {}),
    id_product: identity.idProduct,
    version_no: identity.versionNo ?? null,
    version_label: identity.versionLabel ?? null,
    ...(identity.collectorNumber ? { collector_number: identity.collectorNumber } : {}),
    rarity: identity.rarity ?? null,
    rarity_source: identity.rarity ? "cardmarket_page" : null,
    identity_source: identity.source,
    identity_at: observedAt,
  }));
}

export async function runExpansion({
  route,
  localProducts,
  scrape,
  persist,
  observedAt = new Date().toISOString(),
  dryRun = false,
}) {
  const rawRows = await scrape(route);
  const plan = planScrapedExpansion({ localProducts, rawRows });
  const rows = identityRows(plan.identities, observedAt, localProducts);
  if (!dryRun && ["complete", "partial"].includes(plan.status) && rows.length) await persist(rows, plan);
  return { ...plan, rows, idExpansion: route.id_expansion };
}

export function targetedSearchUrl(route, cardName) {
  const url = new URL(route.singles_url, "https://www.cardmarket.com");
  url.searchParams.set("searchMode", "v2");
  url.searchParams.set("idCategory", "5");
  url.searchParams.set("idExpansion", String(route.id_expansion));
  url.searchParams.set("searchString", cardName);
  url.searchParams.set("exactMatch", "on");
  url.searchParams.set("perSite", "30");
  return url.href;
}

export function boundedGroupBatch(groups, { offset = 0, limit = 20 } = {}) {
  return (groups ?? []).slice(offset, offset + limit);
}

export async function runTargetedPrinting({
  route,
  localProducts,
  browser,
  persist,
  observedAt = new Date().toISOString(),
  dryRun = false,
  requireCollectorNumbers = false,
  resolvePlaceholderIds = false,
}) {
  const cardName = localProducts?.[0]?.name;
  if (!cardName) return { status: "refused", identities: [], rows: [], reason: "printing has no card name" };

  await browser.open(targetedSearchUrl(route, cardName));
  const page = await browser.readPage();
  let rawRows = page.rows ?? [];
  if (resolvePlaceholderIds
      && rawRows.length === localProducts.length
      && browser.readProductId) {
    rawRows = [];
    for (const row of page.rows ?? []) {
      if (idProductFromImage(row.imageUrl) || !isPlaceholderImage(row.imageUrl) || !row.href) {
        rawRows.push(row);
        continue;
      }
      const detailProductId = await browser.readProductId(row.href);
      rawRows.push({ ...row, detailProductId });
    }
  }
  const plan = planScrapedExpansion({ localProducts, rawRows });
  const rarityCounts = new Map();
  for (const identity of plan.identities ?? []) {
    const key = String(identity.rarity ?? "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (key) rarityCounts.set(key, (rarityCounts.get(key) ?? 0) + 1);
  }
  const hrefByProduct = new Map(rawRows.flatMap((raw) => {
    const parsed = idProductFromImage(raw.imageUrl);
    const idProduct = parsed?.idProduct ?? (Number(raw.detailProductId) || null);
    return idProduct && raw.href ? [[idProduct, raw.href]] : [];
  }));
  const identities = [];
  for (const identity of plan.identities ?? []) {
    const key = String(identity.rarity ?? "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
    const href = hrefByProduct.get(Number(identity.idProduct));
    if ((rarityCounts.get(key) ?? 0) < 2 || !href || !browser.readCollectorNumber) {
      identities.push(identity);
      continue;
    }
    const collectorNumber = await browser.readCollectorNumber(href);
    identities.push({ ...identity, collectorNumber });
  }
  const rows = identityRows(identities, observedAt, localProducts);
  const collectorNumbersMissing = requireCollectorNumbers && identities.some((identity) => {
    const key = normalizedRarity(identity.rarity);
    return (rarityCounts.get(key) ?? 0) > 1 && !identity.collectorNumber;
  });
  const status = collectorNumbersMissing ? "partial" : plan.status;
  if (!dryRun && status === "complete" && rows.length) await persist(rows, plan);
  return {
    ...plan,
    status,
    identities,
    rows,
    ...(collectorNumbersMissing ? { reason: "one or more repeated-rarity products have no collector number" } : {}),
  };
}

export async function scrapeExpansion(route, browser, {
  loadCheckpoint = async () => null,
  saveCheckpoint = async () => {},
  onPage = () => {},
} = {}) {
  const base = new URL(route.singles_url, "https://www.cardmarket.com");
  const advertisedPages = Math.ceil((Number(route.advertised_card_count) || 0) / 30);
  const saved = await loadCheckpoint(route);
  const pages = { ...(saved?.pages ?? {}) };
  let renderedPageCount = Number(saved?.renderedPageCount) || null;
  let pageCount = renderedPageCount ?? Math.max(Number(saved?.pageCount) || 1, advertisedPages, 1);

  // Older checkpoints predate the authoritative rendered total. Re-read only
  // page one to learn it, then discard any out-of-range pages Cardmarket
  // clamped to its final result set.
  if (saved && !renderedPageCount && Array.isArray(pages[1])) {
    await browser.open(base.href);
    const first = await browser.readPage();
    pages[1] = first.rows;
    if (Number(first.pageCount) > 1) {
      renderedPageCount = Number(first.pageCount);
      pageCount = renderedPageCount;
      for (const site of Object.keys(pages)) {
        if (Number(site) > pageCount) delete pages[site];
      }
    }
    await saveCheckpoint({
      idExpansion: route.id_expansion,
      singlesUrl: base.href,
      pageCount,
      renderedPageCount,
      pages,
      updatedAt: new Date().toISOString(),
    }, route);
  }

  for (let site = 1; site <= pageCount; site += 1) {
    if (Array.isArray(pages[site])) continue;
    const page = new URL(base);
    if (site > 1) page.searchParams.set("site", String(site));
    await browser.open(page.href);
    const rendered = await browser.readPage();
    pages[site] = rendered.rows;
    if (Number(rendered.pageCount) > 1) {
      renderedPageCount = Number(rendered.pageCount);
      pageCount = renderedPageCount;
    }
    await saveCheckpoint({
      idExpansion: route.id_expansion,
      singlesUrl: base.href,
      pageCount,
      renderedPageCount,
      pages,
      updatedAt: new Date().toISOString(),
    }, route);
    onPage(site, pageCount, rendered.rows.length);
  }

  return Array.from({ length: pageCount }, (_, index) => pages[index + 1] ?? []).flat();
}

function checkpointPath(route) {
  return `${CHECKPOINT_DIRECTORY}/${Number(route.id_expansion)}.json`;
}

async function loadExpansionCheckpoint(route) {
  try {
    const parsed = JSON.parse(await readFile(checkpointPath(route), "utf8"));
    const expectedUrl = new URL(route.singles_url, "https://www.cardmarket.com").href;
    return parsed?.singlesUrl === expectedUrl ? parsed : null;
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

async function saveExpansionCheckpoint(checkpoint, route) {
  await mkdir(CHECKPOINT_DIRECTORY, { recursive: true });
  const destination = checkpointPath(route);
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, JSON.stringify(checkpoint), "utf8");
  await rename(temporary, destination);
}

async function clearExpansionCheckpoint(route) {
  await rm(checkpointPath(route), { force: true });
}

const execFileAsync = promisify(execFile);

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1];
}

async function agentBrowserCommand(args) {
  const global = [
    "--yes", "agent-browser@0.35.0",
    "--headed",
    "--args", "--disable-blink-features=AutomationControlled",
    "--profile", "/private/tmp/trademarket-cardmarket-profile",
  ];
  try {
    const { stdout } = await execFileAsync("npx", [...global, ...args], {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 90_000,
    });
    return stdout;
  } catch (error) {
    const message = `${error?.stdout ?? ""}\n${error?.stderr ?? ""}\n${error?.message ?? error}`;
    error.retryable = browserErrorIsRetryable(error, message);
    throw error;
  }
}

export function browserErrorIsRetryable(error, message = error?.message ?? String(error)) {
  return Boolean(error?.killed || error?.signal)
    || /cloudflare|just a moment|timeout|timed out|429|rate.?limit|ERR_ABORTED|target closed|browser.*disconnect/i.test(message);
}

async function main() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://sxteuctysfiwripnaozi.supabase.co";
  const dryRun = process.argv.includes("--dry-run");
  const ra05 = process.argv.includes("--ra05");
  const retryFailed = process.argv.includes("--retry-failed");
  const retryPartial = process.argv.includes("--retry-partial");
  const targeted = process.argv.includes("--targeted") || ra05;
  const collectorNumbers = process.argv.includes("--collector-numbers");
  const includeAttempted = process.argv.includes("--include-attempted")
    || process.argv.includes("--include-complete")
    || ra05;
  const includeJapanese = process.argv.includes("--include-japanese");
  const requestedExpansion = Number(argument("expansion")) || null;
  const onlyExpansion = ra05 ? RA05_EXPANSION_ID : requestedExpansion;
  const limit = Math.max(1, Number(argument("limit")) || Infinity);
  const groupLimit = Math.max(1, Number(argument("group-limit")) || 20);
  const groupOffset = Math.max(0, Number(argument("group-offset")) || 0);

  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
  if (collectorNumbers && !targeted) throw new Error("--collector-numbers requires --targeted");
  if (ra05 && collectorNumbers) throw new Error("--ra05 resolves identity only; do not combine it with --collector-numbers");
  if (ra05 && requestedExpansion && requestedExpansion !== RA05_EXPANSION_ID) {
    throw new Error(`--ra05 is restricted to expansion ${RA05_EXPANSION_ID}`);
  }

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const routes = await readAllPages(async (from, to) => {
    let query = db.from("cardmarket_expansion_route")
      .select("id_expansion,singles_url,enrichment_status,cardmarket_name,cardmarket_set_code,slug,advertised_card_count")
      .order("id_expansion")
      .range(from, to);
    if (onlyExpansion) query = query.eq("id_expansion", onlyExpansion);
    const { data, error } = await query;
    if (error) throw new Error(`route read failed: ${error.message}`);
    return data ?? [];
  });

  const runRows = includeAttempted && !retryFailed && !retryPartial ? [] : await readAllPages(async (from, to) => {
    const { data, error } = await db.from("cardmarket_enrichment_run")
      .select("id_expansion,status,started_at")
      .range(from, to);
    if (error) throw new Error(`run read failed: ${error.message}`);
    return data ?? [];
  });
  const attempted = attemptedExpansionIds(runRows);
  const failed = failedExpansionIds(runRows);
  const partial = partialExpansionIds(runRows);
  let japanese = new Set();
  let confirmedTcg = new Set();
  if (!includeJapanese) {
    const response = await fetch(CARDMARKET_NONSINGLES, {
      headers: { "User-Agent": "one-for-one/cardmarket-sweep" },
    });
    if (!response.ok) throw new Error(`Cardmarket non-single catalogue read failed: ${response.status}`);
    japanese = japaneseExpansionIds((await response.json()).products);
    const mappedProducts = await readAllPages(async (from, to) => {
      const { data, error } = await db.from("cardmarket_product")
        .select("id_expansion,set_code")
        .not("set_code", "is", null)
        .order("id_product")
        .range(from, to);
      if (error) throw new Error(`TCG expansion read failed: ${error.message}`);
      return data ?? [];
    });
    confirmedTcg = confirmedTcgExpansionIds(mappedProducts);
  }
  const eligible = ra05
    ? ra05Routes(routes)
    : retryFailed
    ? routes.filter((route) => route.enrichment_status === "normal" && failed.has(Number(route.id_expansion)))
    : retryPartial
      ? routes.filter((route) => route.enrichment_status === "normal" && partial.has(Number(route.id_expansion)))
    : includeAttempted
      ? routes.filter((route) => route.enrichment_status === "normal")
      : pendingRoutes(routes, attempted);
  const selected = eligible.filter((route) =>
    includeJapanese || (
      confirmedTcg.has(Number(route.id_expansion))
      && !japanese.has(Number(route.id_expansion))
      && !isJapaneseRoute(route)
    )).slice(0, limit);

  let collectorRiskKeys = null;
  if (collectorNumbers) {
    const response = await fetch(YGOPRO_CARDS, { headers: { "User-Agent": "one-for-one/cardmarket-sweep" } });
    if (!response.ok) throw new Error(`YGOPRODeck card catalogue read failed: ${response.status}`);
    collectorRiskKeys = collectorNumberRiskKeys((await response.json()).data);
    console.log(`Loaded ${collectorRiskKeys.size} genuinely ambiguous printing group(s).`);
  }

  console.log(`${dryRun ? "Dry-running" : "Running"} ${selected.length} expansion(s).`);
  const browser = createAgentBrowser({ command: agentBrowserCommand });
  let failureCount = 0;

  for (const [index, route] of selected.entries()) {
    const startedAt = new Date().toISOString();
    const { data: localProducts, error: productError } = await db.from("cardmarket_product")
      .select("id_product,id_expansion,id_metacard,name,set_code,identity_source,version_no,version_label,rarity,collector_number")
      .eq("id_expansion", route.id_expansion)
      .order("id_product");
    if (productError) throw new Error(`product read ${route.id_expansion} failed: ${productError.message}`);

    const needsEnrichment = collectorNumbers
      ? needsCollectorNumberEnrichment(localProducts, collectorRiskKeys)
      : needsIdentityEnrichment(localProducts);
    if (!needsEnrichment) {
      const completeReason = collectorNumbers
        ? "no repeated rarities missing collector numbers"
        : "no unresolved sibling identities";
      console.log(`[${index + 1}/${selected.length}] ${route.id_expansion} ${route.cardmarket_name ?? ""}: complete; ${completeReason}`);
      if (!dryRun) {
        const { error } = await db.from("cardmarket_enrichment_run").insert({
          id_expansion: route.id_expansion,
          started_at: startedAt,
          completed_at: new Date().toISOString(),
          direct_count: 0,
          elimination_count: 0,
          unresolved_count: 0,
          conflict_count: 0,
          status: "complete",
          notes: `${completeReason}; Cardmarket page not fetched`,
        });
        if (error) throw new Error(`run log write failed: ${error.message}`);
      }
      continue;
    }

    if (targeted) {
      const byMetacard = new Map();
      for (const product of localProducts ?? []) {
        if (product.id_metacard == null) continue;
        const group = byMetacard.get(product.id_metacard) ?? [];
        group.push(product);
        byMetacard.set(product.id_metacard, group);
      }
      const groups = [...byMetacard.values()]
        .filter((group) => group.length > 1 && (collectorNumbers
          ? needsCollectorNumberEnrichment(group, collectorRiskKeys)
          : needsIdentityEnrichment(group)));
      const batch = boundedGroupBatch(groups, { offset: groupOffset, limit: groupLimit });
      let completedGroups = 0;
      let writtenIdentities = 0;

      for (const [groupIndex, group] of batch.entries()) {
        try {
          const result = await runTargetedPrinting({
            route,
            localProducts: group,
            browser,
            persist: async (rows) => {
              const { error } = await db.from("cardmarket_product").upsert(rows, { onConflict: "id_product" });
              if (error) throw new Error(`identity write failed: ${error.message}`);
            },
            dryRun,
            requireCollectorNumbers: collectorNumbers,
            resolvePlaceholderIds: ra05,
          });
          if (result.status === "complete") {
            completedGroups += 1;
            writtenIdentities += result.rows.length;
          }
          console.log(`[${index + 1}/${selected.length}] ${route.id_expansion} targeted ${groupIndex + 1}/${batch.length} ${group[0].name}: ${result.status}; ${result.rows.length} identities`);
        } catch (error) {
          failureCount += 1;
          console.error(`[${index + 1}/${selected.length}] ${route.id_expansion} targeted ${group[0].name} failed: ${error.message}`);
          break;
        }
      }

      if (!dryRun) {
        const { error } = await db.from("cardmarket_enrichment_run").insert({
          id_expansion: route.id_expansion,
          started_at: startedAt,
          completed_at: new Date().toISOString(),
          direct_count: writtenIdentities,
          elimination_count: 0,
          unresolved_count: Math.max(0, groups.length - completedGroups),
          conflict_count: 0,
          status: groups.length === completedGroups ? "complete" : "partial",
          notes: `${collectorNumbers ? "Collector-number" : "Targeted exact-name"} batch: ${completedGroups}/${batch.length} printing(s) resolved`,
        });
        if (error) throw new Error(`run log write failed: ${error.message}`);
      }
      continue;
    }

    try {
      const result = await runExpansion({
        route,
        localProducts: localProducts ?? [],
        scrape: (subject) => scrapeExpansion(subject, browser, dryRun ? {} : {
          loadCheckpoint: loadExpansionCheckpoint,
          saveCheckpoint: saveExpansionCheckpoint,
          onPage: (site, pageCount, rowCount) => console.log(
            `[${index + 1}/${selected.length}] ${route.id_expansion}: saved page ${site}/${pageCount} (${rowCount} rows)`,
          ),
        }),
        persist: async (rows) => {
          const { error } = await db.from("cardmarket_product").upsert(rows, { onConflict: "id_product" });
          if (error) throw new Error(`identity write failed: ${error.message}`);
        },
        observedAt: startedAt,
        dryRun,
      });

      const direct = result.identities.filter((identity) => identity.source === "cardmarket_expansion_page").length;
      const elimination = result.identities.filter((identity) => identity.source === "cardmarket_expansion_elimination").length;
      console.log(`[${index + 1}/${selected.length}] ${route.id_expansion} ${route.cardmarket_name ?? ""}: ${result.status}; ${direct} direct, ${elimination} elimination, ${result.summary?.unresolved ?? 0} unresolved${result.reason ? `; ${result.reason}` : ""}`);

      if (!dryRun) {
        const { error } = await db.from("cardmarket_enrichment_run").insert({
          id_expansion: route.id_expansion,
          started_at: startedAt,
          completed_at: new Date().toISOString(),
          page_rows: result.parsed ? result.parsed.products.length + result.parsed.placeholders.length : 0,
          direct_count: direct,
          elimination_count: elimination,
          unresolved_count: result.summary?.unresolved ?? 0,
          conflict_count: result.conflicts?.length ?? 0,
          status: result.status,
          notes: result.orphanRows?.length ? `${result.orphanRows.length} orphan page row(s)` : null,
        });
        if (error) throw new Error(`run log write failed: ${error.message}`);
        await clearExpansionCheckpoint(route);
      }
    } catch (error) {
      failureCount += 1;
      console.error(`[${index + 1}/${selected.length}] ${route.id_expansion} failed: ${error.message}`);
      if (!dryRun) {
        await db.from("cardmarket_enrichment_run").insert({
          id_expansion: route.id_expansion,
          started_at: startedAt,
          completed_at: new Date().toISOString(),
          status: "failed",
          notes: String(error.message).slice(0, 2_000),
        });
      }
    }
  }

  await agentBrowserCommand(["close"]);
  assertNoFailures(failureCount);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export function planScrapedExpansion({ localProducts, rawRows }) {
  if ((localProducts?.length ?? 0) > 0 && !(rawRows?.length)) {
    return { status: "refused", identities: [], reason: "listing page returned no product rows" };
  }
  const parsed = readExpansionPage(rawRows);
  if (parsed.skipped.length) {
    return { status: "refused", identities: [], parsed, reason: `${parsed.skipped.length} unreadable row(s)` };
  }
  const planned = planExpansion({
    localProducts,
    pageRows: [...parsed.products, ...parsed.placeholders],
  });
  return {
    status: planned.summary.unresolved ? "partial" : "complete",
    identities: planned.plans.flatMap((plan) => plan.identities),
    parsed,
    ...planned,
  };
}

export function pageCountFromText(text) {
  const match = String(text ?? "").match(/\bPage\s+\d+\s+of\s+(\d+)\b/i);
  return match ? Number(match[1]) : 1;
}

export async function readAllPages(readPage, pageSize = 1_000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const page = await readPage(from, from + pageSize - 1);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export function pendingRoutes(routes, completed = new Set()) {
  return (routes ?? []).filter((route) =>
    route?.enrichment_status === "normal"
    && !completed.has(Number(route.id_expansion)));
}

/**
 * RA05 is the only anomaly with a dedicated safe path. It remains excluded
 * from every normal sweep; `--ra05` admits only this exact flagged route and
 * still resolves one complete printing at a time.
 */
export function ra05Routes(routes) {
  return (routes ?? []).filter((route) =>
    Number(route?.id_expansion) === RA05_EXPANSION_ID
    && route?.enrichment_status === "listing_anomaly");
}

export function attemptedExpansionIds(rows) {
  return new Set((rows ?? []).map((row) => Number(row.id_expansion)));
}

function expansionIdsByLatestStatus(rows, status) {
  const latestByExpansion = new Map();
  for (const row of rows ?? []) {
    const idExpansion = Number(row.id_expansion);
    const startedAt = Date.parse(row.started_at ?? "") || 0;
    const latest = latestByExpansion.get(idExpansion);
    if (!latest || startedAt >= latest.startedAt) {
      latestByExpansion.set(idExpansion, { status: row.status, startedAt });
    }
  }
  return new Set([...latestByExpansion]
    .filter(([, run]) => run.status === status)
    .map(([idExpansion]) => idExpansion));
}

export function failedExpansionIds(rows) {
  return expansionIdsByLatestStatus(rows, "failed");
}

export function partialExpansionIds(rows) {
  return expansionIdsByLatestStatus(rows, "partial");
}

/** Retry only failures the browser adapter identifies as transient. */
export async function withRetries(operation, {
  maxAttempts = 3,
  baseDelayMs = 1_000,
  sleep = wait,
} = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (!error?.retryable || attempt === maxAttempts) throw error;
      await sleep(baseDelayMs * (2 ** (attempt - 1)));
    }
  }
  throw new Error("unreachable retry state");
}
