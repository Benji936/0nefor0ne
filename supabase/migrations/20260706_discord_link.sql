-- Add discord_id to Trader so the bot can look up users by Discord User ID
ALTER TABLE "Trader" ADD COLUMN IF NOT EXISTS discord_id text UNIQUE;

-- ── Auto-sync discord_id from auth.identities on login/signup ──────────────
-- When a user authenticates via Discord OAuth, Supabase stores their Discord
-- provider_id in auth.identities. This trigger copies it into Trader so the
-- bot can resolve Discord User ID → Supabase UUID with a simple SELECT.

CREATE OR REPLACE FUNCTION sync_discord_id_to_trader()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_discord_id text;
BEGIN
  SELECT provider_id INTO v_discord_id
  FROM auth.identities
  WHERE user_id = NEW.id AND provider = 'discord'
  LIMIT 1;

  IF v_discord_id IS NOT NULL THEN
    UPDATE "Trader"
    SET discord_id = v_discord_id
    WHERE id = NEW.id AND (discord_id IS NULL OR discord_id != v_discord_id);
  END IF;

  RETURN NEW;
END;
$$;

-- Fire after every INSERT or UPDATE on auth.users (covers first login + token refresh)
DROP TRIGGER IF EXISTS on_auth_user_discord_sync ON auth.users;
CREATE TRIGGER on_auth_user_discord_sync
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION sync_discord_id_to_trader();
