-- Paying Discord for the bot verifies the community, and vice versa.
--
-- Two ways to pay for the same thing: a Stripe subscription taken on the
-- website, or a Guild Subscription bought inside Discord for the bot. Somebody
-- who has paid once should not be asked to pay again through the other door.
--
-- Which means `community.verified` stops being a flag one system owns and
-- becomes a fact derived from both. It has to: if the bot wrote `verified`
-- directly, an ending Discord entitlement would strip verification from someone
-- paying by card, and a Stripe cancellation would strip it from someone paying
-- Discord. Each source records only its own state, and one function combines
-- them.
--
-- Ownership is deliberately NOT part of this. A Stripe subscription can grant
-- and take back ownership of a claimed shop, because that is what it was
-- granted by. A Discord entitlement only ever moves the badge.

ALTER TABLE community_claim
  ADD COLUMN IF NOT EXISTS discord_entitlement_at timestamptz;

COMMENT ON COLUMN community_claim.discord_entitlement_at IS
  'When the linked guild was last seen holding an active Guild Subscription. NULL means none. Written only by the bot, via service_role.';

-- Extend the column guard. This is billing state, so a hand-written PostgREST
-- call setting it would be a free subscription.
--
-- The whole body is restated because CREATE OR REPLACE takes the whole body.
-- It was checked against pg_proc.prosrc first: an earlier draft of this
-- migration silently dropped the reviewed_at / reviewed_by / review_note
-- freezes added in 20260807, which would have let a client approve its own
-- manual review.
CREATE OR REPLACE FUNCTION community_claim_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', 'service_role');
BEGIN
  IF v_role = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.identity_verified_at    := NULL;
    NEW.code_hash               := NULL;
    NEW.code_expires_at         := NULL;
    NEW.code_attempts           := 0;
    NEW.manual_review_at        := NULL;
    NEW.stripe_customer_id      := NULL;
    NEW.stripe_subscription_id  := NULL;
    NEW.subscription_status     := NULL;
    NEW.current_period_end      := NULL;
    NEW.origin                  := 'claim';
    NEW.proof_method            := NULL;
    NEW.proof_email             := NULL;
    NEW.discord_guild_id        := NULL;
    NEW.link_token_hash         := NULL;
    NEW.link_token_expires_at   := NULL;
    NEW.billing_interval        := NULL;
    NEW.reviewed_at             := NULL;
    NEW.reviewed_by             := NULL;
    NEW.review_note             := NULL;
    NEW.discord_entitlement_at  := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.community               := OLD.community;
    NEW.claimer                 := OLD.claimer;
    NEW.identity_verified_at    := OLD.identity_verified_at;
    NEW.code_hash               := OLD.code_hash;
    NEW.code_expires_at         := OLD.code_expires_at;
    NEW.code_attempts           := OLD.code_attempts;
    NEW.manual_review_at        := OLD.manual_review_at;
    NEW.stripe_customer_id      := OLD.stripe_customer_id;
    NEW.stripe_subscription_id  := OLD.stripe_subscription_id;
    NEW.subscription_status     := OLD.subscription_status;
    NEW.current_period_end      := OLD.current_period_end;
    NEW.origin                  := OLD.origin;
    NEW.proof_method            := OLD.proof_method;
    NEW.proof_email             := OLD.proof_email;
    NEW.discord_guild_id        := OLD.discord_guild_id;
    NEW.link_token_hash         := OLD.link_token_hash;
    NEW.link_token_expires_at   := OLD.link_token_expires_at;
    NEW.billing_interval        := OLD.billing_interval;
    NEW.reviewed_at             := OLD.reviewed_at;
    NEW.reviewed_by             := OLD.reviewed_by;
    NEW.review_note             := OLD.review_note;
    NEW.discord_entitlement_at  := OLD.discord_entitlement_at;
  END IF;
  RETURN NEW;
END;
$$;

-- The one place that decides whether a community is verified.
--
-- Both writers call this as their last step rather than setting the flag
-- themselves. Explicit rather than a trigger, because the Stripe webhook writes
-- the claim before it grants ownership, and a trigger firing mid-sequence would
-- compute `false` from a half-applied state.
--
-- claimer = owner is the correctness rule: community_claim is unique on
-- (community, claimer), so a shop that was claimed, released and claimed again
-- holds a row per claimer, and only the current owner's payment counts.
CREATE OR REPLACE FUNCTION recompute_community_verified(p_community bigint)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_verified boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM community_claim cc
    JOIN community c ON c.id = cc.community
    WHERE cc.community = p_community
      AND cc.claimer = c.owner
      -- Paying does not skip proving. Both doors still lead through identity.
      AND cc.identity_verified_at IS NOT NULL
      AND (
        cc.subscription_status IN ('trialing', 'active')
        OR cc.discord_entitlement_at IS NOT NULL
      )
  ) INTO v_verified;

  UPDATE community
     SET verified = v_verified, updated_at = now()
   WHERE id = p_community
     AND verified IS DISTINCT FROM v_verified;

  RETURN v_verified;
END;
$$;

REVOKE ALL ON FUNCTION recompute_community_verified(bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION recompute_community_verified(bigint) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION recompute_community_verified(bigint) TO service_role;

-- Which community a guild's entitlement should verify, if any.
--
-- The bot holds entitlements per guild and knows nothing about communities, so
-- this answers the whole question in one call: is this guild linked, is the
-- linker still the owner, have they proved identity, and is the Discord account
-- that owns the guild the same account that owns the community?
--
-- That last check is the point. Manage Server is enough to link a server; it is
-- not enough to spend the server owner's subscription on your own listing.
CREATE OR REPLACE FUNCTION discord_entitlement_target(p_guild_id text)
RETURNS TABLE (community_id bigint, owner_discord_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, t.discord_id
  FROM community_claim cc
  JOIN community c ON c.id = cc.community AND c.owner = cc.claimer
  LEFT JOIN "Trader" t ON t.id = c.owner
  WHERE cc.discord_guild_id = p_guild_id
    AND cc.identity_verified_at IS NOT NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION discord_entitlement_target(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION discord_entitlement_target(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION discord_entitlement_target(text) TO service_role;

-- Bring every existing community in line with the rule that now defines it.
-- Nothing should move: no claim has an entitlement yet, so this only proves the
-- function agrees with what Stripe already wrote.
SELECT recompute_community_verified(id) FROM community WHERE owner IS NOT NULL;

NOTIFY pgrst, 'reload schema';
