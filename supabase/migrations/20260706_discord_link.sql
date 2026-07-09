-- Add discord_id to Trader so the bot can look up users by Discord User ID
ALTER TABLE "Trader" ADD COLUMN IF NOT EXISTS discord_id text UNIQUE;

-- ── Sync function (called from two triggers below) ─────────────────────────────
-- CRITICAL: The EXCEPTION block ensures this function NEVER blocks Supabase auth.
-- If anything fails here, the error is silently swallowed and auth continues.
-- The frontend AuthCallback.vue performs the same sync explicitly as a fallback.

-- NOTE: `SET search_path = public, auth` is REQUIRED. Auth triggers run as the
-- supabase_auth_admin role, whose search_path is `auth` only. Without this, the
-- unqualified "Trader" reference resolves to auth.Trader, throws "relation does
-- not exist", and the discord_id sync silently no-ops inside the EXCEPTION block.
CREATE OR REPLACE FUNCTION sync_discord_id_from_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth AS $$
DECLARE
  v_discord_id text;
BEGIN
  BEGIN
    SELECT provider_id INTO v_discord_id
    FROM auth.identities
    WHERE user_id = NEW.id AND provider = 'discord'
    LIMIT 1;

    IF v_discord_id IS NOT NULL THEN
      UPDATE public."Trader"
      SET discord_id = v_discord_id
      WHERE id = NEW.id AND (discord_id IS NULL OR discord_id != v_discord_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Never block auth for a non-critical sync failure
    NULL;
  END;
  RETURN NEW;
END;
$$;

-- Trigger 1: covers signInWithOAuth (new Discord accounts)
DROP TRIGGER IF EXISTS on_auth_user_discord_sync ON auth.users;
CREATE TRIGGER on_auth_user_discord_sync
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION sync_discord_id_from_user();

-- ── Second sync function for auth.identities (covers linkIdentity) ─────────────
CREATE OR REPLACE FUNCTION sync_discord_id_from_identity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth AS $$
BEGIN
  BEGIN
    IF NEW.provider = 'discord' THEN
      UPDATE public."Trader"
      SET discord_id = NEW.provider_id
      WHERE id = NEW.user_id AND (discord_id IS NULL OR discord_id != NEW.provider_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;

-- Trigger 2: covers linkIdentity (existing users connecting Discord)
DROP TRIGGER IF EXISTS on_identity_discord_link ON auth.identities;
CREATE TRIGGER on_identity_discord_link
  AFTER INSERT ON auth.identities
  FOR EACH ROW EXECUTE FUNCTION sync_discord_id_from_identity();
