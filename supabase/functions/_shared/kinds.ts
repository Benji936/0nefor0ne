// Mirror of frontend/src/lib/communityKinds.js. The client picks which proof to
// offer; this is the copy that decides whether to accept it.
//
// Proof gets harder down this list, and a community has to pass the hardest one
// it claims. A shop that also runs a Discord server does not get to prove the
// server instead of the shop: the badge is read by someone deciding whether to
// walk into a shop.
const STRICTNESS = ["store", "group", "discord"] as const;

export type Kind = typeof STRICTNESS[number];

export function kindsOf(community: { kinds?: string[] | null; kind?: string | null }): string[] {
  const list = Array.isArray(community?.kinds)
    ? community.kinds.filter((k) => (STRICTNESS as readonly string[]).includes(k))
    : [];
  if (list.length) return list;
  return community?.kind ? [community.kind] : [];
}

export function strictestKind(
  community: { kinds?: string[] | null; kind?: string | null },
): Kind | null {
  const list = kindsOf(community);
  return STRICTNESS.find((k) => list.includes(k)) ?? null;
}
