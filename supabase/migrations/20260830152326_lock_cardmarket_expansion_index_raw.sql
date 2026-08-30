-- public.cardmarket_expansion_index_raw was reachable by anyone.
--
-- The table holds 1,218 scraped rows of the Cardmarket expansion index. It was
-- created outside the tracked migrations, so it inherited Supabase's default
-- `GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated` and nothing
-- ever took it away. It is also the one table in `public` with row level
-- security switched off, which is what made the grant live rather than
-- theoretical: PostgREST serves SELECT, INSERT, UPDATE and DELETE on a table in
-- that state, and the anon key ships in the frontend bundle by design. Anyone
-- who opened devtools could have read the table or emptied it a row at a time.
--
-- Nothing in the repo reads it -- not the app, not scripts/cardmarket-sweep.mjs,
-- not any other migration -- and no view depends on it. It is populated and
-- consumed by service-role tooling, so service_role keeps its access and the
-- two PostgREST roles lose theirs.
REVOKE ALL ON public.cardmarket_expansion_index_raw FROM anon, authenticated;

-- Belt and braces. The revoke above is what closes the hole today; this is what
-- keeps it closed if a future `GRANT ALL ON ALL TABLES` hands the privileges
-- back, because with RLS on and no policy PostgREST is denied by default while
-- service_role still bypasses it.
ALTER TABLE public.cardmarket_expansion_index_raw ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.cardmarket_expansion_index_raw IS
  'Scraped Cardmarket expansion index. service_role only: RLS is on with no '
  'policies by design, so anon and authenticated cannot reach it through '
  'PostgREST. Do not add a policy without deciding what should be public.';
