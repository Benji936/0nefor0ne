-- Named wishlists: a way to order a want list, without touching what a want is.
--
-- `Card.wish` stays exactly what it was — the boolean ten server-side functions
-- read, find_matches and create_trade_proposal among them. This migration adds
-- a name beside it, never underneath it. A card on any list is still wished
-- for, so matching keeps working by construction rather than by care: none of
-- those ten functions is edited here, and none needs to be.
--
-- A card with wishlist IS NULL is wished for but unsorted. That is the state
-- every row starts in, so there is no backfill and nothing to undo.

CREATE TABLE public.wishlist (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner       uuid   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text   NOT NULL,
  sort_order  smallint NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- 40 is what fits a list chip without truncating. btrim so " " is not a name.
  CONSTRAINT wishlist_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  -- Not redundant with the primary key: it is the target the composite foreign
  -- key below needs in order to compare owners.
  CONSTRAINT wishlist_id_owner UNIQUE (id, owner)
);

-- Two lists called "Chase cards" is a bug report waiting to happen. Case- and
-- space-insensitive, because "chase cards" is the same list to a human.
CREATE UNIQUE INDEX wishlist_owner_name ON public.wishlist (owner, lower(btrim(name)));

-- Covers the only read there is: my lists, in my order.
CREATE INDEX wishlist_owner ON public.wishlist (owner, sort_order, id);

ALTER TABLE public."Card"
  ADD COLUMN wishlist bigint,

  -- Composite on purpose. A plain reference to wishlist(id) would happily let
  -- somebody file their card under another person's list; carrying `trader`
  -- into the key makes the database refuse it, with no trigger to maintain.
  --
  -- SET NULL names the column because `trader` is NOT NULL — an unqualified
  -- SET NULL would try to blank both and fail. Deleting a list must not delete
  -- what is on it: the cards come back as unsorted, which is recoverable,
  -- whereas cascading would quietly destroy a want list.
  ADD CONSTRAINT card_wishlist_fk
    FOREIGN KEY (wishlist, trader) REFERENCES public.wishlist (id, owner)
    ON DELETE SET NULL (wishlist),

  -- The trade pile has no lists yet (that is a later cycle), so a card in it
  -- has no business pointing at one.
  ADD CONSTRAINT card_wishlist_only_when_wish CHECK (wishlist IS NULL OR wish);

CREATE INDEX card_wishlist ON public."Card" (wishlist) WHERE wishlist IS NOT NULL;

ALTER TABLE public.wishlist ENABLE ROW LEVEL SECURITY;

-- Your lists are yours to read and yours to change. There is no reason for
-- anyone else to see how you have filed your wants — the wants themselves are
-- what other traders match against, and those are already public through Card.
CREATE POLICY wishlist_owner_all ON public.wishlist
  FOR ALL TO authenticated
  USING (owner = auth.uid())
  WITH CHECK (owner = auth.uid());
