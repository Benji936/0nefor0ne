-- What happened the last time we enriched an expansion.
--
-- Identities record what we concluded; this records how we got there, which is
-- the part that goes stale. An elimination is sound only against the printing
-- as it stood when the page was read, so six months from now the question is
-- not "what is this product" but "how was that decided, and is the reasoning
-- still safe". Without a run log the only honest answer is to redo the work.
--
-- It also answers the operational questions that come up before a run rather
-- than after: has this expansion been done, did it need product pages, did
-- anything conflict, was it complete.
CREATE TABLE IF NOT EXISTS public.cardmarket_enrichment_run (
  run_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_expansion bigint NOT NULL,
  started_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,

  -- What the pages gave us.
  page_rows                integer,
  -- ...and what each mechanism accounted for. These are counts of identities,
  -- not of printings: one printing can contribute several.
  direct_count             integer NOT NULL DEFAULT 0,
  elimination_count        integer NOT NULL DEFAULT 0,
  -- Products already carrying an identity at least as strong, left alone. High
  -- here is good news: it means a re-run agreed with what was already there.
  existing_stronger_count  integer NOT NULL DEFAULT 0,
  unresolved_count         integer NOT NULL DEFAULT 0,
  -- Never expected to be anything but zero. Anything else is a mechanism
  -- contradicting another and wants a person, which is why it is a column
  -- rather than a log line.
  conflict_count           integer NOT NULL DEFAULT 0,

  product_page_fallback_count integer NOT NULL DEFAULT 0,

  status text NOT NULL
    CHECK (status IN ('running', 'complete', 'partial', 'refused', 'failed')),
  notes  text,

  CONSTRAINT cardmarket_enrichment_run_counts_sane
    CHECK (direct_count >= 0 AND elimination_count >= 0
       AND existing_stronger_count >= 0 AND unresolved_count >= 0
       AND conflict_count >= 0 AND product_page_fallback_count >= 0),
  -- A finished run has to say when. A running one must not claim to.
  CONSTRAINT cardmarket_enrichment_run_completion
    CHECK ((status = 'running') = (completed_at IS NULL))
);

-- "When was this expansion last enriched" is the common read.
CREATE INDEX IF NOT EXISTS cardmarket_enrichment_run_expansion
  ON public.cardmarket_enrichment_run (id_expansion, started_at DESC);

-- The two rows worth finding across the whole table.
CREATE INDEX IF NOT EXISTS cardmarket_enrichment_run_attention
  ON public.cardmarket_enrichment_run (started_at DESC)
  WHERE conflict_count > 0 OR status IN ('refused', 'failed');

ALTER TABLE public.cardmarket_enrichment_run ENABLE ROW LEVEL SECURITY;

CREATE POLICY cardmarket_enrichment_run_read
  ON public.cardmarket_enrichment_run FOR SELECT USING (true);

GRANT SELECT ON public.cardmarket_enrichment_run TO anon, authenticated;

-- How an expansion should be approached, which is not always "normally".
--
-- Deliberately here and not in the parsing code. RA05's listing renders far
-- fewer rows than the expansion holds and its search filter under-returns
-- unpredictably -- one row for a card with seven products, but a correct seven
-- for another. A special case in the extractor would encode today's symptom of
-- a mechanism nobody has explained; a flag on the expansion says only "this one
-- does not behave, do not sweep it", and leaves the parser honest.
ALTER TABLE public.cardmarket_expansion_route
  ADD COLUMN IF NOT EXISTS enrichment_status text NOT NULL DEFAULT 'normal'
    CHECK (enrichment_status IN ('normal', 'listing_anomaly', 'manual_review')),
  ADD COLUMN IF NOT EXISTS enrichment_notes text;

CREATE INDEX IF NOT EXISTS cardmarket_expansion_route_enrichment_status
  ON public.cardmarket_expansion_route (enrichment_status)
  WHERE enrichment_status <> 'normal';
