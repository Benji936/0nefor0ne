// Self-verification: the owner of a community they created proves it is real.
//
// The flow leaves the origin twice, to Discord and to Stripe, so nothing about
// where the owner stands may live in component state. `verifyStep` below is the
// single answer to "what do I render", derived entirely from server data, which
// is what makes a cold load of the URL resume correctly.
import { getClient } from "@/lib/supabaseClient";
import { strictestKind } from "@/lib/communityKinds";

// ── Domain matching ─────────────────────────────────────────────────────────
// Mirrored from community-verify-request-code so the owner finds out their
// address is on the wrong domain while they are still typing, rather than after
// a round trip. The server does this check again and is the one that counts;
// this copy is a courtesy and must never be the only gate.

/** The host a site is really at: lowercased, no scheme, no leading www. */
export function siteHost(website) {
  try {
    const raw = String(website ?? "").trim();
    if (!raw) return null;
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export function emailDomain(email) {
  const at = String(email ?? "").lastIndexOf("@");
  if (at < 1) return null;
  const domain = String(email).slice(at + 1).trim().toLowerCase();
  return domain || null;
}

/**
 * True when the address sits on the site's host or a subdomain of it.
 * Not the reverse: an address at example.com says nothing about shop.example.com.
 */
export function domainMatches(website, email) {
  const host = siteHost(website);
  const domain = emailDomain(email);
  if (!host || !domain) return false;
  return domain === host || domain.endsWith(`.${host}`);
}

// ── Step resolution ─────────────────────────────────────────────────────────

const LIVE_SUBSCRIPTION = new Set(["trialing", "active"]);

/**
 * Where the owner stands, from server state alone.
 *
 * `justPaid` is the one piece of local knowledge allowed in, and only to name a
 * gap we cannot otherwise see: Stripe redirects back the instant Checkout
 * completes, but the subscription is not real until the webhook lands a second
 * or two later. Without it the owner would return to the page that just took
 * their card and be asked for it again.
 *
 * @returns {{ step: string, proof?: string }}
 */
export function verifyStep({ community, claim, viewerId, justPaid = false } = {}) {
  if (!community) return { step: "loading" };
  if (!viewerId) return { step: "signed-out" };
  if (community.owner !== viewerId) return { step: "not-owner" };

  const subscribed = LIVE_SUBSCRIPTION.has(claim?.subscription_status);
  if (community.verified && subscribed) return { step: "done" };

  // Verified but the subscription is gone: they built this, so they still own
  // it, and the way back is the same flow rather than a support ticket.
  if (claim?.subscription_status === "canceled" || claim?.subscription_status === "unpaid") {
    return { step: "lapsed" };
  }
  if (claim?.subscription_status === "past_due") return { step: "past-due" };

  if (claim?.identity_verified_at) {
    if (justPaid || community.verified) return { step: "processing" };
    return { step: "pay" };
  }

  if (claim?.manual_review_at) return { step: "pending-review" };

  return { step: "prove", proof: proofRoute(community) };
}

/**
 * Which proof a community can offer, decided by what it is rather than asked as
 * a question. The owner already knows whether they run a shop or a server;
 * making them pick a verification method is making them do routing.
 */
export function proofRoute(community) {
  // A community can be several kinds at once, and the proof follows the
  // hardest one it claims. Otherwise a shop tags itself "discord", proves a
  // server it made this morning, and wears a verified badge in front of
  // people who came to buy cards from a shop.
  const strictest = strictestKind(community);
  if (strictest === "store") {
    return siteHost(community.website) ? "domain" : "no-website";
  }
  if (strictest === "discord") {
    return "discord";
  }
  return "manual"; // groups, and anything a later kind adds, get read by a person
}

// ── Server calls ────────────────────────────────────────────────────────────

/** The caller's own claim row, with every field the verify page reads. */
export async function fetchVerifyClaim(communityId) {
  const me = (await getClient().auth.getSession()).data?.session?.user?.id;
  if (!me || !communityId) return null;
  const { data, error } = await getClient()
    .from("community_claim")
    .select(
      "identity_verified_at, subscription_status, current_period_end, manual_review_at, " +
      "origin, proof_method, proof_email, discord_guild_id, code_expires_at",
    )
    .eq("community", communityId).eq("claimer", me).maybeSingle();
  if (error) { console.error("fetchVerifyClaim failed", error); return null; }
  return data ?? null;
}

async function invoke(name, body) {
  const { data, error } = await getClient().functions.invoke(name, { body });
  if (error) { console.error(`${name} failed`, error); throw error; }
  return data;
}

/** Send a 6-digit code to an address on the store's own domain. */
export function requestDomainCode(communityId, email) {
  return invoke("community-verify-request-code", { community_id: communityId, email });
}

/**
 * Check the caller manages the guild the community's invite points at.
 * The provider token comes from the Discord sign-in and is only present on the
 * session immediately after that redirect, never after a refresh.
 */
export function verifyDiscordGuild(communityId, providerToken) {
  return invoke("community-verify-discord", {
    community_id: communityId,
    provider_token: providerToken,
  });
}

/** One-time code for the /verify slash command. */
export function issueBotToken(communityId) {
  return invoke("community-verify-bot-token", { community_id: communityId });
}

/** Groups: evidence for a person to read. */
export function submitForReview(communityId, reason) {
  return invoke("community-verify-manual", { community_id: communityId, reason });
}
