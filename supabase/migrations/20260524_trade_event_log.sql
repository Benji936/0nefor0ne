-- ─────────────────────────────────────────────────────────────────────────────
-- Trade event / audit log
--
-- Captures every status transition on the Trade table so that any trade can
-- be fully replayed for troubleshooting. Implemented as a SECURITY DEFINER
-- trigger function so it always fires regardless of RLS on the source table.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Table ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trade_event (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trade_id    bigint      NOT NULL REFERENCES "Trade"(id) ON DELETE CASCADE,
  event_type  text        NOT NULL,   -- mirrors destination status + 'created' | 'updated'
  actor_id    uuid        REFERENCES auth.users(id),
  from_status text,                   -- NULL on creation
  to_status   text        NOT NULL,
  notes       text,                   -- decline reason, free-form context
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Fast lookup by trade + time
CREATE INDEX IF NOT EXISTS trade_event_trade_time_idx
  ON trade_event (trade_id, created_at);

-- ── 2. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE trade_event ENABLE ROW LEVEL SECURITY;

-- Both participants (proposer and counterparty) can read the full event log
CREATE POLICY "trade_event_select_participant"
  ON trade_event FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM   "Trade" t
      WHERE  t.id = trade_event.trade_id
        AND  (t.user1 = auth.uid() OR t.user2 = auth.uid())
    )
  );

-- ── 3. Trigger function ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION log_trade_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER          -- runs as owner, bypasses RLS for the INSERT
SET search_path = public  -- pin schema to prevent search_path hijacking
AS $$
BEGIN
  -- New trade created
  IF TG_OP = 'INSERT' THEN
    INSERT INTO trade_event (trade_id, event_type, actor_id, from_status, to_status)
    VALUES (NEW.id, 'created', auth.uid(), NULL, NEW.status);

  -- Status changed (accepted / declined / cancelled / completed / …)
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO trade_event (
      trade_id, event_type, actor_id, from_status, to_status, notes
    )
    VALUES (
      NEW.id,
      NEW.status,           -- event_type = the new status value
      auth.uid(),
      OLD.status,
      NEW.status,
      -- capture the decline reason if the column exists on the row
      CASE WHEN NEW.status = 'declined' THEN NEW.decline_reason ELSE NULL END
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ── 4. Attach trigger ─────────────────────────────────────────────────────────

-- Drop first so re-running the migration is idempotent
DROP TRIGGER IF EXISTS trade_status_audit ON "Trade";

CREATE TRIGGER trade_status_audit
  AFTER INSERT OR UPDATE ON "Trade"
  FOR EACH ROW
  EXECUTE FUNCTION log_trade_status_change();

-- ── 5. Helper RPC ─────────────────────────────────────────────────────────────
-- fetch_trade_events(p_trade_id) — returns all events ordered oldest-first.
-- The function applies the same participant check that RLS enforces on the table,
-- so it is safe to call from the client.

CREATE OR REPLACE FUNCTION fetch_trade_events(p_trade_id bigint)
RETURNS TABLE (
  id          bigint,
  event_type  text,
  actor_id    uuid,
  from_status text,
  to_status   text,
  notes       text,
  created_at  timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    te.id,
    te.event_type,
    te.actor_id,
    te.from_status,
    te.to_status,
    te.notes,
    te.created_at
  FROM trade_event te
  JOIN "Trade" t ON t.id = te.trade_id
  WHERE te.trade_id = p_trade_id
    AND (t.proposer = auth.uid() OR t.counterparty = auth.uid())
  ORDER BY te.created_at ASC;
$$;
