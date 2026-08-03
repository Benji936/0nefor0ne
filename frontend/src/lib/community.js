import { getClient } from "@/lib/supabaseClient";
import { slugify, withSuffix } from "@/lib/communitySlug";
import { sanitizeLinks } from "@/lib/communityLinks";

const PAGE_SIZE = 24;
const MAX_UNVERIFIED_PER_OWNER = 5; // spam cap

function assertHttp(url, label) {
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) throw new Error(`${label} must start with http:// or https://`);
  return url;
}

/** Build a slug not already taken (checks the DB, then numbers collisions). */
async function uniqueSlug(name, city) {
  const base = slugify(name, { city });
  for (let n = 1; n < 50; n++) {
    const slug = n === 1 ? base : withSuffix(base, n);
    const { data } = await getClient().from("community").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
  }
  return withSuffix(base, Date.now() % 100000); // pathological fallback
}

export async function fetchDirectory({ kind, country, region, remoteDuel, q, page = 0, pageSize = PAGE_SIZE } = {}) {
  let query = getClient()
    .from("community")
    .select("id, kind, name, slug, city, country, region, avatar_url, banner_url, remote_duel, verified, owner, follower_count", { count: "exact" })
    .eq("status", "published");

  if (kind)               query = query.eq("kind", kind);
  if (country)            query = query.eq("country", country);
  if (region)             query = query.eq("region", region);
  if (remoteDuel === true) query = query.eq("remote_duel", true);
  if (q && q.trim()) {
    // Escape LIKE metacharacters so a literal % or _ in the search text is
    // matched literally rather than treated as a wildcard.
    const esc = q.trim().replace(/[\\%_]/g, (m) => "\\" + m);
    query = query.ilike("name", `%${esc}%`);
  }

  const from = page * pageSize;
  const { data, count, error } = await query
    .order("verified", { ascending: false })
    .order("name", { ascending: true })
    .range(from, from + pageSize - 1);

  if (error) { console.error("fetchDirectory failed", error); throw error; }
  return { rows: data ?? [], count: count ?? 0 };
}

export async function fetchBySlug(slug) {
  const { data, error } = await getClient()
    .from("community").select("*").eq("slug", slug).maybeSingle();
  if (error) { console.error("fetchBySlug failed", error); throw error; }
  return data ?? null;
}

export async function createCommunity(input) {
  const me = (await getClient().auth.getSession()).data?.session?.user?.id;
  if (!me) throw new Error("Sign in to create a community.");

  const { count } = await getClient()
    .from("community").select("id", { count: "exact", head: true })
    .eq("owner", me).eq("verified", false);
  if ((count ?? 0) >= MAX_UNVERIFIED_PER_OWNER) {
    throw new Error("You have reached the limit of unverified communities.");
  }

  const slug = await uniqueSlug(input.name, input.city);
  const row = {
    owner: me,
    kind: input.kind,
    name: input.name,
    slug,
    bio: input.bio ?? "",
    website: assertHttp(input.website, "Website"),
    discord_url: assertHttp(input.discord_url, "Discord link"),
    // Seed the links list from the create form's website/discord fields; richer
    // platform links are added later on the profile itself.
    links: sanitizeLinks(input.links ?? [
      input.website     ? { platform: "website", url: input.website } : null,
      input.discord_url ? { platform: "discord", url: input.discord_url } : null,
    ].filter(Boolean)),
    avatar_url: input.avatar_url ?? null,
    banner_url: input.banner_url ?? null,
    city: input.city ?? null,
    country: input.country ?? null,
    country_code: input.country_code ?? null,
    region: input.region ?? null,
    remote_duel: !!input.remote_duel,
    tags: input.tags ?? [],
    status: input.status ?? "published",
  };
  // Insert, retrying with a numbered slug if it collides. uniqueSlug pre-checks
  // through the RLS-filtered client, which cannot see other users' draft/hidden
  // rows, so a slug clash can surface only at insert time (unique violation,
  // 23505). Retrying keeps slugs readable without a privileged lookup.
  const baseSlug = row.slug;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const { data, error } = await getClient().from("community").insert(row).select().single();
    if (!error) return data;
    if (error.code !== "23505") { console.error("createCommunity failed", error); throw error; }
    row.slug = withSuffix(baseSlug, attempt + 1);
  }
  throw new Error("Could not generate a unique profile link. Please try a different name.");
}

export async function updateCommunity(id, patch) {
  const clean = { ...patch, updated_at: new Date().toISOString() };
  if ("website" in clean)     clean.website = assertHttp(clean.website, "Website");
  if ("discord_url" in clean) clean.discord_url = assertHttp(clean.discord_url, "Discord link");
  if ("links" in clean)       clean.links = sanitizeLinks(clean.links);
  const { data, error } = await getClient().from("community").update(clean).eq("id", id).select().single();
  if (error) { console.error("updateCommunity failed", error); throw error; }
  return data;
}

// Claiming is now a verified flow (Plan 1): request a code emailed to the store's
// on-file address, then verify it. Ownership is granted server-side by the
// claim-verify-code Edge Function; there is no more instant free claim RPC.
export async function requestClaimCode(communityId) {
  const { data, error } = await getClient().functions.invoke("claim-request-code", {
    body: { community_id: communityId },
  });
  if (error) { console.error("requestClaimCode failed", error); throw error; }
  return data;
}

export async function verifyClaimCode(communityId, code) {
  const { data, error } = await getClient().functions.invoke("claim-verify-code", {
    body: { community_id: communityId, code },
  });
  if (error) { console.error("verifyClaimCode failed", error); throw error; }
  return data;
}

// Fallback when the store has no email on file: record a review reason on the
// caller's own claim row (the column guard blocks writes to any other field).
export async function requestManualReview(communityId, reason) {
  const me = (await getClient().auth.getSession()).data?.session?.user?.id;
  if (!me) throw new Error("Sign in to request a review.");
  const { error } = await getClient().from("community_claim").upsert(
    { community: communityId, claimer: me, manual_review_reason: reason },
    { onConflict: "community,claimer" },
  );
  if (error) { console.error("requestManualReview failed", error); throw error; }
}

// Start the paid claim: the claim-create-checkout Edge Function returns a Stripe
// Checkout URL (subscription mode, 365-day trial, local currency). The caller
// redirects the browser to it. Requires identity_verified_at server-side.
export async function startClaimCheckout(communityId) {
  const { data, error } = await getClient().functions.invoke("claim-create-checkout", {
    body: { community_id: communityId },
  });
  if (error) { console.error("startClaimCheckout failed", error); throw error; }
  return data; // { url } on success, or { error }
}

// Open the Stripe Customer Portal for an owned community so the owner can update
// the card or cancel. Returns a portal URL to redirect to.
export async function openBillingPortal(communityId) {
  const { data, error } = await getClient().functions.invoke("claim-portal", {
    body: { community_id: communityId },
  });
  if (error) { console.error("openBillingPortal failed", error); throw error; }
  return data; // { url } on success, or { error }
}

// The caller's own claim row for a community (RLS returns only their own).
// Lets the dialog resume at the subscribe step after an identity code was
// already verified (e.g. returning from a canceled Checkout).
export async function fetchMyClaim(communityId) {
  const me = (await getClient().auth.getSession()).data?.session?.user?.id;
  if (!me) return null;
  const { data, error } = await getClient()
    .from("community_claim")
    .select("identity_verified_at, subscription_status")
    .eq("community", communityId).eq("claimer", me).maybeSingle();
  if (error) { console.error("fetchMyClaim failed", error); throw error; }
  return data ?? null;
}

export async function reportCommunity(id, reason) {
  const me = (await getClient().auth.getSession()).data?.session?.user?.id;
  if (!me) throw new Error("Sign in to report.");
  const { error } = await getClient()
    .from("community_report").insert({ community: id, reporter: me, reason });
  if (error && error.code !== "23505") { // 23505 = already reported, treat as success
    console.error("reportCommunity failed", error); throw error;
  }
}

export async function fetchMyCommunities() {
  const me = (await getClient().auth.getSession()).data?.session?.user?.id;
  if (!me) return [];
  const { data, error } = await getClient()
    .from("community").select("*").eq("owner", me).order("updated_at", { ascending: false });
  if (error) { console.error("fetchMyCommunities failed", error); throw error; }
  return data ?? [];
}
