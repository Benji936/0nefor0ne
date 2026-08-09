// One way to call an Edge Function, because supabase-js has a trap in it.
//
// functions.invoke() only puts the response body in `data` when the status is
// 2xx. Any other status sets `error` to a FunctionsHttpError and leaves `data`
// null. Our functions answer failures with a status AND a body: 409
// { error: "already_own_one" }, 503 { error: "interval_unavailable" }, and so
// on. So every branch in the app written as `res.error === "already_own_one"`
// was unreachable, and what a user actually saw was the FunctionsHttpError's
// message, which reads:
//
//   Edge Function returned a non-2xx status code
//
// That sentence is true of every failure this product has and tells nobody
// anything. The body was there the whole time, unread, on error.context.
//
// So: read it. A function that took the trouble to say which thing went wrong
// gets to have that reach the person it happened to.
import { getClient } from "@/lib/supabaseClient";

/** The Response hanging off a FunctionsHttpError, if it has one and it holds
 *  JSON. supabase-js never reads the body, so it is still there to be read. */
async function readBody(context) {
  if (!context || typeof context.json !== "function") return null;
  try {
    const body = await context.json();
    return body && typeof body === "object" ? body : null;
  } catch {
    return null; // HTML from a proxy, an empty body, a truncated response
  }
}

/**
 * Invoke an Edge Function and return its body, whatever the status.
 *
 * Throws only when there is no body to return, which means the failure came
 * from somewhere below our code: the network, or the platform gateway refusing
 * the request before the function ran. A caller cannot do anything sensible
 * with those, and they belong in the console rather than in the interface.
 */
export async function invokeFunction(name, body) {
  const { data, error } = await getClient().functions.invoke(name, { body });
  if (!error) return data;

  const parsed = await readBody(error.context);
  if (parsed) return parsed;

  // The gateway answers before the function on a missing or expired token, and
  // does not always send JSON. That one is worth naming: it is the difference
  // between "this is broken" and "sign in again".
  if (error.context?.status === 401) return { error: "not_authenticated" };

  console.error(`${name} failed`, error);
  throw error;
}
