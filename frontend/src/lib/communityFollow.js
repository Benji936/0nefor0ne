/**
 * Community follows.
 *
 * A follow is one row in community_follow keyed (community, follower). The
 * follower count lives denormalised on community.follower_count, maintained by
 * a database trigger, so callers never count rows client-side.
 *
 * RLS lets a user read and write only their own follow rows; a community owner
 * additionally reads the rows pointing at their community (see followerCount /
 * fetchFollowers).
 */
import { getClient } from "@/lib/supabaseClient";

/** True when the signed-in user follows this community. */
export async function isFollowing(communityId, userId) {
  if (!communityId || !userId) return false;
  const { data, error } = await getClient()
    .from("community_follow")
    .select("community")
    .eq("community", communityId)
    .eq("follower", userId)
    .maybeSingle();
  if (error) { console.error("isFollowing failed", error); return false; }
  return !!data;
}

/**
 * Follow a community. Idempotent: re-following an already-followed community
 * hits the (community, follower) primary key, which we treat as success rather
 * than an error so a double-click cannot surface a failure.
 */
export async function follow(communityId, userId) {
  const { error } = await getClient()
    .from("community_follow")
    .insert({ community: communityId, follower: userId });
  if (error && error.code !== "23505") {
    console.error("follow failed", error);
    throw error;
  }
}

/** Unfollow. Deleting a row that is not there is a no-op, so this is idempotent too. */
export async function unfollow(communityId, userId) {
  const { error } = await getClient()
    .from("community_follow")
    .delete()
    .eq("community", communityId)
    .eq("follower", userId);
  if (error) { console.error("unfollow failed", error); throw error; }
}

/**
 * The communities the signed-in user follows, newest first, joined to the
 * fields the account list renders.
 */
export async function fetchFollowing(userId) {
  if (!userId) return [];
  const { data, error } = await getClient()
    .from("community_follow")
    .select("created_at, community:community ( id, name, slug, kind, city, country, avatar_url, verified, follower_count )")
    .eq("follower", userId)
    .order("created_at", { ascending: false });
  if (error) { console.error("fetchFollowing failed", error); return []; }
  // Drop rows whose community was deleted or is no longer visible under RLS.
  return (data ?? []).filter((r) => r.community).map((r) => ({ ...r.community, followed_at: r.created_at }));
}

/**
 * Just the ids of the communities the user follows. fetchFollowing joins the
 * whole community row for rendering; feeds only need the ids to scope a query,
 * so this stays a narrow read.
 */
export async function fetchFollowedIds(userId) {
  if (!userId) return [];
  const { data, error } = await getClient()
    .from("community_follow")
    .select("community")
    .eq("follower", userId);
  if (error) { console.error("fetchFollowedIds failed", error); return []; }
  return (data ?? []).map((r) => r.community);
}

/**
 * Follower rows for a community the caller owns (RLS returns nothing for
 * anyone else). Used by the owner-only followers readout.
 */
export async function fetchFollowers(communityId) {
  const { data, error } = await getClient()
    .from("community_follow")
    .select("follower, created_at")
    .eq("community", communityId)
    .order("created_at", { ascending: false });
  if (error) { console.error("fetchFollowers failed", error); return []; }
  return data ?? [];
}
