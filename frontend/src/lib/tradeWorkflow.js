const LEGACY_PHASE = {
  pending: "negotiation",
  accepted: "exchange",
  completed: "completed",
  declined: "cancelled",
  cancelled: "cancelled",
};

export function tradePhase(trade) {
  return trade?.workflow_phase ?? LEGACY_PHASE[trade?.status] ?? "negotiation";
}

export function agreementIsCurrent(confirmedRevision, revision) {
  return Number.isInteger(confirmedRevision)
    && Number.isInteger(revision)
    && confirmedRevision === revision;
}

export function tradeNextAction(trade) {
  const phase = tradePhase(trade);
  if (phase === "selection") {
    return trade?.i_am_proposer ? "waitingForSelection" : "chooseReturnCards";
  }
  if (phase === "agreement") {
    if (!agreementIsCurrent(trade?.i_agreed_revision, trade?.revision)) return "confirmAgreement";
    if (!agreementIsCurrent(trade?.they_agreed_revision, trade?.revision)) return "waitingForAgreement";
    return "agreementComplete";
  }
  if (phase === "exchange") return "exchangeInProgress";
  return "reviewTrade";
}
