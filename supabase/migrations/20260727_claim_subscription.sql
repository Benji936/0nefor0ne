-- Verified paid claim (Plan 2): Stripe subscription state on community_claim,
-- an extended column guard so client roles can never self-set subscription
-- fields, and a webhook-event dedupe table for idempotent Stripe delivery.

ALTER TABLE community_claim
  ADD COLUMN IF NOT EXISTS stripe_customer_id     text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status    text,
  ADD COLUMN IF NOT EXISTS current_period_end     timestamptz;

-- Extend the existing column guard (Plan 1) to also freeze the Stripe columns
-- for client roles. Only service_role (the Edge Functions) may set them. The
-- one client-writable field remains manual_review_reason.
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
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.community              := OLD.community;
    NEW.claimer               := OLD.claimer;
    NEW.identity_verified_at   := OLD.identity_verified_at;
    NEW.code_hash              := OLD.code_hash;
    NEW.code_expires_at        := OLD.code_expires_at;
    NEW.code_attempts          := OLD.code_attempts;
    NEW.manual_review_at       := OLD.manual_review_at;
    NEW.stripe_customer_id     := OLD.stripe_customer_id;
    NEW.stripe_subscription_id := OLD.stripe_subscription_id;
    NEW.subscription_status    := OLD.subscription_status;
    NEW.current_period_end     := OLD.current_period_end;
  END IF;
  RETURN NEW;
END;
$$;

-- Idempotency ledger: the webhook inserts each Stripe event id once; a repeat
-- delivery hits the PK and is skipped. Deny all client access.
CREATE TABLE IF NOT EXISTS stripe_webhook_event (
  event_id    text PRIMARY KEY,
  type        text,
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE stripe_webhook_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON stripe_webhook_event FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
