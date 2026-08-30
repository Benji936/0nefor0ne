import { getClient } from "@/lib/supabaseClient";
import { slugify, withSuffix } from "@/lib/communitySlug";
import { sanitizeLinks } from "@/lib/communityLinks";
import { normalizeKinds } from "@/lib/communityKinds";
import { normalizeInterval } from "@/lib/communityPricing";
import { codeForCountry, countryByCode, canonicalCountry, resolveCountry } from "@/lib/countries";
import { boundingBox, distanceKm } from "@/lib/near";
import { geocodePlace } from "@/lib/geocode";
import { invokeFunction } from "@/lib/edgeFunction";

const PAGE_SIZE = 24;

// Thrown by createCommunity and matched by the form so it can show the message
// in the reader's language and link to the community they already have. A code
// rather than a sentence, because this string is not the copy.
export const ALREADY_OWN_ONE = "already_own_one";

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

/**
 * Where a community actually is, resolved once, at write time.
 *
 * Near me is the whole reason a community pays to be verified, and it reads
 * lat/lng — a column no form ever wrote. Every community anybody created
 * themselves was therefore invisible to it, permanently and silently, while the
 * seeded directory rows had coordinates from the importer and looked fine.
 *
 * This is the one place that fixes it, rather than each form remembering to,
 * because a community's location is written from three places already (create,
 * the profile's inline editor, and anything added later) and a pin that only
 * some of them set is the same bug with a longer fuse.
 *
 * Rules, in order:
 *  - lat/lng handed in win: the caller picked a real suggestion and we already
 *    have the geocoder's own answer. No second lookup.
 *  - No city means no pin. A country on its own would resolve to its centroid,
 *    which is not where the shop is; it would put a store in Kuala Lumpur "12km
 *    away" from somebody in Penang. Null is honest, a centroid is not.
 *  - The geocoder's country wins over a blank one, mapped back through our own
 *    list so the value still matches what the directory filter compares against
 *    ("Indonesia", not "Republic of Indonesia").
 *
 * Never throws. A dead or slow geocoder must not stop somebody saving their own
 * profile; it costs them the pin, which the next save resolves.
 */
export async function resolveLocation({ city, country, lat, lng } = {}) {
  const known = Number.isFinite(lat) && Number.isFinite(lng);
  const cityText = String(city ?? "").trim();
  // Spelled the way the directory filter spells it, or left exactly as written
  // when it is not a country we know. Somewhere unrecognised keeps its name;
  // it is a gap in our list, not the owner getting it wrong.
  const countryText = canonicalCountry(country)?.name ?? String(country ?? "").trim();
  const noPin = { country: countryText || null, country_code: codeForCountry(countryText) };

  if (known) return { lat, lng, ...noPin };
  if (!cityText) return { lat: null, lng: null, ...noPin };

  let place = null;
  try {
    place = await geocodePlace([cityText, countryText].filter(Boolean).join(", "), {
      featureType: "settlement",
    });
  } catch (e) {
    console.error("resolveLocation failed", e);
  }
  if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lon)) {
    return { lat: null, lng: null, ...noPin };
  }

  // Only fill a country in, never overwrite one: the owner picked theirs from a
  // list, and a geocoder that resolved the wrong Springfield should not get to
  // move their listing to another country's filter.
  const resolved = countryText ? null : countryByCode(place.countryCode);
  return {
    lat: place.lat,
    lng: place.lon,
    country: countryText || resolved?.name || null,
    country_code: codeForCountry(countryText) || resolved?.code || null,
  };
}

/**
 * The finder's filter, as a PostgREST `or()` expression.
 *
 * A directory of places is searched by place. The box ran on `name` alone, so a
 * reader typing their own town got nothing back — a town is not a shop name —
 * and the only way to narrow by where was a 44-entry country dropdown beside
 * it. It now runs on the three things a row is findable by: what it is called,
 * what town it is in, and what country.
 *
 * Returns "" for an empty query, which the caller reads as "no filter".
 */
export function placeSearchFilter(q, locale) {
  const text = String(q ?? "").trim();
  if (!text) return "";

  // Escape LIKE metacharacters so a literal % or _ in the search text is
  // matched literally rather than treated as a wildcard.
  const like = `%${text.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
  // PostgREST parses the or() list itself, splitting on commas and parentheses,
  // so "Cards, Games & More" typed into the box would tear the filter in half
  // and 400 the request. Double-quoting hands the whole string over as one
  // literal; the backslash pass is what stops a typed quote closing it early.
  const lit = (v) => `"${String(v).replace(/["\\]/g, (m) => "\\" + m)}"`;

  const parts = [
    `name.ilike.${lit(like)}`,
    `city.ilike.${lit(like)}`,
    `country.ilike.${lit(like)}`,
  ];

  // Countries people write one way and the directory files another: Czechia, the
  // long form of the USA — and, for a reader who is not reading in English,
  // their own country's name in their own language. Resolved through the same
  // list every write side uses (see resolveCountry), so the finder and the
  // stored rows agree on what a country is called. Skipped when the substring
  // match above would already have found it, to keep the filter short.
  const canon = resolveCountry(text, locale);
  if (canon && !canon.name.toLowerCase().includes(text.toLowerCase())) {
    parts.push(`country.eq.${lit(canon.name)}`);
  }
  return parts.join(",");
}

export async function fetchDirectory({ kind, country, region, remoteDuel, q, locale, page = 0, pageSize = PAGE_SIZE } = {}) {
  let query = getClient()
    .from("community")
    .select("id, kind, kinds, name, slug, city, country, region, avatar_url, banner_url, remote_duel, verified, owner, follower_count", { count: "exact" })
    .eq("status", "published");

  // "Is store among your kinds", not "is store your kind": a shop that also
  // runs a Discord belongs under both filters, which is the point of kinds.
  if (kind)               query = query.contains("kinds", [kind]);
  if (country)            query = query.eq("country", country);
  if (region)             query = query.eq("region", region);
  if (remoteDuel === true) query = query.eq("remote_duel", true);
  const search = placeSearchFilter(q, locale);
  if (search) query = query.or(search);

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

  // One per account. The unique index is what actually enforces this; the check
  // is here so the form can say so before asking for a name, a city and a logo.
  const { count } = await getClient()
    .from("community").select("id", { count: "exact", head: true }).eq("owner", me);
  if ((count ?? 0) > 0) throw new Error(ALREADY_OWN_ONE);

  const slug = await uniqueSlug(input.name, input.city);
  // Before the insert, not after: a community with no pin is invisible to near
  // me, and there is no later moment that would come back to fix it.
  const place = await resolveLocation(input);
  const row = {
    owner: me,
    // kinds only: the database derives kind from it, and sending both invites
    // the two to disagree.
    kinds: normalizeKinds(input.kinds ?? [input.kind]),
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
    country: place.country,
    // Derived rather than asked for. The form stores a country NAME because
    // that is what the directory filter matches on, and country_code was only
    // ever populated by the store seeder, so every community anyone created
    // themselves had none and was priced in the USD fallback no matter where
    // it was. An explicit country_code still wins, for the seeder.
    country_code: input.country_code ?? place.country_code,
    lat: place.lat,
    lng: place.lng,
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
  if ("kinds" in clean)       clean.kinds = normalizeKinds(clean.kinds);
  if ("website" in clean)     clean.website = assertHttp(clean.website, "Website");
  if ("discord_url" in clean) clean.discord_url = assertHttp(clean.discord_url, "Discord link");
  if ("links" in clean)       clean.links = sanitizeLinks(clean.links);
  // Keep the code with the name it came from, including when the name is
  // cleared. A stale code would price a community by a country it left.
  if ("country" in clean && !("country_code" in clean)) clean.country_code = codeForCountry(clean.country);

  // Re-pin whenever the address is part of the write. Callers that already know
  // the coordinates (unchanged city, or a picked suggestion) pass lat/lng and
  // resolveLocation hands them straight back, so an ordinary save of a bio or a
  // link costs no geocoder call. The corollary is the useful half: a community
  // saved with a city and no pin — every one created before this existed — gets
  // one the next time its owner touches the profile.
  if ("city" in clean) {
    const place = await resolveLocation(clean);
    clean.lat = place.lat;
    clean.lng = place.lng;
    clean.country = place.country;
    clean.country_code = place.country_code;
  }
  const { data, error } = await getClient().from("community").update(clean).eq("id", id).select().single();
  if (error) { console.error("updateCommunity failed", error); throw error; }
  return data;
}

// Claiming is now a verified flow (Plan 1): request a code emailed to the store's
// on-file address, then verify it. Ownership is granted server-side by the
// claim-verify-code Edge Function; there is no more instant free claim RPC.
export function requestClaimCode(communityId) {
  return invokeFunction("claim-request-code", { community_id: communityId });
}

export function verifyClaimCode(communityId, code) {
  return invokeFunction("claim-verify-code", { community_id: communityId, code });
}

// Fallback when the store has no email on file. Goes through the Edge Function
// rather than writing the claim row directly: the client may write
// manual_review_reason but not manual_review_at, so the old direct write left
// the request with no timestamp and therefore out of the review queue entirely.
export function requestManualReview(communityId, reason) {
  return invokeFunction("community-verify-manual", { community_id: communityId, reason });
}

// Start the paid claim: the claim-create-checkout Edge Function returns a Stripe
// Checkout URL (subscription mode, free trial, local currency). The caller
// redirects the browser to it. Requires identity_verified_at server-side.
// `interval` is 'year' or 'month'; normalizeInterval keeps a stray value from
// reaching the server, which rejects anything it does not recognise.
export function startClaimCheckout(communityId, interval = "year") {
  // { url }, or { error } with the code the function chose: already_own_one,
  // interval_unavailable, not_verified.
  return invokeFunction("claim-create-checkout", {
    community_id: communityId,
    interval: normalizeInterval(interval),
  });
}

// Open the Stripe Customer Portal for an owned community so the owner can update
// the card or download invoices. Returns a portal URL to redirect to.
//
// `locale` decides where Stripe sends them back to. It used to be hardcoded to
// /en on the server, so a French owner left a French page, paid attention to a
// French flow, and landed on the English one.
export function openBillingPortal(communityId, locale = "en") {
  return invokeFunction("claim-portal", { community_id: communityId, locale }); // { url } or { error }
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

// Which way out a community has. A row you created leaves with you; a seeded
// directory entry you claimed is handed back and stays in the directory. The
// server decides this too, from the same column, and refuses a mismatch: this
// is here so the UI can say the right sentence, not so it can pick.
export function giveUpMode(community, viewerId) {
  if (!community || !viewerId || community.owner !== viewerId) return null;
  return community.created_by === viewerId ? "delete" : "release";
}

export function releaseCommunity(communityId, intent) {
  return invokeFunction("community-release", { community_id: communityId, intent }); // { ok, mode } or { error }
}

/**
 * How each of my communities is being paid for, and where that stands, keyed by
 * community id.
 *
 * Started as two booleans answering one question: whether to show the Stripe
 * portal button, which is dead for somebody verified by a Discord Guild
 * Subscription because there is no Stripe customer behind it. It now carries
 * the mirrored subscription state as well, so the account page can describe a
 * plan instead of just linking to it. Same single read either way.
 *
 * Every field past the two booleans is written only by stripe-webhook and
 * frozen against client writes by community_claim_guard(), so what comes back
 * here is what Stripe last said rather than anything a claimer could set.
 *
 * Feed the result to billingState() in lib/communityBilling.js rather than
 * reading `subscription_status` directly: status alone cannot tell a renewing
 * subscription from a cancelling one.
 *
 * @returns {Promise<object|null>} the map, or **null** if the read failed. The
 *   caller must tell those apart: `{}` means no claims exist, null means we do
 *   not know, and saying "no subscription" for the second is a lie about money.
 */
export async function fetchMyClaimSources() {
  const me = (await getClient().auth.getSession()).data?.session?.user?.id;
  if (!me) return {};
  const { data, error } = await getClient()
    .from("community_claim")
    .select(
      "community, stripe_subscription_id, stripe_customer_id, discord_entitlement_at, " +
      "subscription_status, current_period_end, billing_interval, cancel_at_period_end, " +
      "discord_guild_id"
    )
    .eq("claimer", me);
  // null, NOT {}. An empty map is a real answer - "you own communities and none
  // of them has a claim row" - and the billing panel renders it as the sentence
  // "No subscription." Returning it on failure made a dropped query state a
  // fact about somebody's money: an owner paying through Discord was told they
  // had no subscription, directly under their own verified badge. A read that
  // did not happen has to be distinguishable from one that came back empty.
  if (error) { console.error("fetchMyClaimSources failed", error); return null; }
  const out = {};
  for (const row of data ?? []) {
    out[row.community] = {
      // `stripe` means "has ever subscribed", NOT "is paying". The id is never
      // cleared on cancellation, so only subscription_status can answer the
      // second question - which is why billingState() exists rather than
      // callers reading these fields directly.
      stripe: !!row.stripe_subscription_id,
      // The portal opens against a CUSTOMER, not a subscription. Separate flag
      // because the two columns can disagree - an abandoned checkout leaves a
      // customer with no subscription - and gating the button on the wrong one
      // is how you ship a button that 409s.
      customer: !!row.stripe_customer_id,
      discord: !!row.discord_entitlement_at,
      discord_entitlement_at: row.discord_entitlement_at ?? null,
      discord_guild_id: row.discord_guild_id ?? null,
      subscription_status: row.subscription_status ?? null,
      current_period_end: row.current_period_end ?? null,
      billing_interval: row.billing_interval ?? null,
      cancel_at_period_end: row.cancel_at_period_end === true,
    };
  }
  return out;
}

/**
 * Schedule a community subscription to end when the paid period does, or undo
 * that while it is still pending.
 *
 * The claim row is not written here or by the function behind it. Stripe is
 * asked to flip the flag, Stripe emits customer.subscription.updated, and
 * stripe-webhook mirrors it - the same path every other billing fact takes.
 * The echoed values below are for settling the UI before that round trip lands.
 *
 * @param {number} communityId
 * @param {'cancel'|'reactivate'} action
 * @returns {Promise<object>} { ok, cancel_at_period_end, current_period_end }
 *   or { error } with: not_owner, no_subscription, bad_action, not_found.
 */
export function setSubscriptionCancellation(communityId, action) {
  return invokeFunction("claim-cancel", { community_id: communityId, action });
}

export async function fetchMyCommunities() {
  const me = (await getClient().auth.getSession()).data?.session?.user?.id;
  if (!me) return [];
  const { data, error } = await getClient()
    .from("community").select("*").eq("owner", me).order("updated_at", { ascending: false });
  if (error) { console.error("fetchMyCommunities failed", error); throw error; }
  return data ?? [];
}

/** The signed-in trader's own country code, or null. Used as the pricing
 *  fallback for a community that has no country of its own: the buyer's
 *  location is a better guess than the USD default, and it is the only one
 *  available when the community's field was left blank. */
export async function fetchMyCountryCode() {
  const me = (await getClient().auth.getSession()).data?.session?.user?.id;
  if (!me) return null;
  const { data, error } = await getClient()
    .from("Trader").select("country_code").eq("id", me).maybeSingle();
  if (error) { console.error("fetchMyCountryCode failed", error); return null; }
  return data?.country_code ?? null;
}

/**
 * The other places within reach of this one.
 *
 * A store page was a dead end: 4,451 of them, each linking out to Google Maps
 * and to nothing inside the app. This is the answer to the question a reader
 * actually has next — this one is shut on Mondays, what else is around — and
 * it is what connects the directory's pages to each other instead of leaving
 * every one of them a leaf.
 *
 * Deliberately not one of the near_me database functions: communities_near
 * returns only verified rows and unclaimed_near only unowned ones, and this
 * wants both, ranked by distance. A bounding box narrows it in SQL, then
 * distanceKm sorts what comes back — which is a few dozen rows in a city and a
 * handful anywhere else. Returns [] on failure: a rail at the foot of the page
 * must not be able to take the address at the top of it down with it.
 */
export async function fetchNearbyPlaces(community, { km = 40, limit = 6 } = {}) {
  const box = boundingBox({ lat: community?.lat, lng: community?.lng }, km);
  if (!box) return [];
  let query = getClient()
    .from("community")
    .select("id, name, slug, kind, kinds, city, country, lat, lng, verified, avatar_url")
    .eq("status", "published")
    .neq("id", community.id)
    .gte("lat", box.minLat)
    .lte("lat", box.maxLat)
    // A city block can hold a dozen shops and a capital a hundred; 120 is well
    // past what the six slots below need, and caps a query over a box that is
    // 80 km on a side in a dense country.
    .limit(120);
  if (box.minLng != null) query = query.gte("lng", box.minLng).lte("lng", box.maxLng);

  const { data, error } = await query;
  if (error) { console.error("fetchNearbyPlaces failed", error); return []; }

  const here = { lat: community.lat, lng: community.lng };
  return (data ?? [])
    .map((row) => ({ ...row, km: distanceKm(here, row) }))
    .filter((row) => Number.isFinite(row.km) && row.km <= km)
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
}
