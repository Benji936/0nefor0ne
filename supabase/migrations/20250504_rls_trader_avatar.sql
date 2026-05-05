-- ============================================================
-- RLS policy for Trader avatar_url updates
--
-- Allows users to update their own trader profile,
-- including the avatar_url column for profile pictures.
-- ============================================================

-- Ensure the Trader table has the avatar_url column
ALTER TABLE "Trader"
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Enable RLS on Trader table (if not already enabled)
ALTER TABLE "Trader" ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read trader profiles" ON "Trader";
DROP POLICY IF EXISTS "Users can update their own profile" ON "Trader";

-- Policy: Anyone can read any trader profile (for discovery)
CREATE POLICY "Users can read trader profiles"
  ON "Trader" FOR SELECT
  USING (true);

-- Policy: Users can update their own trader profile (including avatar_url)
CREATE POLICY "Users can update their own profile"
  ON "Trader" FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Ensure index on id for performance
CREATE INDEX IF NOT EXISTS idx_trader_id ON "Trader"(id);
