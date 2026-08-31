import { describe, expect, it } from "vitest";
import {
  agreementIsCurrent,
  settlementTerms,
  tradeNextAction,
  tradePhase,
} from "./tradeWorkflow.js";

describe("tradePhase", () => {
  it("keeps legacy proposals compatible", () => {
    expect(tradePhase({ status: "pending" })).toBe("negotiation");
    expect(tradePhase({ status: "accepted" })).toBe("exchange");
    expect(tradePhase({ status: "completed" })).toBe("completed");
  });

  it("uses the explicit binder workflow phase when present", () => {
    expect(tradePhase({ workflow_phase: "selection" })).toBe("selection");
    expect(tradePhase({ workflow_phase: "agreement" })).toBe("agreement");
  });
});

describe("tradeNextAction", () => {
  it("asks the recipient to choose from the requester's binder", () => {
    expect(tradeNextAction({ workflow_phase: "selection", i_am_proposer: false }))
      .toBe("chooseReturnCards");
  });

  it("makes the requester wait during return selection", () => {
    expect(tradeNextAction({ workflow_phase: "selection", i_am_proposer: true }))
      .toBe("waitingForSelection");
  });

  it("asks only unconfirmed users to confirm the current revision", () => {
    const trade = { workflow_phase: "agreement", revision: 4, agreement_revision: 4 };
    expect(tradeNextAction({ ...trade, i_agreed_revision: null })).toBe("confirmAgreement");
    expect(tradeNextAction({ ...trade, i_agreed_revision: 4, they_agreed_revision: null }))
      .toBe("waitingForAgreement");
    expect(tradeNextAction({ ...trade, i_agreed_revision: 4, they_agreed_revision: 4 }))
      .toBe("agreementComplete");
  });
});

describe("agreementIsCurrent", () => {
  it("invalidates confirmation when the proposal revision changes", () => {
    expect(agreementIsCurrent(3, 3)).toBe(true);
    expect(agreementIsCurrent(3, 4)).toBe(false);
    expect(agreementIsCurrent(null, 4)).toBe(false);
  });
});


// ---------------------------------------------------------------------------
// How a trade settles, derived once for the two dialogs that decide it: the
// propose dialog and Suggest terms on the trade page. They used to derive it
// separately, and only one of them had a location picker at all — so a trade
// created through the staged workflow could be set to "in person" and never be
// told where.
// ---------------------------------------------------------------------------
const PLACE = { name: "Card Shop", city: "Antibes", lat: 43.58, lng: 7.12 };

describe("settlementTerms", () => {
  it("is in person once somewhere is actually named", () => {
    expect(settlementTerms({ deliveryMode: "location", meetupLocation: PLACE }))
      .toMatchObject({ trade_method: "in_person", meetup_location: PLACE });
  });

  it("names no method while the place is still unchosen", () => {
    // "In person, nowhere in particular" is not a plan, so the trade stays
    // undecided and the page keeps asking rather than claiming it is settled.
    expect(settlementTerms({ deliveryMode: "location", meetupLocation: null }))
      .toMatchObject({ trade_method: null, meetup_location: null });
  });

  it("mail clears the place rather than leaving a stale one behind", () => {
    expect(settlementTerms({ deliveryMode: "mail", meetupLocation: PLACE }))
      .toMatchObject({ trade_method: "mail", meetup_location: null });
  });

  it("defaults to meeting somewhere, which is what the picker opens on", () => {
    expect(settlementTerms({}).trade_method).toBeNull();
    expect(settlementTerms().meetup_location).toBeNull();
  });

  it("carries a cash offset with its payer", () => {
    expect(settlementTerms({ cashAmount: 12.5, cashPayer: "counterparty" }))
      .toMatchObject({ cash_amount: 12.5, cash_payer: "counterparty" });
  });

  it("drops the payer when there is no amount to pay", () => {
    // The database rejects a payer without an amount, so this cannot be left
    // to the caller to remember.
    expect(settlementTerms({ cashAmount: 0, cashPayer: "proposer" }))
      .toMatchObject({ cash_amount: null, cash_payer: null });
    expect(settlementTerms({ cashAmount: null, cashPayer: "proposer" }))
      .toMatchObject({ cash_amount: null, cash_payer: null });
  });

  it("ignores an amount that is not a number", () => {
    expect(settlementTerms({ cashAmount: "", cashPayer: "proposer" }).cash_amount).toBeNull();
    expect(settlementTerms({ cashAmount: "abc", cashPayer: "proposer" }).cash_amount).toBeNull();
  });

  it("reads a numeric string, which is what a number input hands over", () => {
    expect(settlementTerms({ cashAmount: "7.25", cashPayer: "proposer" }))
      .toMatchObject({ cash_amount: 7.25, cash_payer: "proposer" });
  });

  it("never returns a negative offset", () => {
    expect(settlementTerms({ cashAmount: -4, cashPayer: "proposer" }).cash_amount).toBeNull();
  });

  it("always returns the four columns the trade keeps", () => {
    expect(Object.keys(settlementTerms({})).sort())
      .toEqual(["cash_amount", "cash_payer", "meetup_location", "trade_method"]);
  });
});
