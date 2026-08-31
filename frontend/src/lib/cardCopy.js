/**
 * A copy of a card, as the owner recorded it.
 *
 * The collection stores one row per *copy*, not per card: the same Blue-Eyes
 * can sit in the pile twice, once Near Mint 1st Edition and once Played
 * unlimited, and those are different offers at different prices. The fields
 * that make a copy what it is — printing, rarity, language, condition, edition,
 * quantity — are all chosen by hand at add time, which is exactly why they are
 * the fields that get chosen wrong.
 *
 * This module owns those fields so the add form and the edit form cannot drift.
 * Before it existed the lists below were `data()` on AddCard.vue, reachable
 * from nowhere else and testable from nowhere at all.
 */

/** Condition, worst-preserving order as collectors read a grading scale. */
export const CONDITIONS = [
  "Mint", "Near Mint", "Excellent", "Good", "Light Played", "Played", "Poor",
];

/** The languages Cardmarket prices separately. */
export const LANGUAGES = [
  "English", "French", "Spanish", "German", "Italian", "Portuguese",
];

/** Two-letter tag for a language, for the chip on a row. */
const LANGUAGE_TAG = {
  English: "EN", French: "FR", Spanish: "ES",
  German: "DE", Italian: "IT", Portuguese: "PT",
};

export function languageTag(language) {
  return LANGUAGE_TAG[language] ?? (language ? language.slice(0, 2).toUpperCase() : "");
}

/** Initials of a rarity: "Secret Rare" -> "SR". */
export function shortenRarity(rarity) {
  if (!rarity) return "";
  return rarity.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").toUpperCase();
}

/**
 * A printing as the add and edit forms show it: "DOOD-EN024 | Secret Rare".
 * YGOPRODeck's `card_sets` is the source, and both forms have to build the
 * label the same way or an edit cannot preselect what the add form stored.
 */
export const printingLabel = (set) => `${set.set_code} | ${set.set_rarity}`;

export function printingOptions(card) {
  return (card?.card_sets ?? []).map(printingLabel);
}

/** Split a printing label back into the two columns the row is stored in. */
export function parsePrinting(label) {
  if (typeof label !== "string" || !label.includes("|")) return { extension: null, rarity: null };
  const [code, rarity] = label.split("|");
  return { extension: code.trim() || null, rarity: rarity.trim() || null };
}

/**
 * What an edit is allowed to write, given the copy it started from.
 *
 * Two rules live here rather than in the dialog, because getting either wrong
 * is silent:
 *
 * 1. `cardmarket_product_id` pins a copy to one Cardmarket product, and that
 *    pin is what `card_prices` trusts above every other signal. It was chosen
 *    for the *old* printing, so changing extension or rarity has to drop it —
 *    otherwise the row keeps quoting a product it is no longer a copy of, and
 *    nothing in the UI says so. `setCardPrinting` writes all three together for
 *    the same reason; this is the other half of that rule.
 *
 * 2. Quantity cannot fall below the copies already committed to accepted
 *    trades. The stepper enforces this floor too, but a dialog is a second way
 *    in and the floor has to hold at both.
 *
 * @param {object} original the card row being edited
 * @param {object} next     the form's values
 * @param {number} reserved copies locked into accepted trades
 * @returns {{patch: object, errors: string[]}}
 */
export function buildCopyPatch(original = {}, next = {}, reserved = 0) {
  const errors = [];

  const extension = next.extension ?? null;
  const rarity    = next.rarity ?? null;
  const quantity  = Number(next.quantity);

  if (!extension) errors.push("printing");
  if (!Number.isInteger(quantity) || quantity < 1) errors.push("quantity");
  else if (quantity < reserved) errors.push("reserved");

  const patch = {
    extension,
    rarity,
    language:      next.language ?? null,
    condition:     next.condition ?? null,
    first_edition: !!next.first_edition,
    quantity,
  };

  // Rule 1. Compare against what the copy actually holds, so re-saving the
  // dialog without touching the printing keeps a pin somebody picked by hand.
  const printingMoved =
    extension !== (original.extension ?? null) || rarity !== (original.rarity ?? null);
  if (printingMoved) patch.cardmarket_product_id = null;

  return { patch, errors };
}

/** Whether an edit would change anything, so an untouched dialog can no-op. */
export function isCopyUnchanged(original = {}, patch = {}) {
  return Object.entries(patch).every(([key, value]) => {
    const was = original[key] ?? null;
    if (typeof value === "boolean") return !!was === value;
    return (was ?? null) === (value ?? null);
  });
}
