-- Announce chat: lightweight buyer ↔ seller messaging attached to a listing.
-- Mirrors the trade_message pattern, but keyed on an announce instead of a Trade.
-- A "thread" is all messages on one announce between the seller and one other user.

CREATE TABLE IF NOT EXISTS public.announce_message (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  announce    bigint NOT NULL REFERENCES public.announce(id) ON DELETE CASCADE,
  sender      uuid   NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  recipient   uuid   NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  content     text   NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Fast thread lookups (all messages for an announce, chronological).
CREATE INDEX IF NOT EXISTS announce_message_thread_idx
  ON public.announce_message (announce, created_at);

ALTER TABLE public.announce_message ENABLE ROW LEVEL SECURITY;

-- Only the two participants of a message can read it.
CREATE POLICY announce_message_select_participant ON public.announce_message
  FOR SELECT
  USING (sender = auth.uid() OR recipient = auth.uid());

-- You may only send as yourself, to someone else, and every message must be
-- between the announce's seller and another user (prevents using announces as a
-- generic DM channel to arbitrary accounts).
CREATE POLICY announce_message_insert_own ON public.announce_message
  FOR INSERT
  WITH CHECK (
    sender = auth.uid()
    AND sender <> recipient
    AND EXISTS (
      SELECT 1 FROM public.announce a
      WHERE a.id = announce_message.announce
        AND (a.seller = recipient OR a.seller = sender)
    )
  );

-- Deliver INSERTs over Realtime so open chats update live.
ALTER PUBLICATION supabase_realtime ADD TABLE public.announce_message;
