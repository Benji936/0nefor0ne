-- "Looking For" announces: a buyer states an archetype plus a free-text
-- qualifier ("Darklord deck base") instead of selling a specific card.
--
-- Modelled as extra columns on `announce` rather than a second table so that
-- images, chat, RLS, Discord threads and every existing read path keep working
-- unchanged. kind defaults to 'sell', so all existing rows stay valid.

ALTER TABLE public.announce
  ADD COLUMN IF NOT EXISTS kind        text NOT NULL DEFAULT 'sell',
  ADD COLUMN IF NOT EXISTS archetype   text NULL,
  ADD COLUMN IF NOT EXISTS want_detail text NULL;

-- Separate from the ADD above: adding a CHECK inline with IF NOT EXISTS is not
-- supported, and we want the constraint to be re-runnable.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'announce_kind_check'
  ) THEN
    ALTER TABLE public.announce
      ADD CONSTRAINT announce_kind_check
      CHECK (kind IN ('sell', 'looking_for'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'announce_want_detail_len'
  ) THEN
    ALTER TABLE public.announce
      ADD CONSTRAINT announce_want_detail_len
      CHECK (want_detail IS NULL OR char_length(want_detail) <= 120);
  END IF;
END $$;

-- A Looking For post may have no budget at all, so price must be nullable.
-- The existing price >= 0 CHECK stays and is satisfied by NULL (SQL CHECK
-- passes on NULL), so it does not need to be dropped.
ALTER TABLE public.announce
  ALTER COLUMN price DROP NOT NULL;

-- "Who else is looking for Darklord?" — the only new query shape we introduce.
CREATE INDEX IF NOT EXISTS idx_announce_kind_archetype
  ON public.announce (kind, archetype)
  WHERE kind = 'looking_for';
