/**
 * cardmarket-elimination.mjs
 *
 * Resolves the products an expansion page describes but cannot name.
 *
 * The problem
 * -----------
 * An expansion listing row states a product's identity twice -- once in the
 * image path, once in the alt text:
 *
 *   <img alt="Celtic Mystic (V.2 - Starlight Rare)"
 *        data-echo=".../CORI/894690/894690.jpg">
 *
 * Products Cardmarket has no artwork for get a shared placeholder image
 * instead, so the alt survives and the id does not. The row still describes a
 * real product; we simply cannot read which one from the picture.
 *
 * What this module does about it
 * ------------------------------
 * Set difference, and only set difference. For one printing we hold two
 * complete sets: every id_product the catalogue files under
 * (id_metacard, id_expansion), and every row the page renders for that
 * printing. Remove the rows that named themselves, remove the ids they named,
 * and if exactly one id and exactly one row are left, they are each other --
 * not by resemblance, but because there is nothing else either could be.
 *
 * Both sides must be complete for that to hold, which is why the checks below
 * are all about completeness rather than plausibility.
 *
 * What this is NOT
 * ----------------
 * It is not an ordering argument. Nothing here consults idProduct order, row
 * order, dateAdded, version order or price. 691287 is V.2 and 691288 is V.1 in
 * the real catalogue, so id order does not track version and no rung of this is
 * allowed to assume it does. Two unknown ids against two unknown rows stays
 * unresolved even though the counts match, because a pair has two mappings and
 * nothing in the data chooses between them.
 *
 * Pure: takes rows already read out of a rendered DOM plus rows already read
 * out of the catalogue, and returns verdicts.
 */

import { slugKey } from "./cardmarket-expansion-page.mjs";

/**
 * How an identity was established. Kept distinct in the record itself, because
 * "the page said so" and "nothing else it could be" are different claims and an
 * audit six months from now cannot tell them apart after the fact.
 */
export const SOURCE_DIRECT = "cardmarket_expansion_page";
export const SOURCE_ELIMINATION = "cardmarket_expansion_elimination";

/** Identity as it would be written, minus the id it belongs to. */
function identityOf(row) {
  return {
    versionNo: row.versionNo ?? null,
    versionLabel: row.versionLabel ?? null,
    rarity: row.rarity ?? null,
  };
}

/** Two rows describe the same variant. Used to catch a page listing a dupe. */
function sameIdentity(a, b) {
  return (a.versionNo ?? null) === (b.versionNo ?? null)
    && slugKey(a.versionLabel ?? "") === slugKey(b.versionLabel ?? "");
}

/**
 * Decide one printing.
 *
 * `localIds` is every id_product the catalogue holds for this printing.
 * `rows` is every page row assigned to it, each { idProduct|null, versionNo,
 * versionLabel, rarity, cardName }.
 *
 * Returns { status, identities, reason }, where status is:
 *   direct       every product named itself
 *   elimination  all but one named itself; the last one follows by difference
 *   unresolved   anything else, with `reason` saying which check stopped it
 *
 * `identities` is only ever populated for a status that resolved the *whole*
 * printing. A half-answer is worse than none here: the price ladder treats a
 * printing with rarities as authoritative, so a partially enriched group would
 * let it answer confidently off an incomplete set.
 */
export function planPrinting({ idMetacard, localIds, rows }) {
  const out = (status, reason, identities = []) => ({
    idMetacard, status, reason: reason ?? null, identities,
    localCount: localIds.length, pageRowCount: rows.length,
  });

  if (!localIds.length) return out("unresolved", "no local products");
  if (!rows.length) return out("unresolved", "printing absent from page");

  // 1. Both sides must describe the same number of things. A page holding
  //    fewer rows than the catalogue holds products means the page is not the
  //    complete set, and a difference taken against an incomplete set is a
  //    guess wearing arithmetic.
  if (rows.length !== localIds.length) {
    return out("unresolved", `page has ${rows.length} rows for ${localIds.length} products`);
  }

  const known = rows.filter((r) => r.idProduct != null);
  const unknownRows = rows.filter((r) => r.idProduct == null);
  const knownIds = known.map((r) => r.idProduct);

  // 2. Every id the page named must be one of ours, or the rows are not this
  //    printing and the counts agreeing was a coincidence.
  const local = new Set(localIds);
  const foreign = knownIds.filter((id) => !local.has(id));
  if (foreign.length) return out("unresolved", `page id(s) not in this printing: ${foreign.join(", ")}`);

  // 3. No id may appear twice: that would leave a local id unaccounted for
  //    while the counts still balanced.
  if (new Set(knownIds).size !== knownIds.length) {
    return out("unresolved", "the same id appears on more than one row");
  }

  // 4. Every row must actually state a variant. A row with no version and no
  //    rarity carries nothing to assign, so a printing containing one cannot be
  //    completed even if the arithmetic works out.
  const mute = rows.filter((r) => r.versionNo == null && !r.rarity);
  if (mute.length) return out("unresolved", `${mute.length} row(s) state no version or rarity`);

  // 5. And each variant must be distinct, or two ids would map to one identity
  //    and the printing would still be ambiguous after the fact.
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      if (sameIdentity(rows[i], rows[j])) {
        return out("unresolved", `two rows share the identity "${rows[i].versionLabel}"`);
      }
    }
  }

  if (!unknownRows.length) {
    return out("direct", null, known.map((r) => ({
      idProduct: r.idProduct, ...identityOf(r), source: SOURCE_DIRECT,
    })));
  }

  const unknownIds = localIds.filter((id) => !knownIds.includes(id));

  // 6. The whole point. One id left and one row left is a unique pairing; two
  //    and two is two possible pairings, and the counts matching does not
  //    reduce that to one.
  if (unknownIds.length !== 1 || unknownRows.length !== 1) {
    return out("unresolved",
      `${unknownIds.length} unnamed product(s) against ${unknownRows.length} unnamed row(s)`);
  }

  return out("elimination", null, [
    ...known.map((r) => ({ idProduct: r.idProduct, ...identityOf(r), source: SOURCE_DIRECT })),
    { idProduct: unknownIds[0], ...identityOf(unknownRows[0]), source: SOURCE_ELIMINATION },
  ]);
}

/**
 * Attach page rows to printings.
 *
 * By idProduct wherever the row has one, because the id *is* the identity and
 * needs no interpretation. Only a row with no id -- a no-artwork row -- falls
 * back to matching on the card name.
 *
 * That ordering is not a preference, it is the difference between reading and
 * guessing, and BLZD proved it costs real answers to get backwards. Cardmarket
 * had renamed four products since our catalogue import while keeping their ids:
 * "Nervado the Shadebeast Power Patron" is "Nervedo" on the page today. Both of
 * its rows named their ids, both ids are ours, and the printing was complete --
 * yet a name-first bridge could not see it and reported it ambiguous.
 *
 * The name bridge that remains is checked rather than trusted. A folded name
 * two printings answer to cannot place a no-artwork row, so those rows are
 * reported instead of assigned, and the printing then fails the count gate
 * rather than being completed from a name that was never distinct.
 *
 * Folding is by slugKey, which is what makes "Inferno of the Sacred Beasts –
 * Uria" and "...Beasts - Uria" one card: Cardmarket writes the dash both ways
 * inside a single printing.
 */
export function assignRows({ localProducts, pageRows }) {
  const byMetacard = new Map();
  const metacardOfProduct = new Map();
  for (const p of localProducts) {
    const g = byMetacard.get(p.id_metacard)
      ?? { idMetacard: p.id_metacard, ids: [], keys: new Set(), name: p.name, rows: [] };
    g.ids.push(p.id_product);
    g.keys.add(slugKey(p.name));
    byMetacard.set(p.id_metacard, g);
    metacardOfProduct.set(p.id_product, p.id_metacard);
  }

  // A folded name more than one printing answers to can place nothing.
  const claimants = new Map();
  for (const g of byMetacard.values()) {
    for (const k of g.keys) claimants.set(k, (claimants.get(k) ?? 0) + 1);
  }

  const orphanRows = [];
  const conflicts = [];
  const contestedGroups = new Set();

  for (const r of pageRows) {
    if (r.idProduct != null) {
      const m = metacardOfProduct.get(r.idProduct);
      if (m == null) { orphanRows.push({ ...r, reason: "id not in this expansion" }); continue; }
      byMetacard.get(m).rows.push(r);
      continue;
    }
    // No id: the name is all that is left, so it has to be unambiguous.
    const k = slugKey(r.cardName);
    const owner = [...byMetacard.values()].find((g) => g.keys.has(k));
    if (!owner) { orphanRows.push({ ...r, reason: "no local card of that name" }); continue; }
    if (claimants.get(k) > 1) {
      conflicts.push({ idMetacard: owner.idMetacard, name: owner.name, cardName: r.cardName,
                       reason: "no-artwork row, and the name is shared with another printing" });
      contestedGroups.add(owner.idMetacard);
      continue;
    }
    owner.rows.push(r);
  }

  const assigned = [...byMetacard.values()].map((g) => ({
    idMetacard: g.idMetacard, name: g.name, localIds: g.ids, rows: g.rows,
    contested: contestedGroups.has(g.idMetacard),
  }));

  return { assigned, conflicts, orphanRows };
}

/**
 * Plan a whole expansion, printing by printing.
 *
 * Deliberately not all-or-nothing. The old gate compared one number for the
 * whole expansion -- every local id had to appear on the pages -- and refused
 * everything when it did not, which meant one un-illustrated card could
 * withhold correct identities for fifteen printings that were never in doubt.
 * Completeness is a property of a printing, not of an expansion, so it is
 * checked where it lives.
 *
 * Single-product printings are counted but never written: with one product
 * there is no ambiguity for an identity to resolve, and storing one would
 * assert a version Cardmarket may not have stated.
 */
export function planExpansion({ localProducts, pageRows }) {
  const { assigned, conflicts, orphanRows } = assignRows({ localProducts, pageRows });

  const multi = assigned.filter((g) => g.localIds.length > 1);
  const single = assigned.filter((g) => g.localIds.length === 1);
  const plans = multi.map((g) => ({ name: g.name, ...planPrinting(g) }));

  const identities = plans.flatMap((p) => p.identities);
  return {
    plans,
    conflicts,
    orphanRows,
    summary: {
      localProducts: localProducts.length,
      pageRows: pageRows.length,
      pageRowsWithId: pageRows.filter((r) => r.idProduct != null).length,
      pageRowsPlaceholder: pageRows.filter((r) => r.idProduct == null).length,
      singleProductPrintings: single.length,
      multiProductPrintings: multi.length,
      resolvedDirect: plans.filter((p) => p.status === "direct").length,
      resolvedByElimination: plans.filter((p) => p.status === "elimination").length,
      unresolved: plans.filter((p) => p.status === "unresolved").length,
      identitiesDirect: identities.filter((i) => i.source === SOURCE_DIRECT).length,
      identitiesByElimination: identities.filter((i) => i.source === SOURCE_ELIMINATION).length,
    },
  };
}
