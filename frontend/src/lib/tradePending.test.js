import { describe, it, expect } from "vitest";
import { pendingWaitKey, acceptingBlind } from "./tradePending.js";

const proposer = (over = {}) => ({ i_am_proposer: true, i_uploaded: false, they_uploaded: false, ...over });

describe("pendingWaitKey", () => {
  it("names the proposer as the blocker when the proposer has no photo", () => {
    // The bug this replaces: this case used to read "waiting for them".
    expect(pendingWaitKey(proposer())).toBe("photoYoursMissing");
    expect(pendingWaitKey(proposer({ they_uploaded: true }))).toBe("photoYoursMissing");
  });

  it("names the counterparty once the proposer has uploaded", () => {
    expect(pendingWaitKey(proposer({ i_uploaded: true }))).toBe("photoTheirsMissing");
  });

  it("waits on the answer once both photos are in", () => {
    expect(pendingWaitKey(proposer({ i_uploaded: true, they_uploaded: true }))).toBe("waitingAccept");
  });

  it("tells the recipient it is theirs to answer, whatever the photos say", () => {
    for (const photos of [
      { i_uploaded: false, they_uploaded: false },
      { i_uploaded: true,  they_uploaded: false },
      { i_uploaded: false, they_uploaded: true  },
      { i_uploaded: true,  they_uploaded: true  },
    ]) {
      expect(pendingWaitKey({ i_am_proposer: false, ...photos })).toBe("yoursToReview");
    }
  });

  it("treats a row with no photo fields as the recipient's or the proposer's own gap", () => {
    // Rows fetched before the migration carry undefined rather than false.
    expect(pendingWaitKey({ i_am_proposer: true })).toBe("photoYoursMissing");
    expect(pendingWaitKey({})).toBe("yoursToReview");
    expect(pendingWaitKey(null)).toBe("yoursToReview");
  });
});

describe("acceptingBlind", () => {
  it("is false only when both sides have shown their cards", () => {
    expect(acceptingBlind({ i_uploaded: true, they_uploaded: true })).toBe(false);
  });

  it("is true whenever either side is missing", () => {
    expect(acceptingBlind({ i_uploaded: true,  they_uploaded: false })).toBe(true);
    expect(acceptingBlind({ i_uploaded: false, they_uploaded: true  })).toBe(true);
    expect(acceptingBlind({})).toBe(true);
    expect(acceptingBlind(null)).toBe(true);
  });
});
