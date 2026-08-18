import { describe, it, expect } from "vitest";
import {
  PHONE_REQUIRED_SQLSTATE, OTP_LENGTH,
  stripTrunkPrefix, phoneProblem, toE164, otpProblem,
  isPhoneRequiredError, authErrorKey,
} from "./phoneVerify";

describe("stripTrunkPrefix", () => {
  it("drops the leading zero Europeans write on their own numbers", () => {
    // A French mobile is "06 12 34 56 78" on every business card in France,
    // but E.164 is +33612345678. Rejecting it would fail the most likely
    // correct input.
    expect(stripTrunkPrefix("0612345678")).toBe("612345678");
  });

  it("drops separators people paste", () => {
    expect(stripTrunkPrefix("06 12 34 56 78")).toBe("612345678");
    expect(stripTrunkPrefix("06-12-34-56-78")).toBe("612345678");
    expect(stripTrunkPrefix("(0)612345678")).toBe("612345678");
  });

  it("leaves a number that has no trunk prefix alone", () => {
    expect(stripTrunkPrefix("612345678")).toBe("612345678");
  });

  it("does not eat interior zeros", () => {
    expect(stripTrunkPrefix("6012345")).toBe("6012345");
  });
});

describe("phoneProblem", () => {
  it("accepts a normal number, with or without the trunk zero", () => {
    expect(phoneProblem("33", "612345678")).toBe(null);
    expect(phoneProblem("33", "0612345678")).toBe(null);
    expect(phoneProblem("1", "4155552671")).toBe(null);
  });

  it("names an empty number and a missing country separately", () => {
    expect(phoneProblem("33", "")).toBe("empty");
    expect(phoneProblem("33", "   ")).toBe("empty");
    expect(phoneProblem("", "612345678")).toBe("noCountry");
  });

  it("calls out letters rather than blaming the length", () => {
    // Usually a pasted "+33 (0)6 12 34 56 78 ext 4" — a different mistake
    // from a short number, and it deserves a different sentence.
    expect(phoneProblem("33", "61234567x")).toBe("notDigits");
  });

  it("rejects numbers outside E.164 length", () => {
    expect(phoneProblem("33", "612")).toBe("tooShort");
    expect(phoneProblem("33", "6123456789012345")).toBe("tooLong");
  });

  it("counts the dial code toward the 15-digit ceiling", () => {
    // 4-digit dial code + 12 digits = 16, over the limit, even though the
    // national part alone would pass.
    expect(phoneProblem("1268", "123456789012")).toBe("tooLong");
    expect(phoneProblem("1268", "1234567")).toBe(null);
  });
});

describe("toE164", () => {
  it("assembles the format Supabase wants", () => {
    expect(toE164("33", "0612345678")).toBe("+33612345678");
    expect(toE164("1", "415 555 2671")).toBe("+14155552671");
  });

  it("answers null for anything invalid rather than a broken string", () => {
    expect(toE164("33", "")).toBe(null);
    expect(toE164("", "612345678")).toBe(null);
    expect(toE164("33", "612")).toBe(null);
    expect(toE164("33", "61234567x")).toBe(null);
  });
});

describe("otpProblem", () => {
  it("accepts exactly six digits", () => {
    expect(otpProblem("123456")).toBe(null);
    expect(otpProblem("123 456")).toBe(null);
    expect(OTP_LENGTH).toBe(6);
  });

  it("rejects wrong length and empty", () => {
    expect(otpProblem("")).toBe("empty");
    expect(otpProblem("12345")).toBe("length");
    expect(otpProblem("1234567")).toBe("length");
    expect(otpProblem("abcdef")).toBe("empty");
  });
});

describe("isPhoneRequiredError", () => {
  it("recognises the trigger's SQLSTATE", () => {
    expect(isPhoneRequiredError({ code: PHONE_REQUIRED_SQLSTATE })).toBe(true);
  });

  it("recognises the flattened message form", () => {
    // supabase-js loses the `code` field on some RPC failures.
    expect(isPhoneRequiredError(new Error("phone verification required to trade"))).toBe(true);
  });

  it("does not claim unrelated failures", () => {
    expect(isPhoneRequiredError(null)).toBe(false);
    expect(isPhoneRequiredError(undefined)).toBe(false);
    expect(isPhoneRequiredError({ code: "23505" })).toBe(false);
    expect(isPhoneRequiredError(new Error("network request failed"))).toBe(false);
    // P0001 is the generic RAISE used elsewhere in this schema, e.g. the
    // find_matches "must be authenticated" error. Must not be mistaken for it.
    expect(isPhoneRequiredError({ code: "P0001", message: "must be authenticated" })).toBe(false);
  });
});

describe("authErrorKey", () => {
  it("maps a number already in use to its own message", () => {
    // This is the feature working, not a fault, and must not read as a crash.
    expect(authErrorKey({ message: "Phone number already been registered" })).toBe("numberTaken");
    expect(authErrorKey({ message: "duplicate key value violates unique constraint" })).toBe("numberTaken");
  });

  it("maps the ordinary code failures", () => {
    expect(authErrorKey({ message: "Invalid token" })).toBe("badCode");
    expect(authErrorKey({ message: "Token has expired" })).toBe("codeExpired");
    expect(authErrorKey({ message: "Too many requests" })).toBe("rateLimited");
  });

  it("gives an unconfigured SMS provider its own message", () => {
    // So the owner recognises a setup problem instead of debugging the dialog.
    expect(authErrorKey({ message: "Unsupported phone provider" })).toBe("smsUnavailable");
    expect(authErrorKey({ message: "SMS provider is not enabled" })).toBe("smsUnavailable");
  });

  it("falls back to generic for anything unrecognised or absent", () => {
    expect(authErrorKey({ message: "something nobody predicted" })).toBe("generic");
    expect(authErrorKey(null)).toBe("generic");
    expect(authErrorKey({})).toBe("generic");
  });
});
