import { describe, it, expect } from "vitest";
import {
  roundsToWin, isLegalScore, viewerRole, matchAction, canActOnMatch,
  myPairing, opponentOf, scoreFor, organizerControls, playerControls,
  byTable, partitionTournaments, validateTournament, MATCH_FORMATS,
} from "./tournaments.js";

// Entrant ids, not auth uids: a match is between entrants.
const A = 11, B = 22, C = 33;

const match = (over = {}) => ({
  id: 1, round: 1, table_number: 1,
  player_a: A, player_b: B,
  score_a: 0, score_b: 0, draws: 0,
  winner: null, status: "pending", reported_by: null,
  ...over,
});

describe("roundsToWin", () => {
  it("is the majority of the format", () => {
    expect(roundsToWin(1)).toBe(1);
    expect(roundsToWin(3)).toBe(2);
    expect(roundsToWin(5)).toBe(3);
  });

  // The Activity's duelReducer does the same thing with the same fallback, and
  // a room persisted before a format existed must not become unwinnable.
  it("falls back to best of three for anything else", () => {
    expect(roundsToWin(2)).toBe(2);
    expect(roundsToWin(undefined)).toBe(2);
    expect(roundsToWin(99)).toBe(2);
  });
});

describe("isLegalScore", () => {
  it("accepts the ordinary decisive results", () => {
    expect(isLegalScore(3, 2, 0, 0)).toBe(true);
    expect(isLegalScore(3, 2, 1, 0)).toBe(true);
    expect(isLegalScore(1, 1, 0, 0)).toBe(true);
    expect(isLegalScore(5, 3, 2, 0)).toBe(true);
  });

  // The rule this product actually needs: a physical match that ran out of time
  // is a real result, and refusing to record it would push the players into
  // reporting a lie.
  it("accepts a match that ended undecided", () => {
    expect(isLegalScore(3, 1, 1, 0)).toBe(true);
    expect(isLegalScore(3, 1, 1, 1)).toBe(true);
    expect(isLegalScore(3, 0, 0, 1)).toBe(true);
  });

  it("refuses more games than the format has", () => {
    expect(isLegalScore(3, 3, 0, 0)).toBe(false);
    expect(isLegalScore(3, 2, 2, 0)).toBe(false);
    expect(isLegalScore(1, 1, 1, 0)).toBe(false);
    expect(isLegalScore(3, 1, 1, 2)).toBe(false);
  });

  it("refuses a match nobody played", () => {
    expect(isLegalScore(3, 0, 0, 0)).toBe(false);
  });

  it("refuses negatives and non-integers", () => {
    expect(isLegalScore(3, -1, 2, 0)).toBe(false);
    expect(isLegalScore(3, 1.5, 0, 0)).toBe(false);
    expect(isLegalScore(3, NaN, 0, 0)).toBe(false);
    expect(isLegalScore(3, 2, 0, -1)).toBe(false);
  });

  // The SQL mirror is tournament_score_is_legal. These are the cases both
  // implementations are pinned to; if one moves, this table is where it shows.
  it("agrees with the SQL rule on the boundary cases", () => {
    const table = [
      [3, 2, 0, 0, true],  [3, 2, 1, 0, true],  [3, 1, 1, 1, true],
      [3, 3, 0, 0, false], [3, 2, 2, 0, false], [3, 0, 0, 0, false],
      [5, 3, 2, 0, true],  [5, 4, 0, 0, false], [5, 2, 2, 1, true],
      [1, 1, 0, 0, true],  [1, 0, 0, 1, true],  [1, 1, 1, 0, false],
    ];
    for (const [fmt, a, b, d, want] of table) {
      expect(isLegalScore(fmt, a, b, d), `best of ${fmt}: ${a}-${b} (${d} draws)`).toBe(want);
    }
  });
});

describe("viewerRole", () => {
  it("names both players and everyone else", () => {
    expect(viewerRole(match(), A)).toBe("player");
    expect(viewerRole(match(), B)).toBe("player");
    expect(viewerRole(match(), C)).toBe("spectator");
    expect(viewerRole(match(), null)).toBe("spectator");
  });

  // An organizer playing at their own event still needs the organizer's
  // controls, including at their own table.
  it("puts organizer above player", () => {
    expect(viewerRole(match(), A, true)).toBe("organizer");
    expect(viewerRole(match(), C, true)).toBe("organizer");
  });
});

describe("matchAction", () => {
  it("offers a report when nothing has been said", () => {
    expect(matchAction(match(), A)).toBe("report");
    expect(matchAction(match(), B)).toBe("report");
  });

  it("splits the two sides of a pending report", () => {
    const m = match({ status: "awaiting_confirmation", reported_by: A, score_a: 2, winner: A });
    expect(matchAction(m, A)).toBe("awaiting_opponent");
    expect(matchAction(m, B)).toBe("respond");
  });

  it("says nothing is left once it is confirmed", () => {
    expect(matchAction(match({ status: "completed", winner: A }), A)).toBe("final");
    expect(matchAction(match({ status: "completed", winner: A }), B)).toBe("final");
  });

  it("parks a disputed match for both players", () => {
    const m = match({ status: "disputed", reported_by: A, disputed_by: B });
    expect(matchAction(m, A)).toBe("disputed");
    expect(matchAction(m, B)).toBe("disputed");
  });

  it("has nothing to offer on a bye", () => {
    const bye = match({ player_b: null, status: "completed", winner: A });
    expect(matchAction(bye, A)).toBe("bye");
    expect(matchAction(bye, A, { isOrganizer: true })).toBe("bye");
  });

  // The rule the whole function exists for. A spectator who can reach the page
  // is not a participant, and must never be shown a control.
  it("never offers a spectator an action", () => {
    for (const status of ["pending", "active", "awaiting_confirmation", "disputed", "completed"]) {
      const m = match({ status, reported_by: A });
      expect(matchAction(m, C), status).toBe("watch");
      expect(matchAction(m, null), status).toBe("watch");
      expect(canActOnMatch(m, C), status).toBe(false);
      expect(canActOnMatch(m, null), status).toBe(false);
    }
  });

  it("lets the organizer rule on anything but a bye", () => {
    for (const status of ["pending", "awaiting_confirmation", "disputed", "completed"]) {
      expect(matchAction(match({ status }), C, { isOrganizer: true }), status).toBe("resolve");
    }
  });

  // Reporting into a tournament that has been cancelled or already finished
  // would be refused by the database; the button should not be there either.
  it("stands players down when the tournament is not running", () => {
    for (const s of ["draft", "registration", "check_in", "completed", "cancelled"]) {
      expect(matchAction(match(), A, { tournamentStatus: s }), s).toBe("watch");
    }
  });

  it("treats a missing match as nothing to do", () => {
    expect(matchAction(null, A)).toBe("watch");
  });
});

describe("myPairing", () => {
  const round = [
    match({ id: 1, table_number: 1, player_a: A, player_b: B }),
    match({ id: 2, table_number: 2, player_a: C, player_b: 44 }),
  ];

  it("finds the viewer's own table from either side", () => {
    expect(myPairing(round, A)?.id).toBe(1);
    expect(myPairing(round, B)?.id).toBe(1);
    expect(myPairing(round, 44)?.id).toBe(2);
  });

  it("returns null for somebody who is not playing", () => {
    expect(myPairing(round, 999)).toBeNull();
    expect(myPairing(round, null)).toBeNull();
    expect(myPairing([], A)).toBeNull();
    expect(myPairing(undefined, A)).toBeNull();
  });
});

describe("opponentOf and scoreFor", () => {
  it("names the other side", () => {
    expect(opponentOf(match(), A)).toBe(B);
    expect(opponentOf(match(), B)).toBe(A);
    expect(opponentOf(match(), C)).toBeNull();
    expect(opponentOf(match({ player_b: null }), A)).toBeNull();
  });

  // A row that reads "you 0 – 2 them" when you actually won is the one bug
  // nobody forgives, so the flip is tested from both seats.
  it("reads the score from the viewer's seat", () => {
    const m = match({ score_a: 2, score_b: 1, draws: 0 });
    expect(scoreFor(m, A)).toEqual({ mine: 2, theirs: 1, draws: 0 });
    expect(scoreFor(m, B)).toEqual({ mine: 1, theirs: 2, draws: 0 });
  });

  it("shows a spectator the match as stored", () => {
    const m = match({ score_a: 2, score_b: 1 });
    expect(scoreFor(m, C)).toEqual({ mine: 2, theirs: 1, draws: 0 });
  });
});

describe("organizerControls", () => {
  const t = (over = {}) => ({ status: "active", current_round: 1, ...over });

  it("opens registration from a draft", () => {
    const c = organizerControls(t({ status: "draft", current_round: 0 }), []);
    expect(c.openRegistration).toBe(true);
    expect(c.start).toBe(false);
    expect(c.generateRound).toBe(false);
  });

  it("allows starting once registration is open", () => {
    const c = organizerControls(t({ status: "registration", current_round: 0 }), []);
    expect(c.start).toBe(true);
    expect(c.openCheckIn).toBe(true);
  });

  // The pairing button and the finish button must both be dark while a table is
  // still out. This is the case the database refuses, and the interface should
  // not have offered it in the first place.
  it("locks pairing and finishing while a match is open", () => {
    const open = [match({ status: "completed" }), match({ id: 2, status: "awaiting_confirmation" })];
    const c = organizerControls(t(), open);
    expect(c.generateRound).toBe(false);
    expect(c.finish).toBe(false);
    expect(c.roundInProgress).toBe(true);
    expect(c.openMatches).toBe(1);
  });

  it("unlocks them once every table is in", () => {
    const done = [match({ status: "completed" }), match({ id: 2, status: "completed" })];
    const c = organizerControls(t(), done);
    expect(c.generateRound).toBe(true);
    expect(c.finish).toBe(true);
    expect(c.roundInProgress).toBe(false);
    expect(c.nextRoundNumber).toBe(2);
  });

  it("will not finish a tournament that has played no rounds", () => {
    expect(organizerControls(t({ current_round: 0 }), []).finish).toBe(false);
  });

  it("counts disputes so they can be surfaced", () => {
    const c = organizerControls(t(), [match({ status: "disputed" }), match({ id: 2, status: "completed" })]);
    expect(c.disputes).toBe(1);
    expect(c.generateRound).toBe(false);
  });

  it("offers cancel until the event is over", () => {
    expect(organizerControls(t({ status: "draft" }), []).cancel).toBe(true);
    expect(organizerControls(t({ status: "active" }), []).cancel).toBe(true);
    expect(organizerControls(t({ status: "completed" }), []).cancel).toBe(false);
    expect(organizerControls(t({ status: "cancelled" }), []).cancel).toBe(false);
  });

  it("survives a missing tournament and missing matches", () => {
    const c = organizerControls(null, null);
    expect(c.start).toBe(false);
    expect(c.openMatches).toBe(0);
    expect(c.nextRoundNumber).toBe(1);
  });
});

describe("playerControls", () => {
  it("offers registration only while it is open", () => {
    expect(playerControls({ status: "registration" }, null).register).toBe(true);
    expect(playerControls({ status: "check_in" }, null).register).toBe(true);
    expect(playerControls({ status: "draft" }, null).register).toBe(false);
    expect(playerControls({ status: "active" }, null).register).toBe(false);
  });

  it("does not offer a second registration", () => {
    const entry = { id: 1, checked_in: false, dropped_at: null };
    expect(playerControls({ status: "registration" }, entry).register).toBe(false);
    expect(playerControls({ status: "registration" }, entry).drop).toBe(true);
  });

  // Dropping and re-registering is deliberate: the RPC clears dropped_at rather
  // than making a second entrant row.
  it("offers registration again after a drop", () => {
    const dropped = { id: 1, checked_in: false, dropped_at: "2026-09-04T10:00:00Z" };
    expect(playerControls({ status: "registration" }, dropped).register).toBe(true);
    expect(playerControls({ status: "registration" }, dropped).registered).toBe(false);
  });

  it("offers check-in only during check-in, and only once", () => {
    const entry = { id: 1, checked_in: false, dropped_at: null };
    expect(playerControls({ status: "check_in" }, entry).checkIn).toBe(true);
    expect(playerControls({ status: "check_in" }, { ...entry, checked_in: true }).checkIn).toBe(false);
    expect(playerControls({ status: "registration" }, entry).checkIn).toBe(false);
  });

  it("stops offering a drop once the event is over", () => {
    const entry = { id: 1, checked_in: true, dropped_at: null };
    expect(playerControls({ status: "completed" }, entry).drop).toBe(false);
    expect(playerControls({ status: "cancelled" }, entry).drop).toBe(false);
  });
});

describe("byTable", () => {
  it("reads like a pairing sheet and does not mutate its input", () => {
    const rows = [match({ id: 3, table_number: 3 }), match({ id: 1, table_number: 1 }), match({ id: 2, table_number: 2 })];
    expect(byTable(rows).map((m) => m.table_number)).toEqual([1, 2, 3]);
    expect(rows.map((m) => m.table_number)).toEqual([3, 1, 2]);
  });

  it("survives nothing at all", () => {
    expect(byTable(null)).toEqual([]);
    expect(byTable(undefined)).toEqual([]);
  });
});

describe("partitionTournaments", () => {
  const t = (id, status, starts_at) => ({ id, status, starts_at, created_at: starts_at });

  it("puts what is happening first and what is over behind it", () => {
    const { live, past } = partitionTournaments([
      t(1, "completed", "2026-08-01"),
      t(2, "registration", "2026-09-10"),
      t(3, "active", "2026-09-05"),
      t(4, "cancelled", "2026-08-20"),
    ]);
    expect(live.map((x) => x.id)).toEqual([3, 2]);
    // Past reads most recent first: what happened last week beats last year.
    expect(past.map((x) => x.id)).toEqual([4, 1]);
  });

  it("counts a cancelled tournament as past — nobody is going to it", () => {
    const { live, past } = partitionTournaments([t(1, "cancelled", "2027-01-01")]);
    expect(live).toEqual([]);
    expect(past.map((x) => x.id)).toEqual([1]);
  });

  it("falls back to created_at when there is no start date", () => {
    const rows = [
      { id: 1, status: "draft", starts_at: null, created_at: "2026-09-02" },
      { id: 2, status: "draft", starts_at: null, created_at: "2026-09-01" },
    ];
    expect(partitionTournaments(rows).live.map((x) => x.id)).toEqual([2, 1]);
  });

  it("survives nothing and nulls in the list", () => {
    expect(partitionTournaments(null)).toEqual({ live: [], past: [] });
    expect(partitionTournaments([null, undefined])).toEqual({ live: [], past: [] });
  });
});

describe("validateTournament", () => {
  const good = { name: "Thursday Night Swiss", match_format: 3 };

  it("accepts the minimum a tournament needs", () => {
    expect(validateTournament(good)).toEqual({ ok: true });
  });

  it("names what is wrong with an i18n key suffix", () => {
    expect(validateTournament({ ...good, name: "  " }).error).toBe("nameRequired");
    expect(validateTournament({ ...good, name: "x".repeat(141) }).error).toBe("nameTooLong");
    expect(validateTournament({ ...good, description: "x".repeat(2001) }).error).toBe("descTooLong");
    expect(validateTournament({ ...good, match_format: 2 }).error).toBe("formatInvalid");
    expect(validateTournament({ ...good, max_players: 1 }).error).toBe("maxPlayersInvalid");
    expect(validateTournament({ ...good, max_players: 513 }).error).toBe("maxPlayersInvalid");
    expect(validateTournament({ ...good, max_players: 8.5 }).error).toBe("maxPlayersInvalid");
    expect(validateTournament({ ...good, starts_at: "not a date" }).error).toBe("startInvalid");
  });

  it("treats an empty player cap as no cap", () => {
    expect(validateTournament({ ...good, max_players: "" })).toEqual({ ok: true });
    expect(validateTournament({ ...good, max_players: null })).toEqual({ ok: true });
  });

  it("accepts every format the database accepts", () => {
    for (const f of MATCH_FORMATS) {
      expect(validateTournament({ ...good, match_format: f }), `best of ${f}`).toEqual({ ok: true });
    }
  });
});
