import { describe, it, expect } from "vitest";
import { siteHost, emailDomain, domainMatches, proofRoute, verifyStep } from "./communityVerify";

describe("siteHost", () => {
  it("drops scheme, path and a leading www", () => {
    expect(siteHost("https://www.maboutique.fr/contact")).toBe("maboutique.fr");
  });
  it("accepts a bare host with no scheme", () => {
    expect(siteHost("maboutique.fr")).toBe("maboutique.fr");
  });
  it("keeps a meaningful subdomain", () => {
    expect(siteHost("https://shop.example.com")).toBe("shop.example.com");
  });
  it("returns null on junk rather than throwing", () => {
    expect(siteHost("not a url at all !!")).toBe(null);
    expect(siteHost("")).toBe(null);
    expect(siteHost(null)).toBe(null);
  });
});

describe("emailDomain", () => {
  it("reads the part after the last @", () => {
    expect(emailDomain("contact@maboutique.fr")).toBe("maboutique.fr");
  });
  it("lowercases and trims", () => {
    expect(emailDomain("  Contact@MaBoutique.FR ")).toBe("maboutique.fr");
  });
  it("rejects an address with no local part", () => {
    expect(emailDomain("@maboutique.fr")).toBe(null);
  });
  it("rejects a string with no @", () => {
    expect(emailDomain("maboutique.fr")).toBe(null);
  });
});

describe("domainMatches", () => {
  it("matches the site host exactly", () => {
    expect(domainMatches("https://maboutique.fr", "contact@maboutique.fr")).toBe(true);
  });
  it("ignores www on the site", () => {
    expect(domainMatches("https://www.maboutique.fr", "contact@maboutique.fr")).toBe(true);
  });
  it("accepts a subdomain of the site host", () => {
    expect(domainMatches("https://maboutique.fr", "info@mail.maboutique.fr")).toBe(true);
  });
  it("refuses a parent domain of the site host", () => {
    // An address at example.com proves nothing about shop.example.com.
    expect(domainMatches("https://shop.example.com", "me@example.com")).toBe(false);
  });
  it("refuses an unrelated domain", () => {
    expect(domainMatches("https://maboutique.fr", "me@gmail.com")).toBe(false);
  });
  it("refuses a domain that merely ends with the host string", () => {
    expect(domainMatches("https://boutique.fr", "me@notboutique.fr")).toBe(false);
  });
  it("is false when either side is missing", () => {
    expect(domainMatches("", "me@x.fr")).toBe(false);
    expect(domainMatches("https://x.fr", "")).toBe(false);
  });
});

describe("proofRoute", () => {
  it("sends a store with a website down the domain route", () => {
    expect(proofRoute({ kind: "store", website: "https://x.fr" })).toBe("domain");
  });
  it("stops a store that never filled in a website", () => {
    expect(proofRoute({ kind: "store", website: "" })).toBe("no-website");
  });
  it("sends a discord community to the guild routes", () => {
    expect(proofRoute({ kind: "discord" })).toBe("discord");
  });
  it("sends a group to review", () => {
    expect(proofRoute({ kind: "group" })).toBe("manual");
  });
  it("defaults an unknown kind to review rather than to a proof it cannot pass", () => {
    expect(proofRoute({ kind: "something-new" })).toBe("manual");
  });

  // The whole reason multi-kind cannot be a shortcut: a shop with a Discord
  // server must still prove the shop.
  it("makes a store prove the store even when it also runs a discord", () => {
    expect(proofRoute({ kinds: ["discord", "store"], website: "https://x.fr" })).toBe("domain");
    expect(proofRoute({ kinds: ["discord", "store"], website: "" })).toBe("no-website");
  });

  it("sends a group that also runs a discord to review", () => {
    expect(proofRoute({ kinds: ["discord", "group"] })).toBe("manual");
  });

  it("keeps the discord route when discord is the only claim", () => {
    expect(proofRoute({ kinds: ["discord"] })).toBe("discord");
  });
});

describe("verifyStep", () => {
  const community = { id: 1, kind: "store", website: "https://x.fr", owner: "me", verified: false };

  it("waits while the community is still loading", () => {
    expect(verifyStep({ community: null, viewerId: "me" }).step).toBe("loading");
  });
  it("asks a signed-out visitor to sign in", () => {
    expect(verifyStep({ community, viewerId: null }).step).toBe("signed-out");
  });
  it("refuses somebody else's community", () => {
    expect(verifyStep({ community, viewerId: "someone-else" }).step).toBe("not-owner");
  });
  it("starts at proof, routed by kind", () => {
    const r = verifyStep({ community, viewerId: "me" });
    expect(r.step).toBe("prove");
    expect(r.proof).toBe("domain");
  });
  it("moves to payment once identity is proved", () => {
    const claim = { identity_verified_at: "2026-08-06T10:00:00Z" };
    expect(verifyStep({ community, claim, viewerId: "me" }).step).toBe("pay");
  });
  it("shows the webhook gap instead of asking for the card twice", () => {
    const claim = { identity_verified_at: "2026-08-06T10:00:00Z" };
    expect(verifyStep({ community, claim, viewerId: "me", justPaid: true }).step).toBe("processing");
  });
  it("is done once verified and subscribed", () => {
    const claim = { identity_verified_at: "x", subscription_status: "active" };
    const verified = { ...community, verified: true };
    expect(verifyStep({ community: verified, claim, viewerId: "me" }).step).toBe("done");
  });
  it("treats a trial as done, because the first year is the trial", () => {
    const claim = { identity_verified_at: "x", subscription_status: "trialing" };
    const verified = { ...community, verified: true };
    expect(verifyStep({ community: verified, claim, viewerId: "me" }).step).toBe("done");
  });
  it("names a lapsed subscription rather than sending them back to proof", () => {
    const claim = { identity_verified_at: "x", subscription_status: "canceled" };
    expect(verifyStep({ community, claim, viewerId: "me" }).step).toBe("lapsed");
  });
  it("keeps past_due separate from canceled, because Stripe is still trying", () => {
    const claim = { identity_verified_at: "x", subscription_status: "past_due" };
    expect(verifyStep({ community, claim, viewerId: "me" }).step).toBe("past-due");
  });
  it("waits on review once evidence is in", () => {
    const group = { ...community, kind: "group" };
    const claim = { manual_review_at: "2026-08-06T10:00:00Z" };
    expect(verifyStep({ community: group, claim, viewerId: "me" }).step).toBe("pending-review");
  });
  it("prefers proven identity over a pending review, so an approved group can pay", () => {
    const group = { ...community, kind: "group" };
    const claim = { manual_review_at: "x", identity_verified_at: "y" };
    expect(verifyStep({ community: group, claim, viewerId: "me" }).step).toBe("pay");
  });

  // A decision that never reaches the owner is the same as no decision.
  it("shows a decline once a reviewer has answered", () => {
    const group = { ...community, kind: "group" };
    const claim = { manual_review_at: "x", reviewed_at: "y", review_note: "No sign of a group." };
    const state = verifyStep({ community: group, claim, viewerId: "me" });
    expect(state.step).toBe("declined");
    expect(state.note).toBe("No sign of a group.");
  });

  it("carries a declined state with no note rather than hiding it", () => {
    const group = { ...community, kind: "group" };
    const claim = { manual_review_at: "x", reviewed_at: "y" };
    const state = verifyStep({ community: group, claim, viewerId: "me" });
    expect(state.step).toBe("declined");
    expect(state.note).toBe(null);
  });

  // Approving stamps both, and the owner should land on checkout, not on a
  // refusal: identity_verified_at is checked first for exactly this reason.
  it("sends an approved review to payment, not to the declined state", () => {
    const group = { ...community, kind: "group" };
    const claim = { manual_review_at: "x", reviewed_at: "y", identity_verified_at: "z" };
    expect(verifyStep({ community: group, claim, viewerId: "me" }).step).toBe("pay");
  });
});

// ── Paid through Discord ──────────────────────────────────────────────────────
// A Guild Subscription bought for the bot verifies the same community. These
// are the cases that would otherwise ask somebody to pay twice.

describe("a community covered by a Discord Guild Subscription", () => {
  const community = { id: 1, owner: "me", verified: true, kind: "discord", kinds: ["discord"] };
  const covered = {
    identity_verified_at: "2026-08-01T00:00:00Z",
    discord_entitlement_at: "2026-08-09T00:00:00Z",
  };

  it("is done, and says the subscription came from Discord", () => {
    const s = verifyStep({ community, claim: covered, viewerId: "me" });
    expect(s.step).toBe("done");
    expect(s.via).toBe("discord");
  });

  it("is not lapsed just because an old Stripe row says canceled", () => {
    // This is One for One exactly: a cancelled Stripe subscription and a live
    // Discord entitlement. Reading Stripe first showed "your subscription
    // ended" to somebody who is paying right now.
    const s = verifyStep({
      community,
      claim: { ...covered, subscription_status: "canceled" },
      viewerId: "me",
    });
    expect(s.step).toBe("done");
    expect(s.via).toBe("discord");
  });

  it("is not past-due either", () => {
    const s = verifyStep({
      community,
      claim: { ...covered, subscription_status: "past_due" },
      viewerId: "me",
    });
    expect(s.step).toBe("done");
  });

  it("still says stripe when that is what is paying", () => {
    const s = verifyStep({
      community,
      claim: { identity_verified_at: "2026-08-01T00:00:00Z", subscription_status: "active" },
      viewerId: "me",
    });
    expect(s.step).toBe("done");
    expect(s.via).toBe("stripe");
  });

  it("does not skip proving: an entitlement without identity still asks for proof", () => {
    const s = verifyStep({
      community: { ...community, verified: false },
      claim: { discord_entitlement_at: "2026-08-09T00:00:00Z" },
      viewerId: "me",
    });
    expect(s.step).toBe("prove");
  });

  it("goes back to lapsed once the entitlement ends", () => {
    const s = verifyStep({
      community: { ...community, verified: false },
      claim: {
        identity_verified_at: "2026-08-01T00:00:00Z",
        subscription_status: "canceled",
        discord_entitlement_at: null,
      },
      viewerId: "me",
    });
    expect(s.step).toBe("lapsed");
  });
});
