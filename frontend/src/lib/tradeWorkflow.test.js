import { describe, expect, it } from "vitest";
import {
  agreementIsCurrent,
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
