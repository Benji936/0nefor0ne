const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildRoundEmbed, roundAnnouncement, buildStandingsEmbed,
  buildTournamentListEmbed, myPairingReply, pairingLine, pairingLines, playerName,
} = require('./tournamentPost');

const APP = 'https://0nefor.one';

function roundRow(over = {}) {
  return {
    round_id: 1,
    tournament_id: 7,
    guild_id: '555000111222333444',
    tournament_name: 'Thursday Night Swiss',
    round_number: 2,
    total_rounds: 3,
    community_name: 'Geneva Card Bar',
    community_slug: 'geneva-card-bar',
    pairings: [
      { table: 1, a: 'Benji', b: 'Alex', bye: false },
      { table: 2, a: 'Marco', b: 'Flo', bye: false },
      { table: 3, a: 'Yuki', b: null, bye: true },
    ],
    ...over,
  };
}

test('a pairing line names both players; a bye names one', () => {
  assert.match(pairingLine({ table: 1, a: 'Benji', b: 'Alex', bye: false }), /Benji {2}vs {2}Alex/);
  assert.match(pairingLine({ table: 4, a: 'Yuki', b: null, bye: true }), /Yuki — \*bye\*/);
});

// A name is whatever somebody typed into their profile. Left unescaped, a
// player called "**Alex**" reformats the sheet, and one called
// "x](https://evil.example)" is a worse problem than that.
test('a player name cannot reformat the sheet', () => {
  const line = pairingLine({ table: 1, a: '**Alex**', b: '_Flo_', bye: false });
  assert.ok(!line.includes('**Alex**'), 'bold markers must be escaped');
  assert.match(line, /\\\*\\\*Alex/);
  assert.match(line, /\\_Flo\\_/);
});

test('a missing name falls back rather than printing undefined', () => {
  assert.equal(playerName(null), 'Duelist');
  assert.equal(playerName(undefined), 'Duelist');
});

test('a very long name is truncated instead of blowing the column', () => {
  const name = playerName('x'.repeat(200));
  assert.ok(name.length <= 41, `got ${name.length}`);
});

test('pairingLines survives a missing or empty pairing list', () => {
  assert.deepEqual(pairingLines(null), []);
  assert.deepEqual(pairingLines(undefined), []);
  assert.deepEqual(pairingLines([]), []);
});

// A sheet that silently loses its last four tables is worse than one that says
// it did — the players on those tables are the ones who would never find out.
test('an oversized sheet is capped and says so', () => {
  const many = Array.from({ length: 60 }, (_, i) => ({ table: i + 1, a: `P${i}a`, b: `P${i}b`, bye: false }));
  const lines = pairingLines(many);
  assert.ok(lines.length < 60, 'it must not print all sixty');
  assert.match(lines[lines.length - 1], /and \d+ more/);
});

test('the round embed titles the round and links to the tournament page', () => {
  const e = buildRoundEmbed(roundRow(), APP).toJSON();
  assert.equal(e.title, 'Round 2 of 3 — Thursday Night Swiss');
  assert.equal(e.url, `${APP}/en/community/geneva-card-bar/tournament/7`);
  assert.match(e.description, /Benji {2}vs {2}Alex/);
  assert.match(e.description, /Yuki — \*bye\*/);
  assert.equal(e.author.name, 'Geneva Card Bar');
});

test('a tournament with no round target still reads correctly', () => {
  const e = buildRoundEmbed(roundRow({ total_rounds: null }), APP).toJSON();
  assert.equal(e.title, 'Round 2 — Thursday Night Swiss');
});

test('an empty round says so rather than rendering a blank embed', () => {
  const e = buildRoundEmbed(roundRow({ pairings: [] }), APP).toJSON();
  assert.equal(e.description, 'No pairings in this round.');
});

// Mentions inside an embed do not notify anyone, so putting them there would
// look like a ping without being one. See the comment on pairingLine.
test('the sheet carries no mentions', () => {
  const withIds = roundRow({
    pairings: [{ table: 1, a: 'Benji', b: 'Alex', a_discord: '111', b_discord: '222', bye: false }],
  });
  const e = buildRoundEmbed(withIds, APP).toJSON();
  assert.ok(!e.description.includes('<@'), 'no mention markup in the pairing sheet');
});

test('the announcement line names the round and the tournament', () => {
  assert.match(roundAnnouncement(roundRow()), /Round 2 of \*\*Thursday Night Swiss\*\*/);
});

test('the announcement line survives a row with nothing in it', () => {
  const line = roundAnnouncement({});
  assert.ok(typeof line === 'string' && line.length > 0);
});

// ── Standings ────────────────────────────────────────────────────────────────

const T = { name: 'Thursday Night Swiss', tournament_id: 7, community_slug: 'geneva-card-bar', status: 'active' };

function standing(over = {}) {
  return { entrant_id: 1, display_name: 'Benji', rank: 1, played: 2, wins: 2, draws: 0, losses: 0, points: 6, dropped: false, ...over };
}

test('standings render as a fixed-width block so the columns line up', () => {
  const e = buildStandingsEmbed(T, [
    standing(),
    standing({ entrant_id: 2, display_name: 'Alexandra-Longname', rank: 2, wins: 1, losses: 1, points: 3 }),
  ], APP).toJSON();

  assert.ok(e.description.startsWith('```'), 'a code block, or the columns drift on mobile');
  const lines = e.description.split('\n');
  const body = lines.filter((l) => /Benji|Alexandra/.test(l));
  assert.equal(body.length, 2);
  // Points must sit in the same column on every row; that is the whole point.
  assert.equal(body[0].indexOf('6'), body[1].indexOf('3'));
});

test('standings mark a dropped player rather than hiding them', () => {
  const e = buildStandingsEmbed(T, [standing({ dropped: true })], APP).toJSON();
  assert.match(e.description, /\(dropped\)/);
});

test('an empty standings table says nobody has played', () => {
  const e = buildStandingsEmbed(T, [], APP).toJSON();
  assert.equal(e.description, 'Nobody has played a match yet.');
  assert.equal(e.fields, undefined);
});

test('the podium appears only once the tournament is over', () => {
  const rows = [standing(), standing({ entrant_id: 2, display_name: 'Alex', rank: 2 })];
  assert.equal(buildStandingsEmbed(T, rows, APP).toJSON().fields, undefined);

  const done = buildStandingsEmbed({ ...T, status: 'completed' }, rows, APP).toJSON();
  assert.equal(done.fields.length, 1);
  assert.match(done.fields[0].value, /🥇 Benji/);
});

test('standings survive a null list', () => {
  const e = buildStandingsEmbed(T, null, APP).toJSON();
  assert.equal(e.description, 'Nobody has played a match yet.');
});

// ── The guild listing ────────────────────────────────────────────────────────

function listRow(over = {}) {
  return {
    tournament_id: 7, name: 'Thursday Night Swiss', status: 'registration',
    current_round: 0, total_rounds: null, match_format: 3,
    community_slug: 'geneva-card-bar', community_name: 'Geneva Card Bar', players: 7,
    ...over,
  };
}

test('the listing links each tournament and shows how to join it', () => {
  const e = buildTournamentListEmbed([listRow()], APP).toJSON();
  assert.match(e.description, /\[Thursday Night Swiss\]\(https:\/\/0nefor\.one\/en\/community\/geneva-card-bar\/tournament\/7\)/);
  assert.match(e.description, /Registration open/);
  assert.match(e.description, /7 player\(s\)/);
  assert.match(e.description, /\/tournament join id:7/);
});

test('an active tournament shows which round it is on', () => {
  const e = buildTournamentListEmbed([listRow({ status: 'active', current_round: 2, total_rounds: 3 })], APP).toJSON();
  assert.match(e.description, /Round 2\/3/);
});

test('an empty server gets an explanation, not a blank embed', () => {
  const e = buildTournamentListEmbed([], APP).toJSON();
  assert.match(e.description, /Nothing running right now/);
  assert.match(buildTournamentListEmbed(null, APP).toJSON().description, /Nothing running right now/);
});

// ── The private "where am I playing" reply ───────────────────────────────────

test('a player is told their table and their opponent', () => {
  const reply = myPairingReply({
    round_number: 2, table_number: 3, opponent: 'Alex', status: 'pending', is_bye: false,
  });
  assert.match(reply, /Table 3/);
  assert.match(reply, /Alex/);
  assert.match(reply, /Report the result/);
});

test('a bye is told plainly, with nothing to do', () => {
  const reply = myPairingReply({ round_number: 2, is_bye: true });
  assert.match(reply, /bye/);
  assert.ok(!/Table/.test(reply), 'a bye has no table to go to');
});

test('each match state gets its own sentence', () => {
  const base = { round_number: 2, table_number: 1, opponent: 'Alex', is_bye: false, score_me: 2, score_them: 1 };
  assert.match(myPairingReply({ ...base, status: 'awaiting_confirmation' }), /waiting on a confirmation/);
  assert.match(myPairingReply({ ...base, status: 'disputed' }), /disputed/);
  assert.match(myPairingReply({ ...base, status: 'completed' }), /2–1/);
});

test('somebody not in the round is pointed at joining rather than left confused', () => {
  assert.match(myPairingReply(null), /tournament join/);
  assert.match(myPairingReply(undefined), /tournament join/);
});
