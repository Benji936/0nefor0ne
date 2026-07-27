// Pure helpers for the claim UI. Kept out of the dialog so both the dialog and
// its tests share one source of truth.
export function deriveClaimState(community, currentUserId) {
  const owner = community?.owner ?? null;
  if (!owner) return "claimable";
  return owner === currentUserId ? "owned_by_me" : "owned_by_other";
}

export function isValidCode(input) {
  return typeof input === "string" && /^[0-9]{6}$/.test(input);
}
