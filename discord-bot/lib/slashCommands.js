// Slash command definitions and result rendering.
//
// Commands are delivered over the gateway (INTERACTION_CREATE). That is only
// possible while the app has NO Interactions Endpoint URL configured — the two
// delivery methods are mutually exclusive per application.

const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
  EntryPointCommandHandlerType,
  EmbedBuilder,
} = require('discord.js');

const BRAND = 0xffb020;
const MAX_LINES = 8;

const SYMBOLS = { EUR: '€', USD: '$', GBP: '£' };

function formatPrice(price, currency) {
  if (price == null) return 'Trade only';
  const n = Number(price);
  const amount = Number.isInteger(n) ? String(n) : n.toFixed(2);
  const code = (currency || '').toUpperCase();
  const symbol = SYMBOLS[code];
  return symbol ? `${amount}${symbol}` : `${amount}${code ? ' ' + code : ''}`;
}

/** Discord renders no markdown in embed titles, but does in descriptions. */
function escapeMd(text) {
  return String(text ?? '').replace(/([*_`~|\\])/g, '\\$1');
}

function truncate(text, max = 70) {
  const s = String(text ?? '').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** "×3 · Near Mint · 1st ed" — only the parts that carry information. */
function cardDetail(entry) {
  const bits = [];
  if (entry.qty > 1) bits.push(`×${entry.qty}`);
  if (entry.condition) bits.push(escapeMd(String(entry.condition)));
  if (entry.rarity && entry.rarity.toLowerCase() !== 'common') bits.push(escapeMd(entry.rarity));
  if (entry.firstEdition) bits.push('1st ed');
  if (entry.language && entry.language.toLowerCase() !== 'english') bits.push(escapeMd(entry.language));
  return bits.join(' · ');
}

/**
 * Link labels drop brackets and parens entirely rather than escaping them.
 * Discord's markdown is not full CommonMark, so a backslash-escaped `]` inside
 * a label is not reliably respected — a name like `x](https://evil) ` could
 * otherwise close the label early and render an attacker-chosen link.
 */
function escapeLinkText(text) {
  return escapeMd(String(text ?? '').replace(/[[\]()]/g, ''));
}

/** Trader name, linked to their profile when we know the uuid. */
function trader(name, id, appUrl) {
  const label = `**${escapeLinkText(truncate(name, 40))}**`;
  return id ? `[${label}](${appUrl}/en/trader/${id})` : label;
}

/**
 * Builds the /search reply. `appUrl` is the marketplace origin.
 */
function buildSearchEmbed({ query, trading = [], wanted = [], listings = [] }, appUrl) {
  const embed = new EmbedBuilder()
    .setColor(BRAND)
    .setTitle(`Search: ${truncate(query, 80)}`)
    .setURL(`${appUrl}/en/cards?q=${encodeURIComponent(query)}`);

  if (trading.length === 0 && wanted.length === 0 && listings.length === 0) {
    embed.setDescription(
      [
        `Nobody is trading, wanting or selling **${escapeMd(truncate(query, 60))}** right now.`,
        ``,
        `Add cards to your collection on ${appUrl} so others can find you.`,
      ].join('\n'),
    );
    return embed;
  }

  const sections = [];

  // Who has the card — the thing people actually search for.
  if (trading.length > 0) {
    const lines = trading.slice(0, MAX_LINES).map((t) => {
      const detail = cardDetail(t);
      return `**${escapeMd(truncate(t.name))}**${detail ? ` — ${detail}` : ''}\n↳ ${trader(t.traderName, t.traderId, appUrl)}`;
    });
    sections.push(`## 🤝 Trading (${trading.length})\n${lines.join('\n')}`);
  }

  if (wanted.length > 0) {
    const lines = wanted.slice(0, MAX_LINES).map((w) => {
      const qty = w.qty && w.qty > 1 ? ` ×${w.qty}` : '';
      const link =
        w.source === 'announce' ? ` · [View post](${appUrl}/en/announces/${w.id})` : '';
      return `**${escapeMd(truncate(w.label))}**${qty}\n↳ ${trader(w.traderName, w.traderId, appUrl)}${link}`;
    });
    sections.push(`## 🔎 Wanted (${wanted.length})\n${lines.join('\n')}`);
  }

  if (listings.length > 0) {
    const lines = listings.slice(0, MAX_LINES).map((s) => {
      const name = escapeMd(truncate(s.card_name || s.title));
      const link = `${appUrl}/en/announces/${s.id}`;
      return `**${name}** — ${formatPrice(s.price, s.currency)}\n↳ ${trader(s.traderName, s.traderId, appUrl)} · [View listing](${link})`;
    });
    sections.push(`## 💰 Listings (${listings.length})\n${lines.join('\n')}`);
  }

  embed.setDescription(sections.join('\n\n').slice(0, 4000));
  embed.setFooter({ text: '0nefor.one' });
  return embed;
}

/**
 * Which tournament, when a server is running more than one.
 *
 * Optional on every subcommand on purpose. Most servers have one thing going at
 * a time, and making somebody look up an id to join the only tournament open
 * would be the friction this is supposed to remove. The handler resolves an
 * omitted id to the single candidate and asks only when there is a real choice.
 */
const TOURNAMENT_ID_OPTION = {
  name: 'id',
  description: 'Which tournament (only needed when more than one is running)',
  type: ApplicationCommandOptionType.Integer,
  required: false,
  min_value: 1,
};

// ── Definitions ───────────────────────────────────────────────────────────────
// Passed to client.application.commands.set(), which replaces the full global
// command list, so this array is the single source of truth.
function commandDefinitions() {
  return [
    {
      name: 'search',
      description: 'Find who trades, wants or sells a card on 0nefor.one',
      type: ApplicationCommandType.ChatInput,
      options: [
        {
          name: 'card',
          description: 'Card name to look for, e.g. Blue-Eyes White Dragon',
          type: ApplicationCommandOptionType.String,
          required: true,
          max_length: 100,
        },
      ],
    },
    {
      name: 'lf',
      description: 'Post a Looking For want list to 0nefor.one',
      type: ApplicationCommandType.ChatInput,
      options: [
        {
          name: 'cards',
          description: 'Cards separated by commas, e.g. 3x Maxx "C", Ash Blossom',
          type: ApplicationCommandOptionType.String,
          required: true,
          max_length: 900,
        },
        {
          name: 'archetype',
          description: 'Optional archetype, e.g. Darklord',
          type: ApplicationCommandOptionType.String,
          required: false,
          max_length: 60,
        },
      ],
    },
    {
      // Verifying a community on 0nefor.one by proving you run this server.
      // Guild-only: the whole point is which server the command was run in.
      name: 'verify',
      description: 'Verify this server as your community on 0nefor.one',
      type: ApplicationCommandType.ChatInput,
      dm_permission: false,
      options: [
        {
          name: 'code',
          description: 'The code shown on your community verification page',
          type: ApplicationCommandOptionType.String,
          required: true,
          min_length: 8,
          max_length: 8,
        },
      ],
    },
    {
      // Discord launches the activity itself; no interaction reaches the bot.
      name: 'duel',
      description: 'Start a Remote Duel in your voice channel',
      type: ApplicationCommandType.PrimaryEntryPoint,
      handler: EntryPointCommandHandlerType.DiscordLaunchActivity,
    },
    {
      // One command with subcommands rather than six top-level ones: they all
      // answer questions about the same object, and Discord's picker groups
      // them where a flat list would bury /search and /lf.
      //
      // Guild-only, because every subcommand resolves the tournament through
      // the server it was run in. There is no useful answer in a DM.
      //
      // Deliberately absent: create. It needs six fields and a date picker, and
      // the website already has that form. What is here is the loop a player or
      // an organizer repeats during an event, which is where the friction is.
      name: 'tournament',
      description: 'Tournaments run by this server on 0nefor.one',
      type: ApplicationCommandType.ChatInput,
      dm_permission: false,
      options: [
        {
          name: 'list',
          description: "What this server is running right now",
          type: ApplicationCommandOptionType.Subcommand,
        },
        {
          name: 'join',
          description: 'Join a tournament that has registration open',
          type: ApplicationCommandOptionType.Subcommand,
          options: [TOURNAMENT_ID_OPTION],
        },
        {
          name: 'pairing',
          description: 'Which table you are on, and who you are playing',
          type: ApplicationCommandOptionType.Subcommand,
          options: [TOURNAMENT_ID_OPTION],
        },
        {
          name: 'standings',
          description: 'The current standings',
          type: ApplicationCommandOptionType.Subcommand,
          options: [TOURNAMENT_ID_OPTION],
        },
        {
          name: 'checkin',
          description: 'Check in, once check-in has opened',
          type: ApplicationCommandOptionType.Subcommand,
          options: [TOURNAMENT_ID_OPTION],
        },
        {
          name: 'drop',
          description: 'Drop out of a tournament',
          type: ApplicationCommandOptionType.Subcommand,
          options: [TOURNAMENT_ID_OPTION],
        },
        {
          // The one organizer action worth having here: repeated every round,
          // needs no form, and the organizer is standing in the room.
          name: 'round',
          description: 'Organizer: pair the next round',
          type: ApplicationCommandOptionType.Subcommand,
          options: [TOURNAMENT_ID_OPTION],
        },
      ],
    },
  ];
}

module.exports = { commandDefinitions, buildSearchEmbed, formatPrice, escapeMd, truncate };
