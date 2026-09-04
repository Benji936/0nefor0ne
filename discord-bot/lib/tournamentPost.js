// Rendering tournament state as Discord messages.
//
// Kept out of index.js for the same reason eventPost.js is: it is pure. Rows
// in, an embed out, no client and no network, so the formatting can be tested
// without a bot token.
//
// Everything here is fed by names people chose for themselves, so escaping is
// the point of the module rather than an afterthought.

const { EmbedBuilder } = require('discord.js');
const { escapeMd, truncate } = require('./slashCommands');

const BRAND = 0xffb020;

// Discord's own limits. A sixteen-table round is about 500 characters, so the
// description cap is not close — but a 64-player event is, and a message that
// silently loses the bottom four tables is worse than one that says it did.
const DESC_MAX = 3900;
const MAX_ROWS = 40;

/** A player's name as it should appear on a pairing sheet. */
function playerName(name) {
  return escapeMd(truncate(name ?? 'Duelist', 40));
}

/**
 * One pairing, as a line.
 *
 * Names, not mentions. Mentions inside an embed do not notify anyone, so they
 * would look like pings without being them — and a real ping per player would
 * mean sixteen notifications a round, which is how a useful bot becomes a muted
 * one. A player who wants to be told their own table asks for it with
 * /tournament pairing.
 */
function pairingLine(p) {
  const table = `\`${String(p.table).padStart(2, ' ')}\``;
  if (p.bye) return `${table}  ${playerName(p.a)} — *bye*`;
  return `${table}  ${playerName(p.a)}  vs  ${playerName(p.b)}`;
}

/** Pairing lines, capped, with an honest note when the sheet did not fit. */
function pairingLines(pairings) {
  const rows = Array.isArray(pairings) ? pairings : [];
  const shown = rows.slice(0, MAX_ROWS).map(pairingLine);
  const lines = [];
  let used = 0;
  for (const line of shown) {
    if (used + line.length + 1 > DESC_MAX) break;
    lines.push(line);
    used += line.length + 1;
  }
  const dropped = rows.length - lines.length;
  if (dropped > 0) {
    lines.push(`…and ${dropped} more — see the full sheet on 0nefor.one`);
  }
  return lines;
}

/**
 * The pairing sheet for one round.
 *
 * The title links to the tournament page, because the thing a player does after
 * reading their table is report the result, and that lives there.
 */
function buildRoundEmbed(row, appUrl) {
  const url = `${appUrl}/en/community/${row.community_slug}/tournament/${row.tournament_id}`;
  const roundLabel = row.total_rounds
    ? `Round ${row.round_number} of ${row.total_rounds}`
    : `Round ${row.round_number}`;

  const embed = new EmbedBuilder()
    .setColor(BRAND)
    .setTitle(`${roundLabel} — ${truncate(row.tournament_name, 200)}`)
    .setURL(url)
    .setDescription(pairingLines(row.pairings).join('\n') || 'No pairings in this round.')
    .setFooter({ text: '0nefor.one' });

  if (row.community_name) {
    embed.setAuthor({ name: truncate(row.community_name, 100), url: `${appUrl}/en/community/${row.community_slug}` });
  }
  return embed;
}

/** The line above the embed. Says what happened; the embed says what it is. */
function roundAnnouncement(row) {
  const name = row?.tournament_name ? `**${escapeMd(truncate(row.tournament_name, 60))}**` : 'The tournament';
  return `⚔️ Round ${row?.round_number ?? '?'} of ${name} — pairings are up.`;
}

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * The standings table.
 *
 * Rendered as fixed-width text in a code block rather than embed fields:
 * columns that line up are the entire reason anyone reads a standings table,
 * and embed fields wrap differently on mobile and desktop.
 */
function buildStandingsEmbed(tournament, standings, appUrl) {
  const rows = (Array.isArray(standings) ? standings : []).slice(0, MAX_ROWS);
  const url = `${appUrl}/en/community/${tournament.community_slug}/tournament/${tournament.tournament_id ?? tournament.id}`;

  const embed = new EmbedBuilder()
    .setColor(BRAND)
    .setTitle(`Standings — ${truncate(tournament.name, 200)}`)
    .setURL(url)
    .setFooter({ text: '0nefor.one' });

  if (rows.length === 0) {
    embed.setDescription('Nobody has played a match yet.');
    return embed;
  }

  // The widest name decides the column, so short fields do not leave a gutter.
  const width = Math.min(20, Math.max(...rows.map((r) => String(r.display_name ?? '').length), 6));
  const header = `${'#'.padStart(2)}  ${'Player'.padEnd(width)}  ${'Pts'.padStart(3)}  W-D-L`;
  const lines = rows.map((r) => {
    const rank = String(r.rank ?? '').padStart(2);
    const name = truncate(String(r.display_name ?? ''), width).padEnd(width);
    const pts = String(r.points ?? 0).padStart(3);
    const record = `${r.wins ?? 0}-${r.draws ?? 0}-${r.losses ?? 0}`;
    return `${rank}  ${name}  ${pts}  ${record}${r.dropped ? '  (dropped)' : ''}`;
  });

  embed.setDescription(['```', header, ...lines, '```'].join('\n').slice(0, DESC_MAX));

  // The podium is the one thing worth saying twice, and it is the part people
  // screenshot. Only once the tournament is actually over.
  if (tournament.status === 'completed') {
    const podium = rows.slice(0, 3).map((r, i) => `${MEDALS[i]} ${playerName(r.display_name)}`).join('\n');
    if (podium) embed.addFields({ name: 'Final', value: podium });
  }
  return embed;
}

/** What is running in this server, as one embed. */
function buildTournamentListEmbed(rows, appUrl) {
  const embed = new EmbedBuilder().setColor(BRAND).setTitle('Tournaments').setFooter({ text: '0nefor.one' });

  if (!rows || rows.length === 0) {
    embed.setDescription('Nothing running right now. A verified community can start one on 0nefor.one.');
    return embed;
  }

  const STATUS = {
    registration: '🟢 Registration open',
    check_in: '🟡 Check-in',
    active: '⚔️ Under way',
  };

  embed.setDescription(
    rows.slice(0, 10).map((r) => {
      const url = `${appUrl}/en/community/${r.community_slug}/tournament/${r.tournament_id}`;
      const state = STATUS[r.status] ?? r.status;
      const round = r.status === 'active' && r.current_round
        ? ` · Round ${r.current_round}${r.total_rounds ? `/${r.total_rounds}` : ''}`
        : '';
      return `**[${escapeMd(truncate(r.name, 70))}](${url})**\n${state} · ${r.players} player(s) · Best of ${r.match_format}${round}\n↳ \`/tournament join id:${r.tournament_id}\``;
    }).join('\n\n').slice(0, DESC_MAX),
  );
  return embed;
}

/**
 * One player's own pairing, for the ephemeral reply to /tournament pairing.
 *
 * Plain text rather than an embed: it is one line, it is private to the person
 * who asked, and an embed around a single sentence is decoration.
 */
function myPairingReply(row) {
  if (!row) return "You are not in the current round. If you have not joined yet, try `/tournament join`.";
  if (row.is_bye) return `Round ${row.round_number}: you have the **bye** this round. Nothing to play.`;

  const head = `Round ${row.round_number} · **Table ${row.table_number}** vs **${playerName(row.opponent)}**`;
  const tail = {
    completed: `Result: ${row.score_me}–${row.score_them}. Confirmed.`,
    awaiting_confirmation: `A result of ${row.score_me}–${row.score_them} is waiting on a confirmation.`,
    disputed: 'This match is disputed — the organizer will decide it.',
  }[row.status] ?? 'Report the result on 0nefor.one when you are done.';

  return `${head}\n${tail}`;
}

module.exports = {
  buildRoundEmbed, roundAnnouncement, buildStandingsEmbed,
  buildTournamentListEmbed, myPairingReply,
  pairingLine, pairingLines, playerName,
};
