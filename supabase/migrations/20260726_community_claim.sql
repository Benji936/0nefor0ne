-- Verified store claim (Plan 1): claim state + private store email, and the
-- retirement of the instant free claim_community RPC.

CREATE TABLE IF NOT EXISTS community_claim (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  community             bigint NOT NULL REFERENCES community(id) ON DELETE CASCADE,
  claimer               uuid   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  identity_verified_at  timestamptz,
  code_hash             text,
  code_expires_at       timestamptz,
  code_attempts         smallint NOT NULL DEFAULT 0,
  manual_review_reason  text CHECK (manual_review_reason IS NULL OR char_length(manual_review_reason) <= 500),
  manual_review_at      timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community, claimer)
);

CREATE INDEX IF NOT EXISTS idx_community_claim_claimer ON community_claim (claimer);

ALTER TABLE community_claim ENABLE ROW LEVEL SECURITY;

-- A claimer sees and inserts only their own claim rows. The code_hash column is
-- returned to them too, but it is a one-way hash so that is safe; the plaintext
-- code only ever exists in the email. Updates to ownership happen through the
-- service-role Edge Functions, not client policies.
DROP POLICY IF EXISTS "community_claim_select_own" ON community_claim;
CREATE POLICY "community_claim_select_own" ON community_claim FOR SELECT
  USING (claimer = auth.uid());

DROP POLICY IF EXISTS "community_claim_insert_own" ON community_claim;
CREATE POLICY "community_claim_insert_own" ON community_claim FOR INSERT
  WITH CHECK (claimer = auth.uid());

DROP POLICY IF EXISTS "community_claim_update_own" ON community_claim;
CREATE POLICY "community_claim_update_own" ON community_claim FOR UPDATE
  USING (claimer = auth.uid()) WITH CHECK (claimer = auth.uid());

-- Column guard: RLS lets a claimer touch their own row, but a hand-written
-- PostgREST call could then set identity_verified_at / code_hash and self-verify
-- without ever receiving the emailed code. This trigger forces every sensitive
-- column to its safe value for client roles; only service_role (the Edge
-- Functions) and no-JWT sessions (Studio/psql) may write them. The one field a
-- client may set is manual_review_reason. Mirrors community_enforce_admin_fields.
CREATE OR REPLACE FUNCTION community_claim_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', 'service_role');
BEGIN
  IF v_role = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.identity_verified_at := NULL;
    NEW.code_hash            := NULL;
    NEW.code_expires_at      := NULL;
    NEW.code_attempts        := 0;
    NEW.manual_review_at     := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.community            := OLD.community;
    NEW.claimer             := OLD.claimer;
    NEW.identity_verified_at := OLD.identity_verified_at;
    NEW.code_hash            := OLD.code_hash;
    NEW.code_expires_at      := OLD.code_expires_at;
    NEW.code_attempts        := OLD.code_attempts;
    NEW.manual_review_at     := OLD.manual_review_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_claim_guard ON community_claim;
CREATE TRIGGER trg_community_claim_guard
  BEFORE INSERT OR UPDATE ON community_claim
  FOR EACH ROW EXECUTE FUNCTION community_claim_guard();

-- ── Private store email (RLS denies every client role) ──────────────────────
CREATE TABLE IF NOT EXISTS community_private (
  community    bigint PRIMARY KEY REFERENCES community(id) ON DELETE CASCADE,
  claim_email  text
);

ALTER TABLE community_private ENABLE ROW LEVEL SECURITY;
-- No policies = no anon/authenticated access at all. Only service_role (which
-- bypasses RLS) can read it, which is exactly the Edge Functions.
REVOKE ALL ON community_private FROM anon, authenticated;

-- ── Retire the instant free claim ───────────────────────────────────────────
-- Keep the function object (dropping it can 404 a stale client mid-deploy) but
-- remove the grant so it can no longer be executed. The new flow replaces it.
-- NOTE (cutover): applied to production only at the frontend cutover, so the live
-- claim button is not broken mid-build.
REVOKE EXECUTE ON FUNCTION claim_community(bigint) FROM authenticated;

NOTIFY pgrst, 'reload schema';
