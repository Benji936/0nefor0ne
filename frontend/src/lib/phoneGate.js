/**
 * The shared "verify your number" prompt.
 *
 * One dialog, mounted once in App.vue, opened from wherever the server refuses
 * an action for want of a confirmed phone. The alternative was mounting
 * VerifyPhoneDialog into each trade surface and keeping three copies of the
 * open/closed state in sync, which is three chances for one of them to drift.
 *
 * Deliberately not an auto-retry. A person whose trade was refused still has
 * their proposal open with every card they picked still in it, so re-pressing
 * Send costs one click; replaying the action for them would mean each call site
 * knowing how to finish somebody else's half-done work, and getting that wrong
 * sends a trade the person may have changed their mind about.
 */

import { ref } from "vue";
import { isPhoneRequiredError } from "@/lib/phoneVerify";

/**
 * Module-level and therefore shared across SSR requests. Safe here because it
 * only ever changes in response to a click: prerendering always sees it closed.
 */
const promptOpen = ref(false);
const promptReason = ref("propose");

export function usePhoneGate() {
  return { promptOpen, promptReason };
}

/**
 * Open the prompt.
 * @param {"propose"|"accept"|"counter"} reason what was being attempted, which
 *   is the only thing that changes the dialog's subtitle.
 */
export function promptPhoneVerification(reason = "propose") {
  promptReason.value = reason;
  promptOpen.value = true;
}

/**
 * If this error is the trade gate, open the prompt and report that it was
 * handled, so the caller can skip its own error message.
 *
 * Call sites funnel every failure through one handler, so this slots in there
 * rather than wrapping each action.
 *
 * @param {unknown} err
 * @param {"propose"|"accept"|"counter"} reason
 * @returns {boolean} true when the prompt was opened and the caller should stay quiet
 */
export function handleIfPhoneRequired(err, reason = "propose") {
  if (!isPhoneRequiredError(err)) return false;
  promptPhoneVerification(reason);
  return true;
}
