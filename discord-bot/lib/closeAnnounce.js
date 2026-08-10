// Who may close a listing, and what closing it means.
//
// Pure on purpose: this is the security-relevant half of the !close command, and
// the interesting cases are all about absent values (a community announce has no
// seller; a Discord user with no 0nefor.one account has no id). A loose
// comparison here would hand strangers the keys to other people's listings, so
// it is worth testing away from Discord and Supabase.

/** Commands that close a listing, and the status each one records. */
const CLOSE_STATUS = {
  '!sold':   'sold',
  '!found':  'sold',      // the Looking For wording for the same happy ending
  '!close':  'archived',
  '!cancel': 'archived',
};

const CLOSE_COMMANDS = new Set(Object.keys(CLOSE_STATUS));

function isCloseCommand(word) {
  return CLOSE_COMMANDS.has(String(word ?? '').trim().toLowerCase());
}

/** 'sold' for the happy ending, 'archived' for "never mind". Null if not a close command. */
function closedStatusFor(word) {
  return CLOSE_STATUS[String(word ?? '').trim().toLowerCase()] ?? null;
}

/**
 * May this Discord user close this announce?
 *
 * @param {object}  announce         row with { seller, discord_author_id }
 * @param {string?} discordUserId    the Discord id of whoever typed the command
 * @param {string?} supabaseUserId   their 0nefor.one account id, if they have one
 * @param {boolean} isMod            they hold Manage Server / Manage Messages
 */
function canCloseAnnounce({ announce, discordUserId, supabaseUserId, isMod = false }) {
  if (!announce) return false;

  // Every arm requires both sides to be present. Without the truthiness guards,
  // a null seller and a signed-out visitor would compare equal and every
  // community announce would be closable by anyone who could see its thread.
  const ownsViaAccount =
    !!announce.seller && !!supabaseUserId && announce.seller === supabaseUserId;
  const ownsViaDiscord =
    !!announce.discord_author_id && !!discordUserId &&
    announce.discord_author_id === discordUserId;

  return ownsViaAccount || ownsViaDiscord || !!isMod;
}

module.exports = { CLOSE_COMMANDS, isCloseCommand, closedStatusFor, canCloseAnnounce };
