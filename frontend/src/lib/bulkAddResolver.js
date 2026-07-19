// Bulk Add Resolver
//
// Resolution + row-building helpers for the paste-a-list bulk-add flow.
// Pure-ish logic (the only side effects are the YGOPRODeck API calls and a
// local sleep), kept out of the dialog so it can be imported and unit-tested.
//
// Consumes:
//   - `isSetCode` / `parseBulkLines` from `./bulkAddParser` (Step 2)
//   - `searchCardByName` / `searchCardBySetCode` / `searchById` from `@/api`
//
// IMPORTANT (R1 / data integrity): every built row carries `extension: ''` and
// `rarity: 'common'` — never null. The `Card` table has both columns NOT NULL
// and PostgREST forwards explicit JS nulls, so a null would silently reject the
// entire insert batch (the latent DeckImport.vue bug this flow diverges from).

import { isSetCode } from './bulkAddParser'
import { searchCardByName, searchCardBySetCode, searchById } from '@/api'

/** Transient retry backoff for a single line (R2). */
const RETRY_DELAY_MS = 600

/** Chunk size for the chunked insert (R4 / AC9). */
const DEFAULT_CHUNK_SIZE = 500

/** Local sleep — we deliberately do NOT reuse api.js's private `getWithRetry`. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Normalise the various YGOPRODeck response shapes into a plain card array.
 *
 *   - `searchCardByName` resolves to an axios response: the happy path is
 *     `response.data.data` (array), but its `.catch` returns `{ data: [] }`,
 *     so `response.data` may itself already be the array.
 *   - `searchById` resolves similarly (`response.data.data ?? response.data`).
 *
 * @param {{ data?: any }|null|undefined} response
 * @returns {Array} card array (possibly empty); never throws.
 */
function extractCards(response) {
  return response?.data?.data ?? response?.data ?? []
}

/**
 * Detect a transient network error worth one retry (R2). YGOPRODeck rate-limits
 * bursts, surfacing as an axios "Network Error" (no HTTP response).
 *
 * @param {unknown} err
 * @returns {boolean}
 */
function isTransientNetworkError(err) {
  if (!err) return false
  const msg = String(err.message ?? err)
  // axios surfaces rate-limit/connection blips with no `response` object.
  return /network error/i.test(msg) || err.response == null
}

/**
 * resolveLine({ qty, query }, { onRetry })
 *
 * Resolve a single parsed line into a Resolved-row (see Component & Data
 * Contracts). Routing:
 *   - set code  -> searchCardBySetCode(query) -> on hit searchById(id) -> matched
 *   - name      -> searchCardByName(query) with exact case-insensitive gating:
 *       * exactly one result, OR one result whose name === query (case-insensitive)
 *         -> matched
 *       * multiple genuine candidates with no exact match -> ambiguous
 *       * none -> unmatched
 *
 * On a transient Network Error the underlying lookup is retried ONCE after
 * ~600 ms (local sleep+retry, never api.js's private getWithRetry).
 *
 * @param {{ qty: number, query: string }} line
 * @param {{ onRetry?: function }} [opts]
 * @returns {Promise<{ status:'matched'|'ambiguous'|'unmatched', qty:number, query:string, candidates:Array, selected:Object|null, card:Object|null }>}
 */
export async function resolveLine({ qty, query }, { onRetry } = {}) {
  const base = { qty, query, candidates: [], selected: null, card: null }

  // Run an async lookup with a single transient-error retry (R2).
  const withRetry = async (fn) => {
    try {
      return await fn()
    } catch (err) {
      if (!isTransientNetworkError(err)) throw err
      if (onRetry) onRetry({ query })
      await sleep(RETRY_DELAY_MS)
      return fn()
    }
  }

  try {
    if (isSetCode(query)) {
      // Set-code route: resolve the passcode, then fetch the full card by id.
      const setRes = await withRetry(() => searchCardBySetCode(query))
      const id = setRes?.data?.id ?? null
      if (id == null) {
        return { ...base, status: 'unmatched' }
      }
      const byId = await withRetry(() => searchById(id))
      const cards = extractCards(byId)
      if (!cards.length) {
        return { ...base, status: 'unmatched' }
      }
      const card = cards[0]
      return { ...base, status: 'matched', selected: card, card }
    }

    // Name route.
    const nameRes = await withRetry(() => searchCardByName(query))
    const cards = extractCards(nameRes)

    if (!cards.length) {
      return { ...base, status: 'unmatched' }
    }

    // Exact case-insensitive name-match gating (R3): a single result, or a
    // result whose name equals the query, resolves cleanly to `matched` even
    // when other fuzzy hits exist.
    const needle = String(query).trim().toLowerCase()
    const exact = cards.find((c) => String(c?.name ?? '').toLowerCase() === needle)

    if (cards.length === 1) {
      const card = cards[0]
      return { ...base, status: 'matched', selected: card, card }
    }
    if (exact) {
      return { ...base, status: 'matched', selected: exact, card: exact }
    }

    // Multiple genuine candidates, no exact match -> let the user pick.
    return { ...base, status: 'ambiguous', candidates: cards }
  } catch (err) {
    // Non-transient failure (or retry still failed): treat as unmatched rather
    // than aborting the whole batch.
    return { ...base, status: 'unmatched' }
  }
}

/**
 * resolveLines(parsedLines, { onProgress, onRetry })
 *
 * Resolve an array of parsed lines SEQUENTIALLY — one `await` per line in a
 * for-loop, never `Promise.all` over all lines — to respect YGOPRODeck's
 * ~20 req/s burst limit (R2 / AC9). `onProgress(current, total)` fires once per
 * resolved line.
 *
 * @param {{ qty:number, query:string }[]} parsedLines
 * @param {{ onProgress?: function, onRetry?: function }} [opts]
 * @returns {Promise<Array>} resolved rows, in input order.
 */
export async function resolveLines(parsedLines, { onProgress, onRetry } = {}) {
  const rows = []
  const total = parsedLines.length
  for (let i = 0; i < total; i++) {
    // Sequential by design — do NOT parallelise.
    const row = await resolveLine(parsedLines[i], { onRetry })
    rows.push(row)
    if (onProgress) onProgress(i + 1, total)
  }
  return rows
}

/**
 * buildRow({ card, qty, isWish, userId })
 *
 * Build a single `Card` insert row per the Component & Data Contracts.
 * Always sets `extension: ''` and `rarity: 'common'` (never null) to satisfy
 * the NOT NULL columns.
 *
 * @param {{ card: Object, qty: number, isWish: boolean, userId: string }} args
 * @returns {Object} Card insert row.
 */
export function buildRow({ card, qty, isWish, userId }) {
  const canonicalName = card.name_en ?? card.name
  return {
    wish: isWish,
    game: 'YGO',
    url: `https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${canonicalName}`,
    name: canonicalName,
    extension: '',
    rarity: 'common',
    quantity: qty,
    trader: userId,
    image_id: card.id,
    language: 'English',
    condition: 'Near Mint',
    first_edition: false,
  }
}

/**
 * sanitizeRows(rows)
 *
 * Defensive pre-insert guard (R1): repair any null `extension`/`rarity` in
 * place before the rows reach PostgREST, then return the same array.
 *
 * @param {Array} rows
 * @returns {Array} the same array, mutated so no NOT-NULL column is null.
 */
export function sanitizeRows(rows) {
  rows.forEach((r) => {
    if (r.extension == null) r.extension = ''
    if (r.rarity == null) r.rarity = 'common'
  })
  return rows
}

/**
 * chunk(arr, size = 500)
 *
 * Split an array into chunks of at most `size` (R4 / AC9). The dialog inserts
 * each chunk sequentially so a very large paste never goes out as a single
 * oversized PostgREST request, e.g.:
 *
 *   for (const part of chunk(sanitizeRows(rows), 500)) {
 *     const { data, error } = await supabase.from('Card').insert(part).select()
 *     if (error) throw error
 *     inserted += data?.length ?? part.length
 *   }
 *
 * @param {Array} arr
 * @param {number} [size=500]
 * @returns {Array[]} array of chunks.
 */
export function chunk(arr, size = DEFAULT_CHUNK_SIZE) {
  const out = []
  const step = size > 0 ? size : DEFAULT_CHUNK_SIZE
  for (let i = 0; i < arr.length; i += step) {
    out.push(arr.slice(i, i + step))
  }
  return out
}
