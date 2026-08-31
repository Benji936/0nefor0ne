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


/**
 * settlementTerms({ deliveryMode, meetupLocation, cashAmount, cashPayer })
 *
 * How a trade settles, as the four columns the database keeps: trade_method,
 * meetup_location, cash_amount, cash_payer.
 *
 * Two surfaces decide this — the propose dialog when a legacy offer is edited
 * or countered, and the Suggest terms dialog on the trade page — and they were
 * deriving it separately, which is how "in person" and "nowhere in particular"
 * end up meaning different things on two screens. The rules, once:
 *
 * - Meeting somewhere is only `in_person` once somewhere is actually named. A
 *   trade set to in person with no place is not a plan, so the method stays
 *   null and the page keeps asking.
 * - Mail clears the place outright rather than leaving a stale one behind for
 *   whoever reads the trade next. `revise_trade_terms` does the same on its
 *   side, so the two agree instead of one undoing the other.
 * - Cash needs a real amount before it needs a payer. A payer without an amount
 *   is a question nobody asked, and the database rejects it.
 */
export function settlementTerms({
  deliveryMode = "location",
  meetupLocation = null,
  cashAmount = null,
  cashPayer = null,
} = {}) {
  const isMail = deliveryMode === "mail";
  const amount = Number(cashAmount);
  const hasCash = Number.isFinite(amount) && amount > 0;
  return {
    trade_method: isMail ? "mail" : (meetupLocation ? "in_person" : null),
    meetup_location: isMail ? null : (meetupLocation ?? null),
    cash_amount: hasCash ? amount : null,
    cash_payer: hasCash ? cashPayer : null,
  };
}
