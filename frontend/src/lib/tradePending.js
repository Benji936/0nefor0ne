/**
 * What a pending proposal is actually waiting on.
 *
 * The list used to answer this with a constant: the proposer was always told
 * "waiting for them to upload photos and accept", even when the proposer was
 * the one who had not uploaded. Two people could sit reading that message about
 * each other while the trade went nowhere.
 *
 * Now the row knows, because fetch_my_proposals returns i_uploaded and
 * they_uploaded (see supabase/migrations/20260811_proposal_photo_state.sql).
 *
 * The recipient's row does not mention photos at all. Photos are advisory, not
 * a gate, and the recipient is the one person here who can move the trade
 * forward — telling them about a missing photo instead of "this is yours to
 * answer" buries the action under a caveat. The caveat belongs in the detail
 * dialog, next to the Accept button, where it can be acted on.
 */

/**
 * @param {{i_am_proposer?:boolean, i_uploaded?:boolean, they_uploaded?:boolean}} proposal
 * @returns {"yoursToReview"|"photoYoursMissing"|"photoTheirsMissing"|"waitingAccept"}
 */
export function pendingWaitKey(proposal) {
  if (!proposal?.i_am_proposer) return "yoursToReview";
  if (!proposal.i_uploaded)     return "photoYoursMissing";
  if (!proposal.they_uploaded)  return "photoTheirsMissing";
  return "waitingAccept";
}

/**
 * Whether accepting right now would go through without either side having
 * shown their cards. Not a block — the trade is allowed — but the one moment
 * worth saying so out loud, because after accepting it is too late to ask.
 */
export function acceptingBlind(proposal) {
  return !(proposal?.i_uploaded && proposal?.they_uploaded);
}

/**
 * What to say next to the "Confirm your side" button on an accepted trade.
 *
 * Photos were a hard gate here long after they had stopped being one on the
 * Accept button, and the two sides of the trade could deadlock on it: the
 * server recorded a confirmation and then raised on the missing photo, which
 * rolled the confirmation back with it. The second person to confirm could
 * never make their confirmation stick, so the trade could not complete at all.
 *
 * Photos are advice on this button for the same reason they are advice on
 * Accept: the cards have already changed hands by the time anyone is here, and
 * refusing to record that only desynchronises the app from reality.
 *
 * i_confirmed is checked first. Now that confirming without photos is allowed,
 * the missing-photo line would otherwise outrank "waiting for them" and tell
 * somebody who has already done their part to go do it.
 *
 * @param {{i_confirmed?:boolean, i_uploaded?:boolean, they_uploaded?:boolean}} proposal
 * @returns {"waitingForConfirmDetail"|"confirmWithoutPhotos"|"bothUploadedConfirmHint"}
 */
export function confirmHintKey(proposal) {
  if (proposal?.i_confirmed) return "waitingForConfirmDetail";
  if (acceptingBlind(proposal)) return "confirmWithoutPhotos";
  return "bothUploadedConfirmHint";
}
