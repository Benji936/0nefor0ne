// Want lists for "Looking For" announces.
//
// Turns the output of the shared bulk-add pipeline (parseBulkLines ->
// resolveLines, in lib/bulkAdd*.js) into announce_want_card rows. Kept pure and
// separate from the dialog so the mapping — especially the DB's CHECK
// constraints — can be unit tested without a DOM or network.
//
// Table shape (supabase/migrations/20260722_announce_want_card.sql):
//   ygo_card_id bigint NULL
//   card_name   text NOT NULL CHECK (char_length BETWEEN 1 AND 120)
//   qty         smallint NOT NULL CHECK (qty BETWEEN 1 AND 99)
//   sort_order  smallint NOT NULL

/** Mirrors the DB CHECK, so a bad qty is clamped rather than rejecting the batch. */
export const MIN_QTY = 1;
export const MAX_QTY = 99;

/** Mirrors the DB CHECK on card_name. */
export const MAX_NAME_LEN = 120;

function clampQty(qty) {
  const n = Math.floor(Number(qty));
  if (!Number.isFinite(n)) return MIN_QTY;
  return Math.min(MAX_QTY, Math.max(MIN_QTY, n));
}

function capName(name) {
  const s = String(name ?? "").trim().replace(/\s+/g, " ");
  return s.length > MAX_NAME_LEN ? s.slice(0, MAX_NAME_LEN - 1) + "…" : s;
}

/**
 * Build announce_want_card rows from resolved bulk-add lines.
 *
 * A line that did not resolve is KEPT, with a null ygo_card_id: someone reading
 * the post can still act on "Kashtira Fenrir (alt art)" even though the
 * resolver could not pin it to a passcode. Only genuinely empty lines are
 * dropped, because card_name is NOT NULL with a length floor of 1.
 *
 * @param {Array<{status:string, qty:number, query:string, card:Object|null, selected:Object|null}>} resolved
 * @returns {Array<{ygo_card_id:number|null, card_name:string, qty:number, sort_order:number}>}
 */
export function buildWantRows(resolved) {
  if (!Array.isArray(resolved)) return [];

  const rows = [];
  for (const line of resolved) {
    if (!line) continue;
    const card = line.card ?? line.selected ?? null;
    // Fall back to the typed query so an unresolved line still says something.
    const card_name = capName(card?.name ?? line.query);
    if (!card_name) continue;

    rows.push({
      ygo_card_id: card?.id != null ? Number(card.id) : null,
      card_name,
      qty: clampQty(line.qty),
      sort_order: rows.length,
    });
  }
  return rows;
}

/** How many of the rows resolved to a real card. Drives the review-step summary. */
export function countResolved(rows) {
  return (rows ?? []).filter((r) => r?.ygo_card_id != null).length;
}

/** Total copies wanted across the list, for the "12 cards" style summary. */
export function totalQty(rows) {
  return (rows ?? []).reduce((sum, r) => sum + (Number(r?.qty) || 0), 0);
}
