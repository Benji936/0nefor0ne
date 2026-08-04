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

/**
 * Builds the /search reply. `appUrl` is the marketplace origin.
 */
function buildSearchEmbed({ query, sells, wants }, appUrl) {
  const embed = new EmbedBuilder()
    .setColor(BRAND)
    .setTitle(`Search: ${truncate(query, 80)}`)
    .setURL(`${appUrl}/en/announces`);

  if (sells.length === 0 && wants.length === 0) {
    embed.setDescription(
      [
        `No active listings match **${escapeMd(truncate(query, 60))}**.`,
        ``,
        `Post a card in the announces channel to list it, or type \`!help sell\` to see how.`,
      ].join('\n'),
    );
    return embed;
  }

  const sections = [];

  if (sells.length > 0) {
    const lines = sells.slice(0, MAX_LINES).map((s) => {
      const name = escapeMd(truncate(s.card_name || s.title));
      const link = `${appUrl}/en/announces/${s.id}`;
      return `**${name}** — ${formatPrice(s.price, s.currency)}\n↳ by **${escapeMd(truncate(s.traderName, 40))}** · [View listing](${link})`;
    });
    sections.push(`## 💰 For sale (${sells.length})\n${lines.join('\n')}`);
  }

  if (wants.length > 0) {
    const lines = wants.slice(0, MAX_LINES).map((w) => {
      const name = escapeMd(truncate(w.label));
      const qty = w.qty && w.qty > 1 ? ` ×${w.qty}` : '';
      const link = `${appUrl}/en/announces/${w.id}`;
      return `**${name}**${qty}\n↳ wanted by **${escapeMd(truncate(w.traderName, 40))}** · [View post](${link})`;
    });
    sections.push(`## 🔎 Looking for (${wants.length})`.concat('\n', lines.join('\n')));
  }

  embed.setDescription(sections.join('\n\n').slice(0, 4000));
  embed.setFooter({ text: '0nefor.one' });
  return embed;
}

// ── Definitions ───────────────────────────────────────────────────────────────
// Passed to client.application.commands.set(), which replaces the full global
// command list, so this array is the single source of truth.
function commandDefinitions() {
  return [
    {
      name: 'search',
      description: 'Find who sells or wants a card on 0nefor.one',
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
      // Discord launches the activity itself; no interaction reaches the bot.
      name: 'duel',
      description: 'Start a Remote Duel in your voice channel',
      type: ApplicationCommandType.PrimaryEntryPoint,
      handler: EntryPointCommandHandlerType.DiscordLaunchActivity,
    },
  ];
}

module.exports = { commandDefinitions, buildSearchEmbed, formatPrice, escapeMd, truncate };
