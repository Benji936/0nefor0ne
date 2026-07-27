-- Fully retire the legacy claim_community RPC.
-- Plan 1 revoked EXECUTE from `authenticated` at cutover, but the function was
-- still callable by `anon` via the default PUBLIC grant. That is harmless in
-- practice (the function raises 'not authenticated' whenever auth.uid() is NULL,
-- so an anon caller can never write), but a fully-retired RPC should not be a
-- callable endpoint at all. Revoke from PUBLIC and anon so the old free-claim
-- path is completely closed; the verified + paid Edge Function flow replaces it.
REVOKE EXECUTE ON FUNCTION public.claim_community(bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_community(bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_community(bigint) FROM authenticated;

NOTIFY pgrst, 'reload schema';
