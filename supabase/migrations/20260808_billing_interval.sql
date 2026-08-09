-- Two ways to pay: yearly, or monthly.
--
-- Until now there was one price and one interval, so nothing needed recording:
-- every subscription was yearly and the copy could say so unconditionally. With
-- two, the row has to remember which one was bought, or the profile cannot tell
-- an owner when their next charge lands and the lapse copy cannot say what
-- ended.
--
-- Written by stripe-webhook from the subscription's actual price, not from the
-- interval the browser asked for. What Stripe billed is the truth; what we
-- requested is an intention that could have been overridden in the portal.
--
-- Backfill 'year' where a subscription exists: every subscription created before
-- this migration used the single yearly price.

ALTER TABLE community_claim
  ADD COLUMN IF NOT EXISTS billing_interval text;

ALTER TABLE community_claim DROP CONSTRAINT IF EXISTS community_claim_billing_interval_check;
ALTER TABLE community_claim ADD CONSTRAINT community_claim_billing_interval_check
  CHECK (billing_interval IS NULL OR billing_interval IN ('month', 'year'));

UPDATE community_claim SET billing_interval = 'year'
WHERE billing_interval IS NULL AND stripe_subscription_id IS NOT NULL;

-- Frozen like every other billing column. A claimer who could write this could
-- not steal money, but they could make the page tell them a renewal date that
-- was never true, and a billing figure a user cannot trust is worse than none.
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
    NEW.origin                 := 'claim';
    NEW.proof_method           := NULL;
    NEW.proof_email            := NULL;
    NEW.discord_guild_id       := NULL;
    NEW.link_token_hash        := NULL;
    NEW.link_token_expires_at  := NULL;
    NEW.reviewed_at            := NULL;
    NEW.reviewed_by            := NULL;
    NEW.review_note            := NULL;
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
    NEW.origin                 := OLD.origin;
    NEW.proof_method           := OLD.proof_method;
    NEW.proof_email            := OLD.proof_email;
    NEW.discord_guild_id       := OLD.discord_guild_id;
    NEW.link_token_hash        := OLD.link_token_hash;
    NEW.link_token_expires_at  := OLD.link_token_expires_at;
    NEW.reviewed_at            := OLD.reviewed_at;
    NEW.reviewed_by            := OLD.reviewed_by;
    NEW.review_note            := OLD.review_note;
  END IF;
  RETURN NEW;
END $$;

NOTIFY pgrst, 'reload schema';
