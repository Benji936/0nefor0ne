-- Self-verification: let the owner of a community they created themselves prove
-- it is real and turn on the community's features.
--
-- Until now `community_claim` described one situation: a stranger claiming a
-- seeded store they did not own. This adds the second: the owner is already the
-- owner, and what they are proving is that the place exists. Both converge on
-- identity_verified_at, then the same Stripe subscription.
--
-- `origin` is the column that keeps the two apart, and it exists for one
-- specific reason. When a subscription is canceled the webhook reverts the
-- community to unclaimed by setting owner = NULL. That is right for a claimed
-- store: ownership was granted by the subscription, so it goes back. It is
-- wrong for a community somebody created, where a failed card in year two would
-- silently delete their ownership of a place they made. origin = 'self' means
-- "keep the owner, drop the badge."
--
-- Existing rows are all claims, which is what the default encodes.

ALTER TABLE community_claim
  ADD COLUMN IF NOT EXISTS origin                 text NOT NULL DEFAULT 'claim',
  ADD COLUMN IF NOT EXISTS proof_method           text,
  ADD COLUMN IF NOT EXISTS proof_email            text,
  ADD COLUMN IF NOT EXISTS discord_guild_id       text,
  ADD COLUMN IF NOT EXISTS link_token_hash        text,
  ADD COLUMN IF NOT EXISTS link_token_expires_at  timestamptz;

DO $$
BEGIN
  ALTER TABLE community_claim
    ADD CONSTRAINT community_claim_origin_check CHECK (origin IN ('claim', 'self'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE community_claim
    ADD CONSTRAINT community_claim_proof_method_check CHECK (
      proof_method IS NULL OR proof_method IN
        ('store_email', 'domain_email', 'discord_bot', 'discord_oauth', 'manual')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Extend the column guard (Plan 1, widened in Plan 2) over the new columns.
-- Everything here is proof state, so a hand-written PostgREST call setting any
-- of it would be self-verification. Note `origin` in particular: a client that
-- could write origin = 'self' could keep ownership of a store it claimed and
-- then stopped paying for. The one client-writable field is still
-- manual_review_reason.
CREATE OR REPLACE FUNCTION community_claim_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', 'service_role');
BEGIN
  IF v_role = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.identity_verified_at   := NULL;
    NEW.code_hash              := NULL;
    NEW.code_expires_at        := NULL;
    NEW.code_attempts          := 0;
    NEW.manual_review_at       := NULL;
    NEW.stripe_customer_id     := NULL;
    NEW.stripe_subscription_id := NULL;
    NEW.subscription_status    := NULL;
    NEW.current_period_end     := NULL;
    NEW.origin                 := 'claim';
    NEW.proof_method           := NULL;
    NEW.proof_email            := NULL;
    NEW.discord_guild_id       := NULL;
    NEW.link_token_hash        := NULL;
    NEW.link_token_expires_at  := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.community              := OLD.community;
    NEW.claimer                := OLD.claimer;
    NEW.identity_verified_at   := OLD.identity_verified_at;
    NEW.code_hash              := OLD.code_hash;
    NEW.code_expires_at        := OLD.code_expires_at;
    NEW.code_attempts          := OLD.code_attempts;
    NEW.manual_review_at       := OLD.manual_review_at;
    NEW.stripe_customer_id     := OLD.stripe_customer_id;
    NEW.stripe_subscription_id := OLD.stripe_subscription_id;
    NEW.subscription_status    := OLD.subscription_status;
    NEW.current_period_end     := OLD.current_period_end;
    NEW.origin                 := OLD.origin;
    NEW.proof_method           := OLD.proof_method;
    NEW.proof_email            := OLD.proof_email;
    NEW.discord_guild_id       := OLD.discord_guild_id;
    NEW.link_token_hash        := OLD.link_token_hash;
    NEW.link_token_expires_at  := OLD.link_token_expires_at;
  END IF;
  RETURN NEW;
END;
$$;

-- The bot looks a claim up by token hash alone (it has a token and a guild, and
-- no idea which community either belongs to), so that lookup needs its own
-- index rather than riding on the community/claimer key.
CREATE INDEX IF NOT EXISTS idx_community_claim_link_token
  ON community_claim (link_token_hash) WHERE link_token_hash IS NOT NULL;

-- Groups have no domain and no server to check, so they land in a review queue.
-- That queue is not built yet; this is the access path it will need, and it
-- costs nothing to put here now.
CREATE INDEX IF NOT EXISTS idx_community_claim_pending_review
  ON community_claim (manual_review_at DESC) WHERE manual_review_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
