-- Community section: claimable store / discord / group profiles.
-- Single table discriminated by `kind`, mirroring announce.kind. Unclaimed OTS
-- seed rows have owner IS NULL and are claimed via the claim_community RPC.

CREATE TABLE IF NOT EXISTS community (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind          text NOT NULL CHECK (kind IN ('store','discord','group')),
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  slug          text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  bio           text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 2000),
  avatar_url    text,
  banner_url    text,
  website       text,
  discord_url   text,
  city          text,
  country       text,
  country_code  text,
  region        text,
  lat           double precision,
  lng           double precision,
  remote_duel   boolean NOT NULL DEFAULT false,
  ots_store_id  text UNIQUE,
  tags          text[] NOT NULL DEFAULT '{}',
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','hidden')),
  verified      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_kind_status ON community (kind, status);
CREATE INDEX IF NOT EXISTS idx_community_country      ON community (country);
CREATE INDEX IF NOT EXISTS idx_community_owner        ON community (owner) WHERE owner IS NOT NULL;

ALTER TABLE community ENABLE ROW LEVEL SECURITY;

-- Public sees published rows; an owner also sees their own drafts/hidden rows.
DROP POLICY IF EXISTS "community_select_public" ON community;
CREATE POLICY "community_select_public" ON community FOR SELECT
  USING (status = 'published' OR owner = auth.uid());

-- Owner-created rows only (claiming a NULL-owner row goes through the RPC).
DROP POLICY IF EXISTS "community_insert_own" ON community;
CREATE POLICY "community_insert_own" ON community FOR INSERT
  WITH CHECK (owner = auth.uid());

DROP POLICY IF EXISTS "community_update_own" ON community;
CREATE POLICY "community_update_own" ON community FOR UPDATE
  USING (owner = auth.uid()) WITH CHECK (owner = auth.uid());

DROP POLICY IF EXISTS "community_delete_own" ON community;
CREATE POLICY "community_delete_own" ON community FOR DELETE
  USING (owner = auth.uid());

-- ── Reports ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_report (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  community  bigint NOT NULL REFERENCES community(id) ON DELETE CASCADE,
  reporter   uuid   NOT NULL REFERENCES auth.users(id),
  reason     text   NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  status     text   NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community, reporter)
);

ALTER TABLE community_report ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "community_report_insert_own" ON community_report;
CREATE POLICY "community_report_insert_own" ON community_report FOR INSERT
  WITH CHECK (reporter = auth.uid());

DROP POLICY IF EXISTS "community_report_select_own" ON community_report;
CREATE POLICY "community_report_select_own" ON community_report FOR SELECT
  USING (reporter = auth.uid());

-- ── Claim RPC ──────────────────────────────────────────────────────────────
-- Claiming sets owner on an UNCLAIMED row. RLS update policy requires
-- owner = auth.uid(), which a NULL-owner row can never satisfy, so the claim
-- must run as SECURITY DEFINER. It refuses already-owned rows.
CREATE OR REPLACE FUNCTION claim_community(p_community bigint)
RETURNS community
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row community;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE community
     SET owner = v_uid, status = 'published', updated_at = now()
   WHERE id = p_community AND owner IS NULL
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'community % is not claimable (missing or already claimed)', p_community;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION claim_community(bigint) FROM public;
GRANT EXECUTE ON FUNCTION claim_community(bigint) TO authenticated;

NOTIFY pgrst, 'reload schema';
