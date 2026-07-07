-- announce: one row per listing
CREATE TABLE announce (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  seller      uuid NOT NULL REFERENCES auth.users(id),
  title       text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  description text DEFAULT '' CHECK (char_length(description) <= 1000),
  price       numeric(10,2) NOT NULL CHECK (price >= 0),
  currency    text NOT NULL DEFAULT 'EUR' CHECK (currency IN ('EUR','USD','GBP')),
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','sold','archived')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- announce_image: multiple images per announce
CREATE TABLE announce_image (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  announce    bigint NOT NULL REFERENCES announce(id) ON DELETE CASCADE,
  uploader    uuid NOT NULL REFERENCES auth.users(id),
  url         text NOT NULL,
  sort_order  smallint NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── RLS for announce ───────────────────────────────────────────────────────
ALTER TABLE announce ENABLE ROW LEVEL SECURITY;

CREATE POLICY "announce_select_all"
  ON announce FOR SELECT
  USING (true);

CREATE POLICY "announce_insert_own"
  ON announce FOR INSERT
  WITH CHECK (seller = auth.uid());

CREATE POLICY "announce_update_own"
  ON announce FOR UPDATE
  USING (seller = auth.uid());

CREATE POLICY "announce_delete_own"
  ON announce FOR DELETE
  USING (seller = auth.uid());

-- ── RLS for announce_image ─────────────────────────────────────────────────
ALTER TABLE announce_image ENABLE ROW LEVEL SECURITY;

CREATE POLICY "announce_image_select_all"
  ON announce_image FOR SELECT
  USING (true);

CREATE POLICY "announce_image_insert_own"
  ON announce_image FOR INSERT
  WITH CHECK (uploader = auth.uid());

CREATE POLICY "announce_image_delete_own"
  ON announce_image FOR DELETE
  USING (uploader = auth.uid());
