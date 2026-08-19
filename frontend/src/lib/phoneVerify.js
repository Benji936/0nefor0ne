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
 * Dial codes whose national numbers keep their leading zero in E.164.
 *
 * Italy is the well-known one: Rome is +39 06 …, and the 0 is part of the
 * number rather than a trunk prefix. Stripping it — which is right almost
 * everywhere else — produces an unroutable number, and Italian is one of the
 * four languages this app ships in.
 */
const KEEPS_LEADING_ZERO = new Set(["39"]);

/**
 * Drop the trunk prefix people type out of habit.
 *
 * Most of Europe writes its own numbers with a leading 0 — a French mobile is
 * "06 12 34 56 78" on every business card in the country — but E.164 wants
 * +33612345678. Typing the 0 is the single most likely way to enter a valid
 * number and be told it is wrong, so it is stripped rather than rejected.
 *
 * @param {string} national
 * @param {string} [dialCode] so the countries that keep their zero can be spared
 * @returns {string}
 */
export function stripTrunkPrefix(national, dialCode = "") {
  const digits = digitsOnly(national);
  if (KEEPS_LEADING_ZERO.has(digitsOnly(dialCode))) return digits;
  return digits.replace(/^0+/, "");
}

/**
 * Undo the country code when somebody has already included it.
 *
 * The field shows a "+33" prefix and people paste their whole number into it
 * anyway — "+33 6 12 34 56 78", or "0033…", or just "33…". Every one of those
 * used to be concatenated onto the prefix and sent as +3333612345678, which
 * Twilio rejects as an invalid number. It looked like a bad country to anybody
 * reading the error.
 *
 * The two explicit international markers are unambiguous and always honoured.
 * A bare repeated dial code is a judgement call, so it is only removed when
 * what remains is still long enough to be a real national number — that way a
 * genuine number which happens to begin with its own country's digits is left
 * alone.
 *
 * @param {string} dialCode
 * @param {string} national
 * @returns {string} the national part, digits only
 */
export function stripCountryCode(dialCode, national) {
  const dial = digitsOnly(dialCode);
  const raw = String(national ?? "").trim();
  if (!dial) return digitsOnly(raw);

  // Explicit international form: "+33…" or "0033…". No ambiguity here.
  const explicitlyInternational = raw.startsWith("+") || /^00\d/.test(digitsOnly(raw));
  let digits = digitsOnly(raw);
  if (digits.startsWith("00")) digits = digits.slice(2);

  if (digits.startsWith(dial)) {
    const remainder = digits.slice(dial.length);
    // 4 digits is the shortest thing that could still be a national number.
    // Below that, the leading digits were part of the number, not a country.
    if (explicitlyInternational || remainder.replace(/^0+/, "").length >= 4) {
      return remainder;
    }
  }
  return digits;
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

  const total = digitsOnly(dialCode).length
    + stripTrunkPrefix(stripCountryCode(dialCode, raw), dialCode).length;
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
  return `+${digitsOnly(dialCode)}${stripTrunkPrefix(stripCountryCode(dialCode, national), dialCode)}`;
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
 * Twilio's numeric error codes, which are the only unambiguous thing in a
 * provider failure. Supabase passes Twilio's message through verbatim,
 * including a docs URL ending in the code.
 *
 * Prose matching alone was actively harmful here: the endpoint is called
 * `phone_change`, so every message contains the substring "phone", and a rule
 * of "invalid AND phone" therefore matched *every* failure on this route. A
 * credentials rejection was reported to users as a bad phone number, which sent
 * them checking the one thing that was correct.
 */
const TWILIO_CODES = {
  20003: "providerAuth",   // Authentication Error — Supabase's Twilio credentials rejected
  20404: "providerAuth",   // resource not found, usually a wrong Account SID
  21211: "badNumber",      // Invalid 'To' phone number
  21212: "providerAuth",   // Invalid 'From' number — sender misconfigured
  21214: "badNumber",      // 'To' number not reachable
  21408: "regionBlocked",  // geo permissions not enabled for that country
  21606: "providerAuth",   // 'From' number not SMS-capable
  21608: "trialNumber",    // trial account, recipient not a verified caller ID
  21610: "unsubscribed",   // recipient has replied STOP
  21612: "badNumber",      // not reachable by SMS
  30006: "badNumber",      // landline or unreachable carrier
};

/** Pull a Twilio error code out of the message, or null. */
export function twilioCode(message) {
  const msg = String(message ?? "");
  const fromUrl = msg.match(/twilio\.com\/docs\/errors\/(\d{4,6})/);
  if (fromUrl) return Number(fromUrl[1]);
  const bare = msg.match(/\b(2\d{4}|3\d{4})\b/);
  return bare ? Number(bare[1]) : null;
}

/**
 * Map a Supabase auth failure onto a translation key.
 *
 * Codes first, prose second. The prose pass strips the endpoint name before
 * matching, so "phone_change" can never be mistaken for a statement about the
 * user's phone number.
 *
 * @param {unknown} err
 * @returns {string} an i18n key under phoneVerify.error
 */
export function authErrorKey(err) {
  const raw = String(err?.message ?? "");
  if (!raw) return "generic";

  const code = twilioCode(raw);
  if (code && TWILIO_CODES[code]) return TWILIO_CODES[code];

  // Remove the words that name the endpoint rather than the problem.
  const msg = raw.toLowerCase().replace(/phone_change|phone change|otp/g, " ");

  if (msg.includes("already been registered") || msg.includes("already registered")
      || msg.includes("already exists") || msg.includes("duplicate")) return "numberTaken";
  if (msg.includes("expired"))                              return "codeExpired";
  if (msg.includes("rate") || msg.includes("too many"))     return "rateLimited";
  if (msg.includes("permission") || msg.includes("region")) return "regionBlocked";
  if (msg.includes("invalid") && msg.includes("token"))     return "badCode";
  if (msg.includes("authentication") || msg.includes("unauthenticated")
      || msg.includes("credential"))                        return "providerAuth";
  if (msg.includes("invalid") && msg.includes("number"))    return "badNumber";
  // An unconfigured provider fails here, and it is worth its own sentence so
  // the owner recognises a setup problem instead of debugging the dialog.
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
  if (error) console.error("sendPhoneCode failed for", e164, "->", error);
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
  if (error) console.error("confirmPhoneCode failed for", e164, "->", error);
  return { error };
}
