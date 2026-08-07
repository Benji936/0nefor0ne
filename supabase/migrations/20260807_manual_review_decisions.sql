-- Give the review queue an outcome.
--
-- Until now a manual review request could only be made, never answered:
-- manual_review_at went in and nothing anywhere read it. An owner who
-- submitted saw "pending" and would have seen it for the rest of time.
--
-- Three columns close that. reviewed_at is what turns a request into a decided
-- one, and which of the two decisions it was is read off identity_verified_at:
-- approved means proof passed, so the owner continues to checkout exactly like
-- the domain-code and Discord routes. Declined means reviewed with no proof
-- granted, and review_note is what the owner is owed as an explanation.
--
-- Frozen against client writes for the obvious reason: a claimer who could set
-- their own reviewed_at and identity_verified_at would not need a reviewer.

ALTER TABLE community_claim
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_note text;

ALTER TABLE community_claim DROP CONSTRAINT IF EXISTS community_claim_review_note_check;
ALTER TABLE community_claim ADD CONSTRAINT community_claim_review_note_check
  CHECK (review_note IS NULL OR char_length(review_note) <= 500);

-- Same guard, three more frozen columns. Kept as one function rather than a
-- second trigger so the whole list of what a client may not touch stays
-- readable in one place.
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

-- The queue's access path is "waiting on me", not "was ever submitted", so the
-- index stops carrying rows that have already been answered.
DROP INDEX IF EXISTS idx_community_claim_pending_review;
CREATE INDEX idx_community_claim_pending_review
  ON community_claim (manual_review_at DESC)
  WHERE manual_review_at IS NOT NULL AND reviewed_at IS NULL;

NOTIFY pgrst, 'reload schema';
