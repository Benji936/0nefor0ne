// The reviewer's side of the manual review queue.
//
// There is no client-side check for whether the caller is a reviewer, on
// purpose. The allowlist lives in an Edge Function secret, the function is the
// only thing that knows it, and the page simply renders whatever answer it
// gets back. A permission the browser evaluates is a permission anyone can
// edit.
import { getClient } from "@/lib/supabaseClient";

async function call(body) {
  const { data, error } = await getClient().functions.invoke("admin-review", { body });
  // A 403 arrives as an invoke error, and it is an answer rather than a
  // failure: it means "you are not a reviewer", which the page has to render.
  if (error) {
    const status = error?.context?.status;
    if (status === 403) return { error: "not_admin" };
    if (status === 401) return { error: "not_authenticated" };
    console.error("adminReview call failed", error);
    throw error;
  }
  return data;
}

/** Everything waiting on a person: unreviewed requests and open reports. */
export function fetchQueue() {
  return call({ action: "list" });
}

/**
 * Approve or decline a review request.
 * Approving stamps identity_verified_at, so the owner picks the flow back up at
 * checkout. It does not verify them outright.
 */
export function decideClaim(claimId, decision, note = "") {
  return call({ action: "decide", claim_id: claimId, decision, note });
}

export function resolveReport(reportId, status) {
  return call({ action: "resolve", report_id: reportId, status });
}

/**
 * What Stripe configuration the server actually sees. Read-only.
 * The dashboard shows what was created; this shows what the functions resolve
 * the secrets to, which is where a test-mode price or a mistyped secret name
 * becomes visible without waiting for someone to fail at Checkout.
 */
export function fetchBillingConfig() {
  return call({ action: "config" });
}
