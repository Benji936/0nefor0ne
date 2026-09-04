// Turning what the room played into what the tournament row expects.
//
// The duel counts rounds by Discord user id, because that is who is sitting at
// the table. `tournament_match` counts them as score_a and score_b, in the
// order the pairing was made. Getting that mapping backwards files a loss as a
// win, which is the single worst thing this whole feature could do — so it is
// done once, here, where it can be tested, rather than inline at the call site.

import { matchScore, matchWinner, roundsToWin } from './duelReducer.js';

/**
 * The match's games in the row's A/B order.
 *
 * `unknown` counts rounds won by somebody the seat map does not place. That is
 * not a rounding error to swallow: a third person in the voice channel who taps
 * "won" is a real thing, and filing a score that quietly drops their rounds
 * would be worse than refusing. The caller must check it.
 */
export function matchScoreForRow(match, tournament) {
  const tally = matchScore(match);
  const seats = tournament?.seats ?? {};
  let scoreA = 0;
  let scoreB = 0;
  let unknown = 0;

  for (const [uid, won] of Object.entries(tally)) {
    const entrant = seats[uid];
    if (entrant != null && entrant === tournament?.playerA) scoreA += won;
    else if (entrant != null && entrant === tournament?.playerB) scoreB += won;
    else unknown += won;
  }

  // Every round in this client has a winner, so there is no drawn-game count to
  // derive. The column exists because a match can time out on the table with a
  // game unfinished, and that is reported on the website rather than here.
  return { scoreA, scoreB, draws: 0, unknown };
}

/**
 * Whether the result can be filed, and if not, why in one sentence.
 *
 * Deliberately permissive about the match being *decided*: a tournament match
 * that ran out of time at one game each is a real result, and refusing to file
 * it would push the players into inventing a third game. What it refuses is a
 * score that would be wrong or meaningless.
 */
export function canReport(state) {
  const tournament = state?.tournament;
  if (!tournament) return { ok: false, reason: 'This duel is not a tournament match.' };
  if (state.reported) return { ok: false, reason: 'Already reported.' };

  const rounds = state.match?.rounds?.length ?? 0;
  if (rounds === 0) return { ok: false, reason: 'Play a game first.' };

  const { scoreA, scoreB, unknown } = matchScoreForRow(state.match, tournament);
  if (unknown > 0) {
    return {
      ok: false,
      reason: 'Someone at this table is not in the pairing. Report this one on 0nefor.one.',
    };
  }

  const need = roundsToWin(state.match?.bestOf);
  if (Math.max(scoreA, scoreB) > need) {
    return { ok: false, reason: 'That is more games than this match can have.' };
  }

  return { ok: true, scoreA, scoreB, draws: 0 };
}

/**
 * The result as the person filing it reads it: their games first.
 *
 * A line that says "0–2" to the player who just won is the kind of thing that
 * makes somebody hesitate over a confirm button, so the seat the reader is in
 * decides the order.
 */
export function resultForViewer(state, uid) {
  const tournament = state?.tournament;
  if (!tournament) return null;
  const { scoreA, scoreB } = matchScoreForRow(state.match, tournament);
  const mine = tournament.seats?.[uid];
  const flipped = mine != null && mine === tournament.playerB;
  return {
    mine: flipped ? scoreB : scoreA,
    theirs: flipped ? scoreA : scoreB,
    won: matchWinner(state.match) === uid,
  };
}

/** The opponent's name from the pairing, not from whoever joined the room. */
export function opponentName(state, uid) {
  const tournament = state?.tournament;
  if (!tournament) return null;
  const mine = tournament.seats?.[uid];
  const theirs = mine === tournament.playerA ? tournament.playerB : tournament.playerA;
  return tournament.names?.[theirs] ?? null;
}
