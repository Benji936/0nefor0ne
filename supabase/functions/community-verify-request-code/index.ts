// community-verify-request-code: prove a self-created STORE is real by
// controlling a mailbox on the domain it says it trades from.
//
// Sibling of claim-request-code, and deliberately not a branch inside it. That
// one answers "is this stranger the store?" and reads a private address seeded
// with the store. This one answers "is the domain you gave me actually yours?"
// for somebody who already owns the row, so the address comes from the caller
// and the check is that it sits on the community's own website host.
//
// Mailbox control at a domain is the same bar GitHub and Google Workspace use.
// It is not proof of incorporation, and it is not meant to be.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM = "One for One <noreply@0nefor.one>";
const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// The host a URL is "really" at, for comparison purposes: lowercased, no port,
// and with a leading www. dropped so https://www.shop.fr and contact@shop.fr
// are treated as the same place. Everything below www is left intact, because
// shop.example.com and other.example.com are genuinely different sites.
function siteHost(website: string): string | null {
  try {
    const raw = website.trim();
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase();
}

// A mailbox counts when it is on the site's host, or on a subdomain of it
// (mail.shop.fr). Not the reverse: an address at example.com proves nothing
// about shop.example.com.
export function domainMatches(website: string, email: string): boolean {
  const host = siteHost(website);
  const domain = emailDomain(email);
  if (!host || !domain) return false;
  return domain === host || domain.endsWith(`.${host}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: "not_authenticated" }, 401);

    const { community_id, email } = await req.json();
    if (!community_id) return json({ error: "missing_community_id" }, 400);
    if (typeof email !== "string" || !email.trim()) return json({ error: "missing_email" }, 400);

    const { data: community } = await admin.from("community")
      .select("id, owner, kind, website, verified").eq("id", community_id).maybeSingle();
    if (!community) return json({ error: "not_found" }, 404);
    if (community.owner !== user.id) return json({ error: "not_owner" }, 403);
    if (community.verified) return json({ error: "already_verified" }, 409);
    if (community.kind !== "store") return json({ error: "wrong_kind" }, 400);
    if (!community.website) return json({ status: "needs_website" });

    const address = email.trim();
    if (!domainMatches(community.website, address)) {
      return json({ status: "domain_mismatch", host: siteHost(community.website) });
    }

    // Same resend window as the claim flow, so the two feel like one product.
    const { data: existing } = await admin.from("community_claim")
      .select("code_expires_at").eq("community", community_id).eq("claimer", user.id).maybeSingle();
    if (existing?.code_expires_at &&
        Date.now() < new Date(existing.code_expires_at).getTime() - (CODE_TTL_MS - RESEND_COOLDOWN_MS)) {
      return json({ status: "rate_limited" });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const { error: upErr } = await admin.from("community_claim").upsert({
      community: community_id,
      claimer: user.id,
      code_hash: await sha256(code),
      code_expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
      code_attempts: 0,
      origin: "self",
      proof_method: "domain_email",
      proof_email: address,
    }, { onConflict: "community,claimer" });
    if (upErr) return json({ error: "db_error", detail: upErr.message }, 500);

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: address,
        subject: "Your One for One verification code",
        text: `Your verification code is ${code}. It expires in 10 minutes.\n\n`
            + `Someone asked to verify a One for One listing using this address. `
            + `If that was not you, ignore this email and nothing happens.`,
      }),
    });
    if (!emailRes.ok) return json({ error: "email_failed", detail: await emailRes.text() }, 502);

    return json({ status: "sent" });
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
