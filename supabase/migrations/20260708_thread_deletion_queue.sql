-- Reliable website→Discord deletion, without depending on Realtime delivery.
-- When an announce with a linked thread is deleted, a trigger records the thread
-- id in a queue; the bot polls this queue and deletes the thread, then clears it.

CREATE TABLE IF NOT EXISTS public.discord_thread_deletion_queue (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  thread_id  text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Only the bot (service role) touches this. RLS on + no policies locks out the public.
ALTER TABLE public.discord_thread_deletion_queue ENABLE ROW LEVEL SECURITY;

-- Enqueue the thread id when a Discord-linked announce is deleted.
-- SECURITY DEFINER so a website user's delete can still write to the locked-down queue.
CREATE OR REPLACE FUNCTION public.enqueue_discord_thread_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parts text[];
BEGIN
  IF OLD.discord_url IS NOT NULL THEN
    parts := string_to_array(split_part(OLD.discord_url, '/channels/', 2), '/');
    -- A thread URL has exactly two segments: {guild}/{thread}. A message URL has
    -- three, and means no thread was ever created — nothing to delete.
    IF array_length(parts, 1) = 2 THEN
      INSERT INTO public.discord_thread_deletion_queue (thread_id) VALUES (parts[2]);
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_announce_delete_enqueue_thread ON public.announce;
CREATE TRIGGER on_announce_delete_enqueue_thread
  AFTER DELETE ON public.announce
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_discord_thread_deletion();
