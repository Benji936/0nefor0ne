// What a community is, now that it can be several things at once.
//
// The database keeps kinds (the full set, first entry primary) alongside the
// older kind column (always kinds[1]). Everything on screen should read kinds;
// kind survives for the seeder and for the places that have room for one glyph.

export const KINDS = ["store", "discord", "group"];

// Singular labels for the page itself; the directory filter uses the plural
// kindStore / kindDiscord / kindGroup keys instead.
export const TYPE_KEYS = {
  store:   "community.typeStore",
  discord: "community.typeDiscord",
  group:   "community.typeGroup",
};

/**
 * The kinds of a community, tolerant of a row that predates the column or came
 * from a narrower select. Never returns an empty array for a real community.
 */
export function kindsOf(community) {
  const list = Array.isArray(community?.kinds) ? community.kinds.filter((k) => KINDS.includes(k)) : [];
  if (list.length) return list;
  return community?.kind ? [community.kind] : [];
}

/** Drop anything unknown and any repeat, keeping order: first is primary. */
export function normalizeKinds(list) {
  const out = [];
  for (const k of Array.isArray(list) ? list : []) {
    if (KINDS.includes(k) && !out.includes(k)) out.push(k);
  }
  return out;
}

export function primaryKind(community) {
  return kindsOf(community)[0] ?? null;
}

// Proof gets harder in this order, and a community must pass the hardest one it
// claims. A shop that also runs a Discord server does not get to prove the
// Discord and wear the badge as a shop: the person reading it came for the shop.
const STRICTNESS = ["store", "group", "discord"];

export function strictestKind(community) {
  const list = kindsOf(community);
  return STRICTNESS.find((k) => list.includes(k)) ?? null;
}
