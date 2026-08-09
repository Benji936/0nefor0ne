import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
vi.mock("@/lib/supabaseClient", () => ({
  getClient: () => ({ functions: { invoke } }),
}));

const { invokeFunction } = await import("./edgeFunction");

/** A FunctionsHttpError as supabase-js builds it: the body is unread, on .context. */
function httpError(status, body) {
  return {
    message: "Edge Function returned a non-2xx status code",
    context: {
      status,
      json: async () => {
        if (body === undefined) throw new SyntaxError("Unexpected end of JSON input");
        return body;
      },
    },
  };
}

beforeEach(() => invoke.mockReset());

describe("invokeFunction", () => {
  it("returns the body on success", async () => {
    invoke.mockResolvedValue({ data: { url: "https://checkout" }, error: null });
    expect(await invokeFunction("claim-create-checkout", { community_id: 1 }))
      .toEqual({ url: "https://checkout" });
  });

  it("returns the body of a non-2xx instead of losing it", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(409, { error: "already_own_one" }) });
    expect(await invokeFunction("claim-create-checkout", {}))
      .toEqual({ error: "already_own_one" });
  });

  it("reads a 503 the same way, so interval_unavailable reaches the caller", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(503, { error: "interval_unavailable" }) });
    expect((await invokeFunction("claim-create-checkout", {})).error).toBe("interval_unavailable");
  });

  it("names an unauthenticated gateway refusal that carries no JSON", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(401, undefined) });
    expect(await invokeFunction("admin-review", {})).toEqual({ error: "not_authenticated" });
  });

  it("prefers the function's own body over the status guess", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(401, { error: "not_authenticated", detail: "expired" }) });
    expect(await invokeFunction("admin-review", {}))
      .toEqual({ error: "not_authenticated", detail: "expired" });
  });

  it("throws when there is no body and no status worth naming", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(500, undefined) });
    await expect(invokeFunction("claim-portal", {})).rejects.toBeTruthy();
  });

  it("throws on a network failure, which has no context at all", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } });
    await expect(invokeFunction("claim-portal", {})).rejects.toBeTruthy();
  });

  it("passes the body through as the function's payload, not wrapped again", async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    await invokeFunction("community-release", { community_id: 7, intent: "delete" });
    expect(invoke).toHaveBeenCalledWith("community-release", {
      body: { community_id: 7, intent: "delete" },
    });
  });
});
