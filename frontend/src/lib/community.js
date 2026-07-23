import { getClient } from "@/lib/supabaseClient";
import { slugify, withSuffix } from "@/lib/communitySlug";

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
    .select("id, kind, name, slug, city, country, region, avatar_url, remote_duel, verified, owner", { count: "exact" })
    .eq("status", "published");

  if (kind)               query = query.eq("kind", kind);
  if (country)            query = query.eq("country", country);
  if (region)             query = query.eq("region", region);
  if (remoteDuel === true) query = query.eq("remote_duel", true);
  if (q && q.trim())      query = query.ilike("name", `%${q.trim()}%`);

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
  const { data, error } = await getClient().from("community").insert(row).select().single();
  if (error) { console.error("createCommunity failed", error); throw error; }
  return data;
}

export async function updateCommunity(id, patch) {
  const clean = { ...patch, updated_at: new Date().toISOString() };
  if ("website" in clean)     clean.website = assertHttp(clean.website, "Website");
  if ("discord_url" in clean) clean.discord_url = assertHttp(clean.discord_url, "Discord link");
  const { data, error } = await getClient().from("community").update(clean).eq("id", id).select().single();
  if (error) { console.error("updateCommunity failed", error); throw error; }
  return data;
}

export async function claimCommunity(id) {
  const { data, error } = await getClient().rpc("claim_community", { p_community: id });
  if (error) { console.error("claimCommunity failed", error); throw error; }
  return Array.isArray(data) ? data[0] : data;
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
