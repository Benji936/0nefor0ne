/**
 * SSR-safe localStorage helpers for tracking ignored (sourced) cards per deck,
 * plus Supabase helpers for authenticated users.
 *
 * localStorage key: `tm_deck_ignored_${deckId}`
 * Value format:     JSON array of numeric card IDs, e.g. [42, 105, 7]
 *
 * Auth-aware strategy:
 * - Authenticated users: load from `decks.ignored_card_ids` (Supabase),
 *   persist via `saveIgnoredIdsToDb`. localStorage is not used for auth users.
 * - Guests: use localStorage only (existing behavior).
 *
 * Vue 3 reactivity note: Vue 3 does NOT track in-place Set mutations.
 * Callers must always reassign the reactive property to a new Set instance:
 *   this.ignoredIds = toggleIgnoredId(deckId, cardId)
 */

const KEY_PREFIX = 'tm_deck_ignored_';

/**
 * Load the set of ignored card IDs for a given deck from localStorage.
 *
 * SSR guard: returns an empty Set immediately when called outside a browser
 * context (`typeof window === 'undefined'`). This makes it safe to import the
 * module in SSR bundles as long as it is never *called* during server-side
 * rendering (call it only from `mounted()` or inside a function that is
 * triggered from `mounted()`).
 *
 * @param {string|number} deckId - The deck identifier (local integer or Supabase UUID).
 * @returns {Set<number>} The set of ignored card IDs, or an empty Set on error / missing key.
 */
export function loadIgnoredIds(deckId) {
  if (typeof window === 'undefined') {
    return new Set();
  }

  try {
    const raw = localStorage.getItem(KEY_PREFIX + deckId);
    if (raw === null) {
      return new Set();
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(parsed);
  } catch {
    // Silently fail on parse errors or localStorage access errors.
    return new Set();
  }
}

/**
 * Persist the set of ignored card IDs for a given deck to localStorage.
 *
 * SSR guard: no-ops immediately when called outside a browser context
 * (`typeof window === 'undefined'`).
 *
 * @param {string|number} deckId - The deck identifier (local integer or Supabase UUID).
 * @param {Set<number>} set - The complete set of ignored card IDs to persist.
 * @returns {void}
 */
export function saveIgnoredIds(deckId, set) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(KEY_PREFIX + deckId, JSON.stringify([...set]));
  } catch {
    // Silently fail if localStorage is unavailable (e.g. private browsing quota).
  }
}

/**
 * Toggle the ignored state of a single card within a deck, persist the result,
 * and return the updated Set.
 *
 * If `cardId` is currently ignored it will be removed; otherwise it will be added.
 *
 * Vue 3 reactivity note: This function always returns a **new Set instance**
 * so that Vue 3's reactivity system can detect the change. The caller MUST
 * reassign the reactive property rather than relying on in-place mutation:
 *
 *   this.ignoredIds = toggleIgnoredId(deckId, cardId)  // ✓ triggers re-render
 *
 * Never mutate the returned Set before reassigning — create a fresh assignment.
 *
 * @param {string|number} deckId - The deck identifier (local integer or Supabase UUID).
 * @param {number} cardId - The card ID to toggle.
 * @returns {Set<number>} A new Set instance reflecting the updated ignored state.
 */
export function toggleIgnoredId(deckId, cardId) {
  const current = loadIgnoredIds(deckId);
  const updated = new Set(current);

  if (updated.has(cardId)) {
    updated.delete(cardId);
  } else {
    updated.add(cardId);
  }

  saveIgnoredIds(deckId, updated);
  return updated;
}

// ── Supabase helpers (auth users only) ──────────────────────────────────────

/**
 * Build a Set from the `ignored_card_ids` column of a Supabase deck record.
 * Call this instead of `loadIgnoredIds` when the deck was fetched from Supabase.
 *
 * @param {{ ignored_card_ids?: number[] | null }} record - A raw Supabase deck row.
 * @returns {Set<number>}
 */
export function loadIgnoredIdsFromRecord(record) {
  return new Set((record.ignored_card_ids ?? []).map(Number));
}

/**
 * Persist the ignored card IDs for a deck back to Supabase.
 * Fire-and-forget for UX — call without await.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} deckId - Supabase UUID of the deck.
 * @param {Set<number>} ignoredIds - Current ignored set.
 * @returns {Promise<void>}
 */
export async function saveIgnoredIdsToDb(supabase, deckId, ignoredIds) {
  const arr = [...ignoredIds].map(Number);
  const { error } = await supabase
    .from('decks')
    .update({ ignored_card_ids: arr })
    .eq('id', deckId);
  if (error) {
    console.error('deckIgnore: saveIgnoredIdsToDb failed', error);
  }
}
