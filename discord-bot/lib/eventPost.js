// Rendering a community's event as a Discord message.
//
// Kept out of index.js because it is pure: rows in, an embed out, no client and
// no network. Everything here is fed by user-entered text from the website, so
// escaping and URL validation are the point of the module, not an afterthought.

const { EmbedBuilder } = require('discord.js');
const { escapeMd, truncate } = require('./slashCommands');

const BRAND = 0xffb020;

/**
 * Discord's own timestamp markup, which every reader sees in their own
 * timezone. Better than formatting a string here: the event's stored timezone
 * is the shop's, and a player three countries away wants theirs.
 *
 * `F` is the long form ("Friday, 12 September 2026 19:30"), `R` the relative
 * one ("in 3 days"), which is the part people actually act on.
 */
function discordTimestamp(value, style = 'F') {
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

/**
 * A link we are willing to put in an embed. Anything that is not http(s) is
 * dropped rather than passed through: the field is filled in by whoever created
 * the event, and Discord will happily render a link a reader would trust
 * because it sits inside our embed.
 */
function safeUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Where the event is, in one line. Empty when there is nothing to say. */
function eventWhere(row) {
  if (row?.is_online) return 'Online';
  const own = String(row?.location ?? '').trim();
  if (own) return own;
  return [row?.city, row?.country].map((s) => String(s ?? '').trim()).filter(Boolean).join(', ');
}

/** The community's page, which is where its events live on the website. */
function communityUrl(row, appUrl) {
  return row?.community_slug ? `${appUrl}/en/community/${row.community_slug}` : appUrl;
}

/**
 * The embed for one event.
 *
 * The title links to the event's own registration link when it has one and to
 * the community page otherwise, because a reader clicking the title of a
 * tournament wants the sign-up, not our profile of the shop.
 */
function buildEventEmbed(row, appUrl) {
  const profile = communityUrl(row, appUrl);
  const embed = new EmbedBuilder()
    .setColor(BRAND)
    .setTitle(truncate(row.title, 240))
    .setURL(safeUrl(row.url) ?? profile)
    .setFooter({ text: '0nefor.one' });

  if (row.community_name) {
    embed.setAuthor({
      name: truncate(row.community_name, 100),
      url: profile,
      ...(safeUrl(row.community_avatar_url) ? { iconURL: safeUrl(row.community_avatar_url) } : {}),
    });
  }

  const description = String(row.description ?? '').trim();
  if (description) embed.setDescription(escapeMd(truncate(description, 600)));

  const starts = discordTimestamp(row.starts_at);
  if (starts) {
    const relative = discordTimestamp(row.starts_at, 'R');
    const ends = row.ends_at ? discordTimestamp(row.ends_at, 't') : null;
    embed.addFields({
      name: 'When',
      value: [starts, ends ? `→ ${ends}` : '', relative ? `(${relative})` : ''].filter(Boolean).join(' '),
    });
  }

  const where = eventWhere(row);
  if (where) embed.addFields({ name: 'Where', value: escapeMd(truncate(where, 200)) });

  const cover = safeUrl(row.cover_url);
  if (cover) embed.setImage(cover);

  return embed;
}

/** The line above the embed. Says what happened; the embed says what it is. */
function eventAnnouncement(row) {
  const who = row?.community_name ? `**${escapeMd(truncate(row.community_name, 60))}**` : 'A community you follow';
  return `📅 New event from ${who}`;
}

module.exports = { buildEventEmbed, eventAnnouncement, discordTimestamp, safeUrl, eventWhere, communityUrl };
