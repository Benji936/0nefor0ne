// Deciding what a /tournament subcommand actually meant, and saying what went
// wrong when it did.
//
// Both are pure, and both are the sort of thing that quietly rots when it lives
// inside an interaction handler: "which tournament did they mean" has four
// answers depending on how many are running, and "what do I tell them" has to
// turn a plpgsql RAISE EXCEPTION into a sentence a player can act on.

/** Tournaments you can still get into. */
const JOINABLE = new Set(['registration', 'check_in']);
/** Tournaments that are being played. */
const PLAYING = new Set(['active']);

const SCOPES = {
  join: JOINABLE,
  checkin: JOINABLE,
  // Dropping out is possible right up until the event ends, so it is the only
  // one that accepts both.
  drop: new Set([...JOINABLE, ...PLAYING]),
  pairing: PLAYING,
  round: PLAYING,
  standings: new Set([...JOINABLE, ...PLAYING]),
};

/**
 * Which tournament the user meant.
 *
 * The id is optional on every subcommand, so most of the work is guessing well:
 * with one candidate there is nothing to ask, and with none there is nothing to
 * ask about either. Only a genuine choice produces a question.
 *
 * An explicit id is checked against this server's list rather than trusted.
 * The RPCs would refuse a foreign tournament anyway — they resolve permissions
 * from the account, not the guild — but "that is not running here" is a better
 * answer than a permission error about somebody else's event.
 *
 * Returns { ok: true, tournament } or { ok: false, reason, candidates }.
 */
function pickTournament(rows, requestedId, subcommand) {
  const all = Array.isArray(rows) ? rows.filter(Boolean) : [];

  if (requestedId != null) {
    const found = all.find((t) => Number(t.tournament_id) === Number(requestedId));
    return found ? { ok: true, tournament: found } : { ok: false, reason: 'not_here' };
  }

  const scope = SCOPES[subcommand] ?? PLAYING;
  const candidates = all.filter((t) => scope.has(t.status));

  if (candidates.length === 1) return { ok: true, tournament: candidates[0] };
  if (candidates.length === 0) {
    // Distinguish "this server runs nothing" from "nothing is at the right
    // stage", because the second one is a wait and the first one is a setup
    // problem, and telling somebody to wait for a tournament that does not
    // exist is the more annoying of the two mistakes.
    return { ok: false, reason: all.length === 0 ? 'none_here' : 'none_at_stage' };
  }
  return { ok: false, reason: 'ambiguous', candidates };
}

/** What to say when pickTournament could not decide. */
function pickMessage(result, subcommand) {
  switch (result.reason) {
    case 'not_here':
      return 'That tournament is not running in this server. Try `/tournament list`.';
    case 'none_here':
      return 'This server is not running any tournaments right now. `/tournament list` shows them when it is.';
    case 'none_at_stage':
      return subcommand === 'join' || subcommand === 'checkin'
        ? 'Nothing is open for sign-ups right now. `/tournament list` shows what is running.'
        : 'Nothing is under way right now. `/tournament list` shows what is running.';
    case 'ambiguous': {
      const lines = (result.candidates ?? [])
        .slice(0, 8)
        .map((t) => `• \`id:${t.tournament_id}\` — ${t.name}`);
      return [`More than one is running. Say which:`, ...lines].join('\n');
    }
    default:
      return 'Could not work out which tournament you meant.';
  }
}

/**
 * A database refusal, as a sentence.
 *
 * The RPCs raise deliberate, specific messages — "registration is closed",
 * "tournament is full", "only the organizer can start a round" — and those are
 * exactly what somebody needs to hear. This maps the ones worth rewording and
 * passes the rest through, rather than replacing a precise refusal with a
 * generic apology.
 *
 * `no_account` is the one that must be rewritten: the raw message means nothing
 * to a player, and the fix is a link.
 */
function friendlyError(err, appUrl) {
  const raw = String(err?.message ?? err ?? '').trim();

  if (/no_account/.test(raw)) {
    return `Your Discord account is not linked to 0nefor.one yet. Sign in with Discord at ${appUrl} and run this again — it takes a few seconds.`;
  }
  if (/not authenticated/i.test(raw)) {
    return `Sign in with Discord at ${appUrl} first, then try again.`;
  }
  if (/only the organizer/i.test(raw)) {
    return 'Only the organizer can do that.';
  }
  if (/registration is closed/i.test(raw)) {
    return 'Registration is closed for that one.';
  }
  if (/tournament is full/i.test(raw)) {
    return 'That tournament is full.';
  }
  if (/you are not registered/i.test(raw)) {
    return 'You are not registered for that tournament.';
  }
  if (/check-in is not open/i.test(raw)) {
    return 'Check-in has not opened yet.';
  }
  if (/unfinished match/i.test(raw)) {
    // The most common organizer error, and the message already names the count.
    return `Not yet — ${raw.replace(/^.*?round/i, 'round')}.`;
  }
  if (/at least 2/i.test(raw)) {
    return 'There are not enough players yet.';
  }

  // Anything unrecognised: say something happened and log the rest. A raw
  // Postgres error in a public channel helps nobody and leaks table names.
  return null;
}

/** The line the bot posts after pairing a round from Discord. */
function roundStartedMessage(result) {
  if (!result) return 'Round started.';
  if (result.created === false) {
    return `Round ${result.round_number} was already paired.`;
  }
  const bye = result.bye ? ' One player has the bye.' : '';
  return `Round ${result.round_number} is paired — ${result.matches} table(s).${bye}`;
}

module.exports = { pickTournament, pickMessage, friendlyError, roundStartedMessage, SCOPES };
