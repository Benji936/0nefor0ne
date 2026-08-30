-- Which evidence wins, enforced where every writer has to pass.
--
-- Three mechanisms can now state a product's identity, and they are not equally
-- good:
--
--   1  manual                            a person decided
--   2  cardmarket_page                   the product's own page stated it
--   3  cardmarket_expansion_page         a listing row stated it
--   4  cardmarket_expansion_elimination  nothing else it could have been
--
-- The order is by how directly Cardmarket said the thing. Elimination is last
-- not because it is unreliable -- it is deterministic -- but because it is
-- conditional: it holds only if the printing was complete when it was read, so
-- a product added later invalidates it while a directly-read row stands.
--
-- Why this is a trigger and not a convention
-- ------------------------------------------
-- The catalogue import upserts `rarity` and `rarity_source` for all 86,507
-- products from the daily file, where an ambiguous printing resolves to null.
-- Every rarity the enrichment established would have been erased on the next
-- import: 138 identities, silently, with the price ladder quietly falling back
-- to bands and nothing anywhere reporting a loss. A rule that lives in the
-- scripts protects only the scripts that remember it.
--
-- What the trigger does
-- ---------------------
-- A weaker source never overwrites a stronger one. If it agrees, the stronger
-- provenance is kept and the write is a no-op on those columns -- agreement is
-- worth recording in the run log, but it is not evidence of equal strength. If
-- it disagrees, the update is refused outright, because two mechanisms
-- contradicting each other is a fact to look at, not a race to resolve.
--
-- Deliberate corrections
-- ----------------------
-- Relabelling provenance that was recorded wrong is not a downgrade, and the
-- trigger cannot tell the two apart from the values alone. So a correction has
-- to say so:
--
--   SET LOCAL cardmarket.allow_provenance_correction = 'on';
--
-- Scoped to the transaction, and deliberately awkward to type by accident.

CREATE OR REPLACE FUNCTION public.identity_source_rank(src text)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE src
    WHEN 'manual'                           THEN 1
    WHEN 'cardmarket_page'                  THEN 2
    WHEN 'cardmarket_expansion_page'        THEN 3
    WHEN 'cardmarket_expansion_elimination' THEN 4
    ELSE 99                                  -- no identity at all is weakest
  END;
$$;

CREATE OR REPLACE FUNCTION public.cardmarket_identity_precedence()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  correcting boolean := coalesce(
    current_setting('cardmarket.allow_provenance_correction', true), 'off') = 'on';
BEGIN
  IF OLD.identity_source IS NULL OR correcting THEN
    RETURN NEW;
  END IF;

  IF identity_source_rank(NEW.identity_source) > identity_source_rank(OLD.identity_source) THEN
    -- The incoming claim is weaker. It may not win, whatever it says.
    IF NEW.version_no    IS DISTINCT FROM OLD.version_no
    OR NEW.version_label IS DISTINCT FROM OLD.version_label THEN
      RAISE EXCEPTION
        'identity conflict on product %: % says % but % already says % -- resolve it, do not overwrite',
        OLD.id_product, NEW.identity_source, coalesce(NEW.version_label, '(none)'),
        OLD.identity_source, coalesce(OLD.version_label, '(none)');
    END IF;

    -- Agreement. Worth knowing, not worth downgrading for.
    NEW.version_no      := OLD.version_no;
    NEW.version_label   := OLD.version_label;
    NEW.identity_source := OLD.identity_source;
    NEW.identity_at     := OLD.identity_at;
  END IF;

  -- A rarity that came from an identity belongs to that identity. The daily
  -- import proposes null here for every ambiguous printing, and null must not
  -- be able to erase a fact.
  IF OLD.rarity IS NOT NULL
     AND (NEW.rarity IS NULL OR NEW.rarity_source IS NULL)
     AND identity_source_rank(NEW.identity_source) >= identity_source_rank(OLD.identity_source) THEN
    NEW.rarity        := OLD.rarity;
    NEW.rarity_source := OLD.rarity_source;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cardmarket_identity_precedence ON public.cardmarket_product;
CREATE TRIGGER cardmarket_identity_precedence
  BEFORE UPDATE ON public.cardmarket_product
  FOR EACH ROW EXECUTE FUNCTION public.cardmarket_identity_precedence();
