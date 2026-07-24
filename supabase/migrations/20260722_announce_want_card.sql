-- Multi-card "Looking For" want lists.
--
-- A Looking For announce could previously name exactly one card, through the
-- announce.ygo_card_id / card_name columns added by 20260710_announce_card_link.
-- That is fine for "LF: Darklord Ixchel" but not for a pasted want list, which
-- is how people actually hunt: a dozen lines, mixed quantities, some resolvable
-- to a real card and some not.
--
-- Modelled as a child table rather than more columns on `announce`, so one post
-- holds many wants while images, chat, RLS and every existing read path keep
-- working unchanged. The single-card columns stay: they still describe a sell
-- listing's card, and an LF post with exactly one want can use either.

CREATE TABLE IF NOT EXISTS public.announce_want_card (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  announce    bigint NOT NULL REFERENCES public.announce(id) ON DELETE CASCADE,
  -- NULL when the pasted line matched no card. The line is still worth keeping:
  -- a human reading the post can act on "Kashtira Fenrir (alt art)" even when
  -- the resolver could not pin it to a passcode.
  ygo_card_id bigint NULL,
  card_name   text   NOT NULL CHECK (char_length(card_name) BETWEEN 1 AND 120),
  qty         smallint NOT NULL DEFAULT 1 CHECK (qty BETWEEN 1 AND 99),
  sort_order  smallint NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Reading a post's want list, in paste order.
CREATE INDEX IF NOT EXISTS idx_announce_want_card_announce
  ON public.announce_want_card (announce, sort_order);

-- "Who is looking for this card?" — the match query this table exists to enable.
CREATE INDEX IF NOT EXISTS idx_announce_want_card_ygo_card_id
  ON public.announce_want_card (ygo_card_id)
  WHERE ygo_card_id IS NOT NULL;

ALTER TABLE public.announce_want_card ENABLE ROW LEVEL SECURITY;

-- Want lists are public, exactly like announce and announce_image.
CREATE POLICY "announce_want_card_select_all"
  ON public.announce_want_card FOR SELECT
  USING (true);

-- announce_image gates writes on its own `uploader` column; this table has no
-- such column, so ownership is derived from the parent announce instead. The
-- `announce_want_card.announce` qualification is required — a bare `announce`
-- would resolve to the aliased table in the subquery, not to this column.
CREATE POLICY "announce_want_card_write_own"
  ON public.announce_want_card FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.announce a
      WHERE a.id = announce_want_card.announce
        AND a.seller = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.announce a
      WHERE a.id = announce_want_card.announce
        AND a.seller = auth.uid()
    )
  );
