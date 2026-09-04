// Data access and viewer rules for tournaments.
//
// Two halves, and the split is deliberate. The bottom half talks to Supabase.
// The top half is pure: given a match, a viewer and a tournament, what may that
// person do about it right now. That question is asked by four components and
// answered wrong in four different ways if each of them works it out inline, so
// it is answered once here where tournaments.test.js can hold it to account.
//
// Nothing here is authoritative. Every rule below is enforced again in plpgsql
// (20260904142006_tournament_results.sql) and the database is what decides. The
// point of having them here is that a player should not be offered a button
// that is going to fail, not that the button is what stops them.
import { getClient } from "@/lib/supabaseClient";

// ── Vocabulary ────────────────────────────────────────────────────────────────

export const TOURNAMENT_STATUSES = [
  "draft", "registration", "check_in", "active", "completed", "cancelled",
];

export const MATCH_STATUSES = [
  "pending", "active", "awaiting_confirmation", "disputed", "completed",
];

export const MATCH_FORMATS = [1, 3, 5];

/** Games needed to take the match. Best of three is two. Mirrors roundsToWin()
 *  in the Activity's duelReducer and floor(match_format / 2) + 1 in SQL. */
export function roundsToWin(matchFormat) {
  const n = MATCH_FORMATS.includes(matchFormat) ? matchFormat : 3;
  return Math.floor(n / 2) + 1;
}

/**
 * Could a match of this format have ended on this score?
 *
 * The mirror of tournament_score_is_legal. A decided winner is NOT required —
 * a match that ran out of time at one game each is real and legal — only that
 * something was played and that nobody won more games than the format allows.
 */
export function isLegalScore(matchFormat, scoreA, scoreB, draws = 0) {
  const fmt = MATCH_FORMATS.includes(matchFormat) ? matchFormat : 3;
  const nums = [scoreA, scoreB, draws];
  if (nums.some((n) => !Number.isInteger(n) || n < 0)) return false;
  const played = scoreA + scoreB + draws;
  if (played < 1 || played > fmt) return false;
  return Math.max(scoreA, scoreB) <= roundsToWin(fmt);
}

// ── Viewer rules ──────────────────────────────────────────────────────────────

/**
 * Where the viewer stands in one match.
 *
 * `entrantId` is a tournament_player id, not an auth uid: a match is between
 * entrants, and the caller already had to resolve which entrant they are.
 * Organizer wins over player, because an organizer playing in their own event
 * still needs the organizer's controls on other tables — and on their own, an
 * organizer who could only act as a player would have to leave the page to
 * resolve a dispute at their own table.
 */
export function viewerRole(match, entrantId, isOrganizer = false) {
  if (isOrganizer) return "organizer";
  if (!match || entrantId == null) return "spectator";
  if (match.player_a === entrantId || match.player_b === entrantId) return "player";
  return "spectator";
}

/**
 * What this viewer should be offered on this match, as one word.
 *
 *   bye                — nothing to do; nobody was on the other side
 *   report             — you are playing and no result has been reported
 *   awaiting_opponent  — you reported; they have not answered
 *   respond            — they reported; confirm it or dispute it
 *   disputed           — parked until an organizer rules
 *   final              — completed and immutable to players
 *   resolve            — the organizer's ruling is what moves this on
 *   watch              — a spectator, or a player whose tournament is not running
 *
 * A spectator NEVER gets an action. That is the single rule this function
 * exists to keep true, and it is checked first for that reason.
 */
export function matchAction(match, entrantId, { isOrganizer = false, tournamentStatus = "active" } = {}) {
  if (!match) return "watch";
  if (!match.player_b) return "bye";

  const role = viewerRole(match, entrantId, isOrganizer);

  // An organizer rules on any match, settled or not — overturning a confirmed
  // result is the same authority as deciding an abandoned one. The only case
  // with nothing to rule on is the bye, which returned above.
  if (role === "organizer") return "resolve";
  if (role !== "player") return "watch";
  if (tournamentStatus !== "active") return "watch";

  switch (match.status) {
    case "completed": return "final";
    case "disputed":  return "disputed";
    case "awaiting_confirmation":
      return match.reported_by === entrantId ? "awaiting_opponent" : "respond";
    default:
      return "report";
  }
}

/** Can this viewer act on this match at all? Spectators never can. */
export function canActOnMatch(match, entrantId, opts = {}) {
  const action = matchAction(match, entrantId, opts);
  return action === "report" || action === "respond" || action === "resolve";
}

/**
 * The match the viewer is in, for the round they are in.
 *
 * The tournament page leads with this: a player arriving mid-event wants their
 * own table number before they want the standings, and scanning a pairing list
 * for your own name is exactly the friction this product exists to remove.
 * Returns null for a spectator, which is the signal to show the list instead.
 */
export function myPairing(matches, entrantId) {
  if (entrantId == null) return null;
  return (matches ?? []).find(
    (m) => m && (m.player_a === entrantId || m.player_b === entrantId),
  ) ?? null;
}

/** Who the viewer is playing, as an entrant id. Null for a bye or a spectator. */
export function opponentOf(match, entrantId) {
  if (!match || entrantId == null) return null;
  if (match.player_a === entrantId) return match.player_b ?? null;
  if (match.player_b === entrantId) return match.player_a;
  return null;
}

/** The score from one player's point of view, so a row never reads backwards. */
export function scoreFor(match, entrantId) {
  if (!match) return { mine: 0, theirs: 0, draws: 0 };
  const flipped = match.player_b === entrantId;
  return {
    mine:   flipped ? match.score_b : match.score_a,
    theirs: flipped ? match.score_a : match.score_b,
    draws:  match.draws ?? 0,
  };
}

/**
 * Which organizer controls are live, given the tournament and its matches.
 *
 * One function rather than a condition per button, because the interesting
 * cases are the ones where two buttons must not both be live: you cannot pair
 * a round while one is open, and you cannot finish while anything is unplayed.
 */
export function organizerControls(tournament, matches = []) {
  const status = tournament?.status;
  const open = (matches ?? []).filter((m) => m && m.status !== "completed").length;
  const disputed = (matches ?? []).filter((m) => m && m.status === "disputed").length;
  const roundInProgress = status === "active" && open > 0;

  return {
    openRegistration:  status === "draft" || status === "check_in",
    openCheckIn:       status === "registration",
    closeRegistration: status === "registration" || status === "check_in",
    start:             status === "registration" || status === "check_in",
    // The first round and every later one are the same action; only the label
    // changes, so the caller reads nextRoundNumber rather than a second flag.
    generateRound:     status === "active" && open === 0,
    finish:            status === "active" && open === 0 && (tournament?.current_round ?? 0) > 0,
    cancel:            !!status && status !== "completed" && status !== "cancelled",
    roundInProgress,
    openMatches: open,
    disputes: disputed,
    nextRoundNumber: (tournament?.current_round ?? 0) + 1,
  };
}

/** What a player may do with the tournament itself. */
export function playerControls(tournament, entry) {
  const status = tournament?.status;
  const registered = !!entry && !entry.dropped_at;
  return {
    register:  (status === "registration" || status === "check_in") && !registered,
    checkIn:   status === "check_in" && registered && !entry.checked_in,
    drop:      registered && status !== "completed" && status !== "cancelled",
    registered,
  };
}

/** Sorted the way a pairing sheet is read: table 1 first. */
export function byTable(matches) {
  return [...(matches ?? [])].sort((a, b) => (a?.table_number ?? 0) - (b?.table_number ?? 0));
}

/**
 * Partition a community's tournaments the way its profile shows them: what is
 * happening or about to, then what is over. Cancelled events sit with the past,
 * because nobody is going to one.
 */
export function partitionTournaments(rows) {
  const live = [];
  const past = [];
  for (const t of rows ?? []) {
    if (!t) continue;
    (t.status === "completed" || t.status === "cancelled" ? past : live).push(t);
  }
  const byStart = (a, b) =>
    new Date(a.starts_at ?? a.created_at) - new Date(b.starts_at ?? b.created_at);
  live.sort(byStart);
  past.sort((a, b) => -byStart(a, b));
  return { live, past };
}

// ── Data access ───────────────────────────────────────────────────────────────

const LIST_SELECT =
  "id, name, status, structure, match_format, starts_at, timezone, current_round, " +
  "total_rounds, max_players, created_at";

/** Every tournament of a community the caller may see. RLS hides drafts from
 *  everyone but the owner, so one query serves both. */
export async function fetchTournaments(communityId) {
  const { data, error } = await getClient()
    .from("tournament")
    .select(LIST_SELECT)
    .eq("community", communityId)
    .order("starts_at", { ascending: true, nullsFirst: false });
  if (error) { console.error("fetchTournaments failed", error); throw error; }
  return data ?? [];
}

export async function fetchTournament(id) {
  const { data, error } = await getClient()
    .from("tournament")
    .select("*, community:community ( id, owner, name, slug, avatar_url, verified, status )")
    .eq("id", id)
    .maybeSingle();
  if (error) { console.error("fetchTournament failed", error); throw error; }
  return data ?? null;
}

export async function fetchPlayers(tournamentId) {
  const { data, error } = await getClient()
    .from("tournament_player")
    .select("id, player, display_name, discord_user_id, checked_in, dropped_at, seed")
    .eq("tournament", tournamentId)
    .order("display_name", { ascending: true });
  if (error) { console.error("fetchPlayers failed", error); throw error; }
  return data ?? [];
}

export async function fetchRounds(tournamentId) {
  const { data, error } = await getClient()
    .from("tournament_round")
    .select("id, round_number, status, started_at, completed_at")
    .eq("tournament", tournamentId)
    .order("round_number", { ascending: true });
  if (error) { console.error("fetchRounds failed", error); throw error; }
  return data ?? [];
}

/** Matches of one round, or of the whole tournament when roundId is null. */
export async function fetchMatches(tournamentId, roundId = null) {
  let q = getClient()
    .from("tournament_match")
    .select("id, round, table_number, player_a, player_b, score_a, score_b, draws, winner, " +
            "status, reported_by, reported_at, disputed_by, dispute_reason, resolution_note, " +
            "discord_channel_id, completed_at")
    .eq("tournament", tournamentId)
    .order("table_number", { ascending: true });
  if (roundId != null) q = q.eq("round", roundId);
  const { data, error } = await q;
  if (error) { console.error("fetchMatches failed", error); throw error; }
  return data ?? [];
}

export async function fetchStandings(tournamentId) {
  const { data, error } = await getClient().rpc("tournament_standings", { p_tournament: tournamentId });
  if (error) { console.error("fetchStandings failed", error); throw error; }
  return data ?? [];
}

/** The caller's own entrant row, or null when they are not in this tournament. */
export async function fetchMyEntry(tournamentId, userId) {
  if (!userId) return null;
  const { data, error } = await getClient()
    .from("tournament_player")
    .select("id, player, display_name, checked_in, dropped_at, seed")
    .eq("tournament", tournamentId)
    .eq("player", userId)
    .maybeSingle();
  if (error) { console.error("fetchMyEntry failed", error); throw error; }
  return data ?? null;
}

// ── Mutations ─────────────────────────────────────────────────────────────────
// Every one of these is an RPC. Nothing writes a pairing, a result or a point
// through PostgREST, because there is no policy that would let it.

const rpc = async (name, args) => {
  const { data, error } = await getClient().rpc(name, args);
  if (error) { console.error(`${name} failed`, error); throw error; }
  return data;
};

export const registerForTournament = (id)          => rpc("tournament_register",   { p_tournament: id });
export const checkInToTournament   = (id)          => rpc("tournament_check_in",   { p_tournament: id });
export const dropFromTournament    = (id, player)  => rpc("tournament_drop",       { p_tournament: id, p_player: player ?? null });
export const setTournamentStatus   = (id, status)  => rpc("tournament_set_status", { p_tournament: id, p_status: status });
export const startTournament       = (id)          => rpc("tournament_start",      { p_tournament: id });
export const finishTournament      = (id)          => rpc("tournament_finish",     { p_tournament: id });
export const generateRound         = (id)          => rpc("tournament_generate_round", { p_tournament: id });

export const submitResult = (matchId, scoreA, scoreB, draws = 0) =>
  rpc("tournament_submit_result", { p_match: matchId, p_score_a: scoreA, p_score_b: scoreB, p_draws: draws });

export const confirmResult = (matchId) => rpc("tournament_confirm_result", { p_match: matchId });

export const disputeResult = (matchId, reason) =>
  rpc("tournament_dispute_result", { p_match: matchId, p_reason: reason ?? null });

export const resolveMatch = (matchId, scoreA, scoreB, draws = 0, note = null) =>
  rpc("tournament_resolve_match", {
    p_match: matchId, p_score_a: scoreA, p_score_b: scoreB, p_draws: draws, p_note: note,
  });

/** Create a tournament. Plain PostgREST: it is a single row, owned by the
 *  community, and RLS already says who may. The database forces status to
 *  'draft' whatever is sent, so the caller does not set it. */
export async function createTournament(communityId, t) {
  const { data, error } = await getClient()
    .from("tournament")
    .insert({
      community:    communityId,
      name:         String(t.name).trim(),
      description:  String(t.description ?? "").trim(),
      format:       String(t.format ?? "").trim() || null,
      match_format: MATCH_FORMATS.includes(t.match_format) ? t.match_format : 3,
      max_players:  t.max_players || null,
      starts_at:    t.starts_at ? new Date(t.starts_at).toISOString() : null,
      timezone:     t.timezone || null,
    })
    .select()
    .single();
  if (error) { console.error("createTournament failed", error); throw error; }
  return data;
}

export async function updateTournament(id, t) {
  const { data, error } = await getClient()
    .from("tournament")
    .update({
      name:         String(t.name).trim(),
      description:  String(t.description ?? "").trim(),
      format:       String(t.format ?? "").trim() || null,
      match_format: MATCH_FORMATS.includes(t.match_format) ? t.match_format : 3,
      max_players:  t.max_players || null,
      starts_at:    t.starts_at ? new Date(t.starts_at).toISOString() : null,
      timezone:     t.timezone || null,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) { console.error("updateTournament failed", error); throw error; }
  return data;
}

export async function deleteTournament(id) {
  const { error } = await getClient().from("tournament").delete().eq("id", id);
  if (error) { console.error("deleteTournament failed", error); throw error; }
}

/** Validate the editor form. Returns { ok, error? } where error is an i18n key
 *  suffix (tournament.err_<error>), matching validateEvent in communityEvents. */
export function validateTournament(t) {
  const name = String(t?.name ?? "").trim();
  if (!name) return { ok: false, error: "nameRequired" };
  if (name.length > 140) return { ok: false, error: "nameTooLong" };
  if (String(t?.description ?? "").length > 2000) return { ok: false, error: "descTooLong" };
  if (!MATCH_FORMATS.includes(t?.match_format)) return { ok: false, error: "formatInvalid" };
  if (t?.max_players != null && t.max_players !== "") {
    const n = Number(t.max_players);
    if (!Number.isInteger(n) || n < 2 || n > 512) return { ok: false, error: "maxPlayersInvalid" };
  }
  if (t?.starts_at && Number.isNaN(new Date(t.starts_at).getTime())) {
    return { ok: false, error: "startInvalid" };
  }
  return { ok: true };
}
