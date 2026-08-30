import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabaseClient", () => ({ getClient: () => ({ rpc }) }));

const { createTradeRequest, submitTradeReturnSelection, reviseMyTradeRequest, reviseTradeTerms, confirmTradeAgreement } = await import("./proposals.js");

beforeEach(() => rpc.mockReset());

describe("staged trade RPCs", () => {
  it("creates an interest request with only counterparty cards", async () => {
    rpc.mockResolvedValue({ data: 42, error: null });
    await expect(createTradeRequest("alex", [{ card_id: 8, quantity: 1 }])).resolves.toBe(42);
    expect(rpc).toHaveBeenCalledWith("create_trade_request", {
      counterparty: "alex", requested: [{ card_id: 8, quantity: 1 }],
    });
  });

  it("submits the recipient's return selection", async () => {
    rpc.mockResolvedValue({ data: 2, error: null });
    await expect(submitTradeReturnSelection(42, [{ card_id: 9, quantity: 2 }])).resolves.toBe(2);
    expect(rpc).toHaveBeenCalledWith("submit_trade_return_selection", {
      p_trade_id: 42, requested: [{ card_id: 9, quantity: 2 }],
    });
  });

  it("confirms an exact revision to prevent stale agreement", async () => {
    rpc.mockResolvedValue({ data: { status: "confirmed" }, error: null });
    await confirmTradeAgreement(42, 3);
    expect(rpc).toHaveBeenCalledWith("confirm_trade_agreement", { p_trade_id: 42, p_revision: 3 });
  });

  it("revises only the cards the caller wants and carries the observed revision", async () => {
    rpc.mockResolvedValue({ data: 4, error: null });
    await expect(reviseMyTradeRequest(42, 3, [{ card_id: 10, quantity: 1 }])).resolves.toBe(4);
    expect(rpc).toHaveBeenCalledWith("revise_my_trade_request", {
      p_trade_id: 42, p_revision: 3, requested: [{ card_id: 10, quantity: 1 }],
    });
  });

  it("revises settlement terms and invalidates agreement through a new revision", async () => {
    rpc.mockResolvedValue({ data: 5, error: null });
    await reviseTradeTerms(42, 4, { trade_method: "mail", cash_amount: 8, cash_payer: "proposer" });
    expect(rpc).toHaveBeenCalledWith("revise_trade_terms", {
      p_trade_id: 42, p_revision: 4, p_trade_method: "mail", p_cash_amount: 8,
      p_cash_payer: "proposer", p_meetup_location: null,
    });
  });
});
