/**
 * Phone verification, used as a gate on trading rather than on signing up.
 *
 * The point is one person per account: auth.users.phone carries a unique index,
 * so a confirmed number belongs to exactly one account and somebody farming
 * throwaway accounts needs a real SIM for each one. Signing up, browsing and
 * building a collection stay free, because none of those can hurt anybody.
 *
 * The gate that matters is the database trigger in
 * supabase/migrations/20260818_phone_gate_trading.sql. Everything here is the
 * courteous half: it asks before the server has to refuse, and turns a refusal
 * into a dialog rather than a stack trace. None of it is a security boundary —
 * the RPCs are reachable with the public anon key, so the client is assumed
 * hostile and the trigger is what actually decides.
 */

import { getClient } from "@/lib/supabaseClient";

/**
 * SQLSTATE raised by require_phone_verified_to_trade().
 *
 * Part of the contract with the migration. Changing it here without changing
 * it there turns the verify prompt back into a raw error toast.
 */
export const PHONE_REQUIRED_SQLSTATE = "P0002";

/** E.164 allows at most 15 digits in total, country code included. */
const E164_MAX_DIGITS = 15;
/** Shortest plausible full number. Below this it is a typo, not a country. */
const E164_MIN_DIGITS = 8;
export const OTP_LENGTH = 6;

/** Everything that is not a digit, including the spaces people paste in. */
function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

/**
 * Drop the trunk prefix people type out of habit.
 *
 * Most of Europe writes its own numbers with a leading 0 — a French mobile is
 * "06 12 34 56 78" on every business card in the country — but E.164 wants
 * +33612345678. Typing the 0 is the single most likely way to enter a valid
 * number and be told it is wrong, so it is stripped rather than rejected.
 *
 * @param {string} national
 * @returns {string}
 */
export function stripTrunkPrefix(national) {
  return digitsOnly(national).replace(/^0+/, "");
}

/**
 * Why this number cannot be used, or null when it can.
 *
 * @param {string} dialCode country calling code, no plus
 * @param {string} national the part the person typed
 * @returns {"empty"|"notDigits"|"tooShort"|"tooLong"|"noCountry"|null}
 */
export function phoneProblem(dialCode, national) {
  if (!digitsOnly(dialCode)) return "noCountry";

  const raw = String(national ?? "").trim();
  if (!raw) return "empty";

  // Letters are a different mistake from a wrong length and deserve a
  // different sentence: it is usually a pasted "+33 (0)6 12 34 56 78 ext 4".
  if (/[a-z]/i.test(raw)) return "notDigits";

  const total = digitsOnly(dialCode).length + stripTrunkPrefix(raw).length;
  if (total < E164_MIN_DIGITS) return "tooShort";
  if (total > E164_MAX_DIGITS) return "tooLong";
  return null;
}

/**
 * Assemble the E.164 string Supabase expects, or null if it would be invalid.
 *
 * @param {string} dialCode
 * @param {string} national
 * @returns {string|null} e.g. "+33612345678"
 */
export function toE164(dialCode, national) {
  if (phoneProblem(dialCode, national)) return null;
  return `+${digitsOnly(dialCode)}${stripTrunkPrefix(national)}`;
}

/**
 * Why this code cannot be submitted, or null when it can.
 * @param {string} code
 * @returns {"empty"|"length"|null}
 */
export function otpProblem(code) {
  const digits = digitsOnly(code);
  if (!digits) return "empty";
  if (digits.length !== OTP_LENGTH) return "length";
  return null;
}

/**
 * Whether this error is the trade gate asking for a number.
 *
 * Matches the SQLSTATE rather than the message, because the message is English
 * and Postgres error text is not something to parse in four locales. The string
 * fallback exists because supabase-js flattens some RPC failures into a plain
 * Error before the `code` field survives.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isPhoneRequiredError(err) {
  if (!err) return false;
  if (err.code === PHONE_REQUIRED_SQLSTATE) return true;
  return typeof err.message === "string"
    && err.message.includes("phone verification required to trade");
}

/**
 * Map a Supabase auth failure onto a translation key.
 *
 * The one that matters is the taken number: it is the whole feature working as
 * intended, and it has to read as "this number is already in use" rather than
 * as a bug. Supabase phrases it a few different ways depending on version, so
 * this matches loosely on purpose.
 *
 * @param {unknown} err
 * @returns {string} an i18n key under phoneVerify.error
 */
export function authErrorKey(err) {
  const msg = String(err?.message ?? "").toLowerCase();
  if (!msg) return "generic";
  if (msg.includes("already been registered") || msg.includes("already registered")
      || msg.includes("already exists") || msg.includes("duplicate")) return "numberTaken";
  if (msg.includes("invalid") && msg.includes("token"))  return "badCode";
  if (msg.includes("expired"))                           return "codeExpired";
  if (msg.includes("rate") || msg.includes("too many"))  return "rateLimited";
  if (msg.includes("invalid") && msg.includes("phone"))  return "badNumber";
  // An unconfigured SMS provider fails here, and it is worth its own sentence
  // so the owner recognises it instead of debugging the dialog.
  if (msg.includes("sms") || msg.includes("provider") || msg.includes("not enabled")) return "smsUnavailable";
  return "generic";
}

// ── Calls ─────────────────────────────────────────────────────────────────

/**
 * Whether the gate is switched on at all.
 *
 * Read from the database rather than a build-time constant so it can be turned
 * on the day an SMS provider is configured, without a deploy. Failure answers
 * false: if this cannot be read, the honest thing is to not demand a number the
 * server may not even be asking for.
 *
 * @returns {Promise<boolean>}
 */
export async function isPhoneGateEnabled() {
  const { data, error } = await getClient().rpc("phone_gate_enabled");
  if (error) {
    console.error("phone_gate_enabled failed", error);
    return false;
  }
  return data === true;
}

/**
 * Whether the signed-in account already has a confirmed number.
 *
 * Asks the server rather than reading session.user.phone_confirmed_at, because
 * that claim is baked into the JWT and stays stale until the token refreshes —
 * which would tell somebody who just verified that they still have not.
 *
 * @returns {Promise<boolean>}
 */
export async function isMyPhoneVerified() {
  const { data, error } = await getClient().rpc("is_phone_verified");
  if (error) {
    console.error("is_phone_verified failed", error);
    return false;
  }
  return data === true;
}

/**
 * Attach a number to the signed-in account and send it an SMS code.
 * @param {string} e164
 * @returns {Promise<{error: unknown}>}
 */
export async function sendPhoneCode(e164) {
  const { error } = await getClient().auth.updateUser({ phone: e164 });
  return { error };
}

/**
 * Confirm the code. `phone_change` is the type for adding a number to an
 * account that already exists, which is every case here — this flow is never
 * how somebody signs in.
 *
 * @param {string} e164
 * @param {string} code
 * @returns {Promise<{error: unknown}>}
 */
export async function confirmPhoneCode(e164, code) {
  const { error } = await getClient().auth.verifyOtp({
    phone: e164,
    token: digitsOnly(code),
    type: "phone_change",
  });
  return { error };
}
