-- Whether a subscription is already scheduled to end.
--
-- Stripe does not change `status` when somebody cancels. A cancelled
-- subscription stays 'active' until the period actually runs out, and only then
-- becomes 'canceled'. So on the five columns we mirrored until now,
-- current_period_end was an unlabelled date: it means "we charge you again" for
-- one owner and "you lose the badge" for the next, and nothing in the row said
-- which. Any billing panel built on that would have told every owner in the
-- middle of cancelling that their plan renews.
--
-- Mirrored from the same customer.subscription.updated event Stripe already
-- sends when a cancellation is scheduled AND when it is undone, so reactivation
-- needs no extra plumbing.
--
-- Backfill false rather than null where a subscription exists: every row that
-- predates this column belongs to a subscription nobody could cancel from our
-- side, and false is what Stripe would have reported for all of them.

ALTER TABLE community_claim
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean;

UPDATE community_claim SET cancel_at_period_end = false
WHERE cancel_at_period_end IS NULL AND stripe_subscription_id IS NOT NULL;

-- Frozen for client roles like every other billing column. The stakes here are
-- the same as billing_interval's: a claimer who could write this could not move
-- money, but they could make the page promise a renewal that Stripe has no
-- intention of performing.
--
-- The body below was copied from pg_proc.prosrc, NOT from the previous
-- migration in this directory. CREATE OR REPLACE swaps the whole function, so
-- writing it from the newest file on disk drops every freeze added by a
-- migration that touched the function afterwards. That is not hypothetical:
-- the first draft of this file was based on 20260808_billing_interval.sql and
-- therefore omitted discord_entitlement_at, which 20260809 added a day later.
-- Applying it would have let any authenticated client set that column on their
-- own claim row - and recompute_community_verified accepts it as proof of
-- payment, so it would have been a free verified community for anyone who
-- noticed. 20260809's own header warns about this exact trap, having fallen
-- into it once already. Check prosrc first. Every time.
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
    NEW.billing_interval       := NULL;
    NEW.cancel_at_period_end   := NULL;
    NEW.origin                 := 'claim';
    NEW.proof_method           := NULL;
    NEW.proof_email            := NULL;
    NEW.discord_guild_id       := NULL;
    NEW.link_token_hash        := NULL;
    NEW.link_token_expires_at  := NULL;
    NEW.reviewed_at            := NULL;
    NEW.reviewed_by            := NULL;
    NEW.review_note            := NULL;
    NEW.discord_entitlement_at := NULL;
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
    NEW.billing_interval       := OLD.billing_interval;
    NEW.cancel_at_period_end   := OLD.cancel_at_period_end;
    NEW.origin                 := OLD.origin;
    NEW.proof_method           := OLD.proof_method;
    NEW.proof_email            := OLD.proof_email;
    NEW.discord_guild_id       := OLD.discord_guild_id;
    NEW.link_token_hash        := OLD.link_token_hash;
    NEW.link_token_expires_at  := OLD.link_token_expires_at;
    NEW.reviewed_at            := OLD.reviewed_at;
    NEW.reviewed_by            := OLD.reviewed_by;
    NEW.review_note            := OLD.review_note;
    NEW.discord_entitlement_at := OLD.discord_entitlement_at;
  END IF;
  RETURN NEW;
END $$;

NOTIFY pgrst, 'reload schema';
