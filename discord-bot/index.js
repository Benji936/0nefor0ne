// ─────────────────────────────────────────────────────────────────────────────
// 0nefor.one Discord Bot — v2 (discord.js v14 + Discord-native monetization)
//
// Same job as v1: listens for posts in the #announces channel, looks up the
// poster in Supabase, inserts the announce, uploads images, opens a thread and
// posts the listing link.
//
// NEW in v2: Discord-native premium. A server admin can buy a **Guild
// Subscription** through Discord. Premium guilds get their community name, icon
// and a link to their 0nefor.one community page stamped on every announce.
// Free guilds get a plain announce. Entitlements are the source of truth.
//
// Because announces arrive as plain messages (no interaction payload), we can't
// read the entitlement off the message. Instead we keep an in-memory Set of
// premium guild ids, seeded on startup via the Entitlements API and kept live
// via ENTITLEMENT_CREATE/UPDATE/DELETE gateway events, then re-synced on a timer.
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');
const { parseAnnounce, ANNOUNCE_KIND } = require('./lib/parseAnnounce');
const { parseWantList, buildWantRows, wantListTitle } = require('./lib/wantList');
const { searchListings } = require('./lib/marketplace');
const { commandDefinitions, buildSearchEmbed } = require('./lib/slashCommands');

// ── Validate env ──────────────────────────────────────────────────────────────
const {
  DISCORD_BOT_TOKEN,
  DISCORD_ANNOUNCES_CHANNEL_ID, // fallback before a guild runs !setchannel
  DISCORD_PREMIUM_SKU_ID,        // the Guild Subscription SKU
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  APP_URL = 'https://0nefor.one',
} = process.env;

if (!DISCORD_BOT_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required env vars. Copy .env.example → .env and fill in all values.');
  process.exit(1);
}
if (!DISCORD_PREMIUM_SKU_ID) {
  console.warn('⚠️  DISCORD_PREMIUM_SKU_ID is not set — every guild will be treated as FREE and the upgrade button is disabled.');
}

// ── Supabase admin client (service role — bypasses RLS) ───────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Per-guild config ───────────────────────────────────────────────────────────
// Shape: Map<guildId, { channelId, threadMessage, communityUrl }>
const DEFAULT_THREAD_MESSAGE = [
  `✅ **Your announce is live!**`,
  `🔗 {link}`,
  ``,
  `• **{title}** — {price} {currency}`,
  `• 📷 {photos} photo(s) uploaded`,
  ``,
  `💬 Interested? Reply in this thread to reach the seller.`,
].join('\n');

const guildConfigs = new Map();

function getConfig(guildId) {
  if (!guildConfigs.has(guildId)) {
    guildConfigs.set(guildId, {
      channelId:     DISCORD_ANNOUNCES_CHANNEL_ID ?? null,
      threadMessage: DEFAULT_THREAD_MESSAGE,
      communityUrl:  null,
    });
  }
  return guildConfigs.get(guildId);
}

// ── Premium state ───────────────────────────────────────────────────────────────
// The single source of truth for "is this guild paid right now".
// Seeded on ready, mutated by entitlement events, re-synced on a timer.
const premiumGuilds = new Set();

/** An entitlement grants access when it has no end, or the end is in the future. */
function entitlementIsActive(ent) {
  // discord.js exposes endsTimestamp (ms) — null/undefined means indefinite.
  const ends = ent?.endsTimestamp ?? null;
  return ends === null || ends > Date.now();
}

function isPremiumGuild(guildId) {
  return premiumGuilds.has(guildId);
}

/**
 * Full re-sync from the Entitlements API. Rebuilds the Set from scratch so it
 * self-heals from any missed event. Filtered to our subscription SKU.
 */
async function syncEntitlements(client) {
  if (!DISCORD_PREMIUM_SKU_ID) return;
  try {
    const ents = await client.application.entitlements.fetch({
      skus: [DISCORD_PREMIUM_SKU_ID],
      excludeEnded: true,
    });

    const next = new Set();
    for (const ent of ents.values()) {
      if (ent.guildId && entitlementIsActive(ent)) next.add(ent.guildId);
    }

    // Swap in the fresh set.
    premiumGuilds.clear();
    for (const id of next) premiumGuilds.add(id);
    console.log(`[entitlements] synced — ${premiumGuilds.size} premium guild(s)`);
  } catch (err) {
    console.error('[entitlements] sync failed:', err);
  }
}

// ── Persistence helpers ───────────────────────────────────────────────────────
async function loadAllGuildConfigs() {
  try {
    const { data, error } = await supabase.from('bot_config').select('key, value');
    if (error) { console.error('loadAllGuildConfigs error:', error); return; }

    for (const row of data ?? []) {
      const [setting, guildId] = row.key.split(':');
      if (!guildId) continue;
      const cfg = getConfig(guildId);
      if (setting === 'announces_channel_id')   cfg.channelId     = row.value;
      if (setting === 'announce_thread_message') cfg.threadMessage = row.value;
      if (setting === 'community_url')           cfg.communityUrl  = row.value;
    }
    console.log(`   Loaded config for ${guildConfigs.size} guild(s)`);
  } catch (err) {
    console.error('loadAllGuildConfigs failed:', err);
  }
}

async function saveGuildSetting(guildId, setting, value) {
  const { error } = await supabase
    .from('bot_config')
    .upsert({ key: `${setting}:${guildId}`, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

async function deleteGuildSetting(guildId, setting) {
  const { error } = await supabase
    .from('bot_config')
    .delete()
    .eq('key', `${setting}:${guildId}`);
  if (error) throw error;
}

// ── Template rendering ──────────────────────────────────────────────────────────
function renderTemplate(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? String(vars[key]) : m));
}

// ── Help text ───────────────────────────────────────────────────────────────────
// `!help` shows an overview and points at focused sub-topics; `!help <topic>`
// prints a step-by-step for that flow. Topic words are matched loosely so the
// obvious synonyms all land somewhere sensible; anything unknown falls back to
// the overview. All copy is kept in step with what parseAnnounce actually reads
// (e.g. price is number-THEN-currency — `$45` does not parse, `45$` does).
const HELP_SELL_TOPICS  = new Set(['sell', 'sale', 'post', 'posting', 'announce', 'wts', 'trade', 'wtt']);
const HELP_LF_TOPICS    = new Set(['lf', 'looking', 'lookingfor', 'looking for', 'wanted', 'want', 'wtb', 'search', 'searching']);
const HELP_ADMIN_TOPICS = new Set(['admin', 'mod', 'mods', 'staff', 'commands']);

function helpChannelMention(cfg) {
  return cfg.channelId
    ? `<#${cfg.channelId}>`
    : '*(channel not set yet — an admin can run `!setchannel`)*';
}

function helpOverview(cfg, isAdmin) {
  const lines = [
    `**🃏 0nefor.one — help**`,
    ``,
    `I publish the cards you post in ${helpChannelMention(cfg)} to the marketplace automatically, and open a thread with a link to each listing.`,
    ``,
    `**What do you want to do?**`,
    `• 💰 **Sell or trade a card** → type \`!help sell\``,
    `• 🔎 **Look for a card (LF)** → type \`!help lf\``,
    `• 🗡️ **Duel someone over webcam** → type \`!duel\``,
    ``,
    `⚠️ First time? You need a free account — click **Login with Discord** on ${APP_URL}`,
  ];
  if (isAdmin) lines.push(``, `🛠 Managing this server? Type \`!help admin\` for mod tools.`);
  return lines.join('\n');
}

function helpSell(cfg) {
  return [
    `**💰 Selling or trading a card**`,
    ``,
    `Post this in ${helpChannelMention(cfg)}:`,
    `1️⃣ **First line** — the card name (or \`WTS: <name>\`)`,
    `2️⃣ **Price** anywhere — number **then** currency: \`45€\`, \`45$\`, \`30 GBP\`, \`19.99€\``,
    `   • Trade only? Just leave the price out.`,
    `3️⃣ **Attach at least one photo** 📷 *(required)*`,
    `4️⃣ The following lines become the description`,
    ``,
    `**Optional:** put a set code on its own line — e.g. \`LOB-EN001\` — and I'll link the exact card.`,
    ``,
    `**Example**`,
    '```',
    `WTS: Blue-Eyes White Dragon`,
    `Near mint, 1st edition`,
    `45€`,
    '```',
  ].join('\n');
}

function helpLf(cfg) {
  return [
    `**🔎 Looking For (LF) — a whole want list at once**`,
    ``,
    `Post this in ${helpChannelMention(cfg)} — **one wanted card per line**:`,
    `1️⃣ **First line** starts with \`LF:\` — the card after it counts as a want too`,
    `2️⃣ **Quantities:** \`3x Maxx "C"\`, \`x3 Maxx "C"\`, or \`3 Maxx "C"\``,
    `3️⃣ **Archetype** *(optional)*: a line \`archetype: Darklord\``,
    `4️⃣ **Budget** *(optional)*: a line \`budget 120€\``,
    `5️⃣ Start a line with \`#\` to leave yourself a note I'll ignore`,
    `6️⃣ **No photo needed**`,
    ``,
    `I match each card to the marketplace; anything I can't match I keep on the post as-is.`,
    ``,
    `**Example**`,
    '```',
    `LF: Ash Blossom & Joyous Spring`,
    `Kashtira Fenrir`,
    `3x Maxx "C"`,
    `archetype: Darklord`,
    `budget 120€`,
    '```',
  ].join('\n');
}

function helpAdmin() {
  return [
    `**🛠 Mod / Admin commands** *(need Manage Server)*`,
    `• \`!botcheck\` — show the watched channel + current plan`,
    `• \`!setchannel [#channel]\` — set the announces channel`,
    `• \`!setmessage <text|reset>\` — customize the thread message`,
    `   placeholders: \`{link}\` \`{title}\` \`{price}\` \`{currency}\` \`{photos}\``,
    `• \`!setcommunity <url|clear>\` — community link shown on announces *(Premium)*`,
    `• \`!upgrade\` — upgrade this server to Premium`,
  ].join('\n');
}

// ── Premium upgrade button ──────────────────────────────────────────────────────
// A premium-style button carries a sku_id and no custom_id/label — Discord
// renders the native purchase flow. Returns null if no SKU is configured.
function upgradeRow() {
  if (!DISCORD_PREMIUM_SKU_ID) return null;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Premium).setSKUId(DISCORD_PREMIUM_SKU_ID)
  );
}

// ── YGO set code detection ─────────────────────────────────────────────────────
const SET_CODE_RE = /^[A-Z0-9]{2,6}-[A-Z]{0,2}\d{3,4}$/i;

function extractSetCode(content) {
  const lines = content.trim().split('\n').map(l => l.trim());
  for (const line of lines) {
    if (SET_CODE_RE.test(line)) return line.trim().toUpperCase();
  }
  return null;
}

async function lookupCardBySetCode(rawCode) {
  try {
    const parts = rawCode.split('-');
    const normalizedCode = parts[0] + '-EN' + parts[1].replace(/[a-zA-Z]/g, '');
    const cardData = await new Promise((resolve, reject) => {
      const url = `https://db.ygoprodeck.com/api/v7/cardsetsinfo.php?setcode=${encodeURIComponent(normalizedCode)}`;
      https.get(url, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
        res.on('error', reject);
      }).on('error', reject);
    });
    if (!cardData || cardData.error) return null;
    return { ygo_card_id: cardData.id, card_name: cardData.name };
  } catch (err) {
    console.error('lookupCardBySetCode failed:', err);
    return null;
  }
}

// ── YGOPRODeck archetype list (cached for process lifetime) ───────────────────
let _archetypesCache = null;
const ARCHETYPES_TIMEOUT_MS = 5000;

async function getArchetypes() {
  if (_archetypesCache) return _archetypesCache;
  try {
    const list = await new Promise((resolve) => {
      let settled = false;
      const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
      const req = https.get('https://db.ygoprodeck.com/api/v7/archetypes.php', (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            finish((parsed ?? []).map(a => a?.archetype_name).filter(Boolean));
          } catch { finish([]); }
        });
        res.on('error', () => finish([]));
      });
      req.on('error', () => finish([]));
      req.setTimeout(ARCHETYPES_TIMEOUT_MS, () => { req.destroy(); finish([]); });
    });
    if (list.length > 0) _archetypesCache = list;
    return list;
  } catch (err) {
    console.error('getArchetypes failed:', err);
    return [];
  }
}

// ── Want-list resolution (Looking For bulk lists) ─────────────────────────────
// Resolve each pasted want line to a passcode, mirroring the website's
// bulkAddResolver: set codes go through lookupCardBySetCode; names use a fuzzy
// search gated to an exact (case-insensitive) or single hit. Anything ambiguous
// or unfound is kept unresolved (card: null) so the line still shows on the post.

// Strict set-code shape (mirror bulkAddParser SET_CODE_RE): PREFIX-[letters]digits.
const WANT_SET_CODE_RE = /^[A-Z0-9]+-[A-Z]*\d+$/i;

function ygoGetJson(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
      res.on('error', () => resolve(null));
    }).on('error', () => resolve(null));
  });
}

async function resolveWantLine({ qty, query }) {
  // Set-code route → reuse the sell path's lookup.
  if (WANT_SET_CODE_RE.test(query)) {
    const card = await lookupCardBySetCode(query);
    return { qty, query, card: card ? { id: card.ygo_card_id, name: card.card_name } : null };
  }
  // Name route: fuzzy search, then accept only an exact or single match.
  const data = await ygoGetJson(
    `https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(query)}`
  );
  const cards = Array.isArray(data?.data) ? data.data : [];
  if (cards.length === 0) return { qty, query, card: null };
  const needle = query.trim().toLowerCase();
  const exact = cards.find((c) => String(c?.name ?? '').toLowerCase() === needle);
  const chosen = exact ?? (cards.length === 1 ? cards[0] : null);
  return { qty, query, card: chosen ? { id: chosen.id, name: chosen.name } : null };
}

// Sequential by design (mirror resolveLines) — YGOPRODeck rate-limits bursts.
async function resolveWantLines(lines) {
  const out = [];
  for (const line of lines) out.push(await resolveWantLine(line));
  return out;
}

// Explicit `archetype:` value → canonical YGOPRODeck spelling when we recognise
// it (so the website's archetype art/filter match), else the trimmed input.
async function normalizeArchetype(raw) {
  if (!raw) return null;
  const needle = String(raw).trim().toLowerCase();
  if (!needle) return null;
  const list = await getArchetypes();
  const canon = list.find((a) => a.toLowerCase() === needle);
  return canon ?? String(raw).trim();
}

// ── Discord client ────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // enable in Dev Portal → Bot → Privileged Intents
  ],
});

// ── Helpers ───────────────────────────────────────────────────────────────────
async function findUserByDiscordId(discordUserId) {
  const { data, error } = await supabase
    .from('Trader')
    .select('id')
    .eq('discord_id', discordUserId)
    .maybeSingle();
  if (error) { console.error('Supabase lookup error:', error); return null; }
  return data?.id ?? null;
}

async function uploadAttachment(announceId, uploaderId, url, index) {
  try {
    const buffer = await new Promise((resolve, reject) => {
      const chunks = [];
      https.get(url, (res) => {
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    });
    const ext = url.split('.').pop()?.split('?')[0] ?? 'jpg';
    const safePath = `${announceId}/${uploaderId}/${Date.now()}_${index}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('announce-images')
      .upload(safePath, buffer, { contentType: 'image/jpeg', upsert: false });
    if (uploadError) { console.error('Storage upload failed:', uploadError); return null; }
    const { data } = supabase.storage.from('announce-images').getPublicUrl(safePath);
    return data.publicUrl;
  } catch (err) {
    console.error('Attachment upload error:', err);
    return null;
  }
}

// ── Main message handler ─────────────────────────────────────────────────────────
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const guildId = message.guild.id;
  const cfg = getConfig(guildId);
  const member = message.member;
  const canManage = member?.permissions.has(PermissionFlagsBits.ManageGuild);
  const canManageChannels = member?.permissions.has(PermissionFlagsBits.ManageChannels);
  const content = message.content.trim();
  const lower = content.toLowerCase();

  // ── !upgrade — anyone, shows the native premium purchase button ─────────────
  if (lower === '!upgrade' || lower === '!premium') {
    if (isPremiumGuild(guildId)) {
      await message.reply('⭐ This server is already **Premium** — your community is shown and linked on every announce. Thanks for the support!');
      return;
    }
    const row = upgradeRow();
    if (!row) {
      await message.reply('Premium is not configured on this bot yet.');
      return;
    }
    await message.reply({
      content: [
        `⭐ **Upgrade this server to Premium**`,
        ``,
        `Every announce posted here will show **your community name, icon and a link back to your 0nefor.one community page** — turning each listing into free promotion for your server.`,
        ``,
        `Set your link with \`!setcommunity <url>\` after upgrading.`,
      ].join('\n'),
      components: [row],
    });
    return;
  }

  // ── !botcheck — mods/admins only ─────────────────────────────────────────────
  if (lower === '!botcheck') {
    if (!canManage && !canManageChannels) {
      await message.reply('⛔ This command is for moderators and admins only.');
      return;
    }
    const currentId = message.channelId;
    const parentId  = message.channel?.parentId ?? null;
    const watching  = cfg.channelId;
    const isMatch   = watching && (currentId === watching || parentId === watching);

    await message.reply([
      `**OneforOne bot — diagnostics**`,
      `🏠 **Server:** ${message.guild.name}`,
      `⭐ **Plan:** ${isPremiumGuild(guildId) ? 'Premium (community branding ON)' : 'Free'}`,
      cfg.communityUrl ? `🔗 **Community link:** ${cfg.communityUrl}` : null,
      ``,
      `🔍 **This channel ID:** \`${currentId}\``,
      parentId ? `📁 **Parent channel ID:** \`${parentId}\`` : null,
      watching
        ? `👁 **Watching channel:** <#${watching}> (\`${watching}\`)`
        : `👁 **No channel set yet.** Use \`!setchannel\` to configure one.`,
      ``,
      isMatch
        ? `✅ **Match! Posts in this channel will be processed.**`
        : watching
          ? `❌ **No match.** Post in <#${watching}>, or run \`!setchannel\` here to switch.`
          : `⚠️ Run \`!setchannel\` in your announces channel to set it up.`,
    ].filter(Boolean).join('\n'));
    return;
  }

  // ── !duel — anyone, explains the Remote Duel activity ───────────────────────
  if (lower === '!duel' || lower === '!remoteduel') {
    await message.reply([
      `🗡️ **Remote Duel**`,
      ``,
      `Play a webcam duel with the built-in companion. Join a voice channel with your opponent, then open **Remote Duel** from the channel's activity launcher (the rocket 🚀 button).`,
      ``,
      `You both share, live: **Life Points**, a **coin flip**, a **dice roll**, a **first-turn** picker and a **turn timer**.`,
      ``,
      `No account needed to duel.`,
    ].join('\n'));
    return;
  }

  // ── !help [topic] ────────────────────────────────────────────────────────────
  // `!help` → overview; `!help sell` / `!help lf` / `!help admin` → focused guides.
  if (lower === '!help' || lower.startsWith('!help ')) {
    const topic = lower.slice('!help'.length).trim();
    const isAdmin = canManage || canManageChannels;
    let text;
    if (HELP_SELL_TOPICS.has(topic))       text = helpSell(cfg);
    else if (HELP_LF_TOPICS.has(topic))    text = helpLf(cfg);
    else if (HELP_ADMIN_TOPICS.has(topic)) text = helpAdmin();
    else                                   text = helpOverview(cfg, isAdmin); // also the unknown-topic fallback
    await message.reply(text);
    return;
  }

  // ── !setchannel [#channel] — admin only ──────────────────────────────────────
  if (lower.startsWith('!setchannel')) {
    if (!canManage) {
      await message.reply('⛔ You need the **Manage Server** permission to change the announces channel.');
      return;
    }
    const target = message.mentions.channels.first() ?? message.channel;
    try {
      await saveGuildSetting(guildId, 'announces_channel_id', target.id);
      cfg.channelId = target.id;
      await message.reply(`✅ Bot now listens for announces in <#${target.id}> on **${message.guild.name}**.`);
    } catch (err) {
      console.error('setchannel failed:', err);
      await message.reply('⚠️ Could not save the channel. Please try again.');
    }
    return;
  }

  // ── !setcommunity <url> — Premium + admin only ───────────────────────────────
  if (lower.startsWith('!setcommunity')) {
    if (!canManage) {
      await message.reply('⛔ You need the **Manage Server** permission to set the community link.');
      return;
    }
    if (!isPremiumGuild(guildId)) {
      const row = upgradeRow();
      await message.reply({
        content: '⭐ **Community links are a Premium feature.** Upgrade to show your community name and link on every announce.',
        components: row ? [row] : [],
      });
      return;
    }
    const arg = content.slice('!setcommunity'.length).trim();
    if (!arg) {
      await message.reply(
        cfg.communityUrl
          ? `Current community link: ${cfg.communityUrl}\nChange it with \`!setcommunity <url>\`, or clear it with \`!setcommunity clear\`.`
          : 'Set your community link with `!setcommunity <url>` — e.g. your 0nefor.one community page.'
      );
      return;
    }
    if (arg.toLowerCase() === 'clear') {
      try {
        await deleteGuildSetting(guildId, 'community_url');
        cfg.communityUrl = null;
        await message.reply('✅ Community link cleared.');
      } catch (err) {
        console.error('setcommunity clear failed:', err);
        await message.reply('⚠️ Could not clear the link. Please try again.');
      }
      return;
    }
    // Minimal URL sanity check — must be http(s).
    let valid = false;
    try { const u = new URL(arg); valid = u.protocol === 'http:' || u.protocol === 'https:'; } catch { valid = false; }
    if (!valid) {
      await message.reply('⚠️ That doesn\'t look like a valid URL. Include `https://`.');
      return;
    }
    try {
      await saveGuildSetting(guildId, 'community_url', arg);
      cfg.communityUrl = arg;
      await message.reply(`✅ Community link set. It will appear on every announce from this server:\n${arg}`);
    } catch (err) {
      console.error('setcommunity failed:', err);
      await message.reply('⚠️ Could not save the link. Please try again.');
    }
    return;
  }

  // ── !setmessage [text|reset] — admin only ────────────────────────────────────
  if (/^!setmessage\b/i.test(content)) {
    if (!canManage) {
      await message.reply('⛔ You need the **Manage Server** permission to change the announce message.');
      return;
    }
    const arg = content.slice('!setmessage'.length).trim();
    if (!arg) {
      await message.reply(
        'Placeholders: `{link}` `{title}` `{price}` `{currency}` `{photos}`\n' +
        '**Current announce message:**\n```\n' + cfg.threadMessage + '\n```\n' +
        'Set a new one with `!setmessage <your text>`, or `!setmessage reset` to restore the default.'
      );
      return;
    }
    if (arg.toLowerCase() === 'reset') {
      try {
        await deleteGuildSetting(guildId, 'announce_thread_message');
        cfg.threadMessage = DEFAULT_THREAD_MESSAGE;
        await message.reply('✅ Announce message reset to the default.');
      } catch (err) {
        console.error('setmessage reset failed:', err);
        await message.reply('⚠️ Could not reset the message. Please try again.');
      }
      return;
    }
    if (arg.length > 1500) {
      await message.reply('⚠️ That message is too long (max ~1500 characters).');
      return;
    }
    try {
      await saveGuildSetting(guildId, 'announce_thread_message', arg);
      cfg.threadMessage = arg;
      const preview = renderTemplate(arg, {
        link: `${APP_URL}/en/announces/123`,
        title: 'Blue-Eyes White Dragon', price: 45, currency: 'EUR', photos: 2,
      });
      await message.reply('✅ Announce message updated. Preview:\n```\n' + preview + '\n```');
    } catch (err) {
      console.error('setmessage failed:', err);
      await message.reply('⚠️ Could not save the message. Please try again.');
    }
    return;
  }

  // ── Announce processing — only in this guild's configured channel ─────────────
  if (!cfg.channelId) return;
  const isInAnnouncesChannel =
    message.channelId === cfg.channelId ||
    message.channel?.parentId === cfg.channelId;
  if (!isInAnnouncesChannel) return;

  const discordUserId = message.author.id;
  const supabaseUserId = await findUserByDiscordId(discordUserId);

  if (!supabaseUserId) {
    await message.reply({
      content: [
        `👋 **Hey ${message.author.username}!** To post an announce on **0nefor.one**, you need a free account.`,
        ``,
        `✨ It takes **5 seconds** — just click **Login with Discord** on the site:`,
        `🔗 **${APP_URL}**`,
        ``,
        `Once you're signed in, post here again and your announce will go live automatically!`,
      ].join('\n'),
    });
    return;
  }

  const parsed = parseAnnounce(message.content);
  const isLf = parsed.kind === ANNOUNCE_KIND.LOOKING_FOR;
  const kind = parsed.kind;

  // Fields both paths fill; LF and Sell diverge on how they get there.
  let title = '';
  let description = '';
  let price = parsed.price;
  let currency = parsed.currency;
  let archetype = null;
  const wantDetail = null;   // superseded by the want list for LF; unused for Sell
  let wantRows = [];         // announce_want_card rows (LF only)
  let cardLink = null;       // single-card set-code link (Sell only)
  let setCodeWarning = null;

  if (isLf) {
    // Looking For is a bulk want list: every line is a wanted card, except an
    // `archetype:` line, a standalone budget line, and `#` comments. Mirrors the
    // website's paste-a-list flow and writes the same announce_want_card rows.
    if (typeof message.channel?.sendTyping === 'function') message.channel.sendTyping().catch(() => {});
    const want = parseWantList(message.content);
    const resolved = await resolveWantLines(want.wantLines);
    wantRows = buildWantRows(resolved);
    archetype = await normalizeArchetype(want.archetype);
    if (want.price != null) { price = want.price; currency = want.currency; }
    title = wantListTitle(wantRows);

    if (wantRows.length === 0 && !archetype) {
      await message.reply(
        '🔎 I couldn\'t read any cards. Put one wanted card per line under your `LF:` — for example:\n' +
        '```\nLF: Ash Blossom & Joyous Spring\nKashtira Fenrir\n3x Maxx "C"\narchetype: Darklord\n```'
      );
      return;
    }
    if (!title) title = archetype ? `LF: ${archetype}` : 'Looking For';
  } else {
    // Sell/trade: a single card, needs a title and (later) a photo.
    title = parsed.title;
    description = parsed.description;
    if (!title) {
      await message.reply('❓ Could not read a title from your message. Start with the card name or `WTS: [name]`.');
      return;
    }
    const detectedSetCode = extractSetCode(message.content);
    if (detectedSetCode) {
      cardLink = await lookupCardBySetCode(detectedSetCode);
      if (!cardLink) setCodeWarning = `⚠️ Set code \`${detectedSetCode}\` not found — announce posted without card link.`;
    }
  }

  const imageAttachments = [...message.attachments.values()].filter(
    (a) => a.contentType?.startsWith('image/')
  );
  if (imageAttachments.length === 0 && !isLf) {
    await message.reply('📷 Your announce needs at least one photo. Please repost your listing with an image attached.');
    return;
  }

  // ── PREMIUM GATE ────────────────────────────────────────────────────────────
  // The whole business model is this branch: community branding is written ONLY
  // for premium guilds. Free guilds post plain announces.
  const premium = isPremiumGuild(guildId);
  const guildName = premium ? message.guild.name : null;
  const guildIcon = premium ? (message.guild.iconURL({ extension: 'png', size: 128 }) ?? null) : null;
  const communityUrl = premium ? (cfg.communityUrl ?? null) : null;

  const discordUrl = `https://discord.com/channels/${message.guild.id}/${message.channelId}/${message.id}`;

  const { data: announceData, error: announceError } = await supabase
    .from('announce')
    .insert({
      seller: supabaseUserId,
      title,
      description,
      price,
      currency,
      status: 'active',
      kind,
      archetype:   archetype  ?? null,
      want_detail: wantDetail ?? null,
      discord_url:        discordUrl,
      discord_guild_name: guildName,     // null for free guilds
      discord_guild_icon: guildIcon,     // null for free guilds
      community_url:      communityUrl,  // null for free guilds
      ygo_card_id: cardLink?.ygo_card_id ?? null,
      card_name:   cardLink?.card_name   ?? null,
    })
    .select('id')
    .single();

  if (announceError) {
    console.error('announce insert error:', announceError);
    await message.reply('⚠️ Something went wrong saving your announce. Please try again in a moment.');
    return;
  }

  const announceId = announceData.id;

  // Looking For want list → child rows. Service-role client, so RLS is bypassed.
  if (isLf && wantRows.length > 0) {
    const toInsert = wantRows.map((r) => ({ announce: announceId, ...r }));
    const { error: wantErr } = await supabase.from('announce_want_card').insert(toInsert);
    if (wantErr) console.error('announce_want_card insert error:', wantErr);
  }

  const uploads = await Promise.all(
    imageAttachments.map((att, i) => uploadAttachment(announceId, supabaseUserId, att.url, i))
  );
  const imageRecords = uploads
    .filter(Boolean)
    .map((url, sort_order) => ({ announce: announceId, uploader: supabaseUserId, url, sort_order }));
  if (imageRecords.length > 0) {
    const { error: imgError } = await supabase.from('announce_image').insert(imageRecords);
    if (imgError) console.error('announce_image insert error:', imgError);
  }

  const confirmationLines = [renderTemplate(cfg.threadMessage, {
    link:     `${APP_URL}/en/announces/${announceId}`,
    title,
    price:    price ?? 'no price set',
    currency: price === null ? '' : currency,
    photos:   imageAttachments.length,
  })];
  if (isLf) {
    const matched = wantRows.filter((r) => r.ygo_card_id != null).length;
    const bits = [`🔎 **Looking For** — ${wantRows.length} card${wantRows.length === 1 ? '' : 's'}`];
    if (wantRows.length && matched < wantRows.length) bits.push(`(${matched} matched to the marketplace)`);
    if (archetype) bits.push(`· archetype **${archetype}**`);
    confirmationLines.unshift(bits.join(' '));
  }
  if (cardLink) {
    confirmationLines.push(`🃏 Linked to **${cardLink.card_name}**`);
  }
  if (premium && communityUrl) {
    confirmationLines.push(`🏠 Posted from **${message.guild.name}** — ${communityUrl}`);
  }
  const confirmation = { content: confirmationLines.join('\n') };

  let thread = null;
  try {
    thread = await message.startThread({ name: title.slice(0, 100), autoArchiveDuration: 10080 });
  } catch (err) {
    console.error('Failed to create thread:', err);
  }

  if (thread) {
    const threadUrl = `https://discord.com/channels/${message.guild.id}/${thread.id}`;
    const { error: urlError } = await supabase
      .from('announce')
      .update({ discord_url: threadUrl })
      .eq('id', announceId);
    if (urlError) console.error('discord_url update error:', urlError);
    await thread.send(confirmation);
  } else {
    await message.reply(confirmation);
  }

  if (setCodeWarning) {
    if (thread) await thread.send(setCodeWarning);
    else await message.reply(setCodeWarning);
  }

  console.log(
    `[${message.guild.name}] ${premium ? 'PREMIUM' : 'free'} ${kind} #${announceId} "${title}" ` +
    `${price ?? 'no price'}${price === null ? '' : currency} | user=${discordUserId}`
  );
});

// ── Thread deleted in Discord → delete the linked announce ────────────────────
client.on(Events.ThreadDelete, async (thread) => {
  try {
    const threadUrl = `https://discord.com/channels/${thread.guild.id}/${thread.id}`;
    const { data, error } = await supabase
      .from('announce')
      .delete()
      .eq('discord_url', threadUrl)
      .select('id');
    if (error) { console.error('threadDelete → announce delete error:', error); return; }
    if (data?.length) console.log(`[threadDelete] deleted announce #${data[0].id}`);
  } catch (err) {
    console.error('threadDelete handler failed:', err);
  }
});

// ── Entitlement events → keep the premium set live ────────────────────────────
client.on(Events.EntitlementCreate, (ent) => {
  if (DISCORD_PREMIUM_SKU_ID && ent.skuId !== DISCORD_PREMIUM_SKU_ID) return;
  if (ent.guildId && entitlementIsActive(ent)) {
    premiumGuilds.add(ent.guildId);
    console.log(`[entitlements] +premium guild ${ent.guildId}`);
  }
});

client.on(Events.EntitlementUpdate, (_oldEnt, ent) => {
  if (DISCORD_PREMIUM_SKU_ID && ent.skuId !== DISCORD_PREMIUM_SKU_ID) return;
  if (!ent.guildId) return;
  if (entitlementIsActive(ent)) {
    premiumGuilds.add(ent.guildId);
  } else {
    premiumGuilds.delete(ent.guildId);
    console.log(`[entitlements] -premium guild ${ent.guildId} (ended)`);
  }
});

client.on(Events.EntitlementDelete, (ent) => {
  if (DISCORD_PREMIUM_SKU_ID && ent.skuId !== DISCORD_PREMIUM_SKU_ID) return;
  if (ent.guildId) {
    premiumGuilds.delete(ent.guildId);
    console.log(`[entitlements] -premium guild ${ent.guildId} (removed)`);
  }
});

// ── Website announce deleted → delete the linked Discord thread ───────────────
const DELETION_POLL_MS = 15000;

async function processThreadDeletionQueue() {
  try {
    const { data, error } = await supabase
      .from('discord_thread_deletion_queue')
      .select('id, thread_id')
      .order('id', { ascending: true })
      .limit(25);
    if (error) { console.error('deletion queue fetch error:', error); return; }

    for (const row of data ?? []) {
      try {
        const channel = await client.channels.fetch(row.thread_id).catch(() => null);
        if (channel?.isThread()) {
          await channel.delete('Linked announce deleted on 0nefor.one');
          console.log(`[announce delete] removed Discord thread ${row.thread_id}`);
        }
      } catch (err) {
        console.error(`Failed to delete thread ${row.thread_id}:`, err);
      }
      await supabase.from('discord_thread_deletion_queue').delete().eq('id', row.id);
    }
  } catch (err) {
    console.error('processThreadDeletionQueue failed:', err);
  }
}

// ── Slash commands ────────────────────────────────────────────────────────────
// `set()` replaces the whole global command list, so lib/slashCommands.js stays
// the single source of truth and re-running this is idempotent.
async function registerSlashCommands(c) {
  try {
    const registered = await c.application.commands.set(commandDefinitions());
    console.log(`   Slash commands registered (${registered.size}): ${[...registered.values()].map((x) => '/' + x.name).join(' ')}`);
  } catch (err) {
    console.error('⚠️ Slash command registration failed:', err);
  }
}

async function handleSearchCommand(interaction) {
  const query = interaction.options.getString('card', true);
  await interaction.deferReply(); // YGO/Supabase lookups can exceed the 3s window
  const results = await searchListings(supabase, query);
  await interaction.editReply({ embeds: [buildSearchEmbed(results, APP_URL)] });
}

async function handleLfCommand(interaction) {
  // Ephemeral: the announce itself is the public artifact, not this reply.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const sellerId = await findUserByDiscordId(interaction.user.id);
  if (!sellerId) {
    await interaction.editReply(
      `❌ I could not find your 0nefor.one account. Click **Login with Discord** on ${APP_URL}, then try again.`
    );
    return;
  }

  // The bulk parser is line based; a slash option is one line, so treat commas
  // as line breaks (and keep real newlines if the user pasted any).
  const raw = interaction.options.getString('cards', true);
  const content = raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n');

  const parsed = parseWantList(content);
  const resolved = await resolveWantLines(parsed.wantLines);
  const wantRows = buildWantRows(resolved);
  const archetype = await normalizeArchetype(
    interaction.options.getString('archetype') ?? parsed.archetype
  );

  if (wantRows.length === 0 && !archetype) {
    await interaction.editReply(
      '❓ I could not read any cards from that. Separate them with commas, e.g. `3x Maxx "C", Ash Blossom & Joyous Spring`.'
    );
    return;
  }

  const premium = isPremiumGuild(interaction.guildId);
  const cfg = getConfig(interaction.guildId);
  const title = wantRows.length > 0 ? wantListTitle(wantRows) : `LF: ${archetype}`;

  const { data: announceData, error: announceError } = await supabase
    .from('announce')
    .insert({
      seller: sellerId,
      title,
      description: null,
      price: parsed.price ?? null,
      currency: parsed.currency ?? null,
      status: 'active',
      kind: ANNOUNCE_KIND.LOOKING_FOR,
      archetype: archetype ?? null,
      want_detail: null,
      discord_url: null, // no source message for a slash command
      discord_guild_name: premium ? (interaction.guild?.name ?? null) : null,
      discord_guild_icon: premium ? (interaction.guild?.iconURL({ extension: 'png', size: 128 }) ?? null) : null,
      community_url: premium ? (cfg.communityUrl ?? null) : null,
    })
    .select('id')
    .single();

  if (announceError) {
    console.error('/lf announce insert error:', announceError);
    await interaction.editReply('⚠️ Something went wrong saving your want list. Please try again in a moment.');
    return;
  }

  const announceId = announceData.id;
  if (wantRows.length > 0) {
    const { error: wantErr } = await supabase
      .from('announce_want_card')
      .insert(wantRows.map((r) => ({ announce: announceId, ...r })));
    if (wantErr) console.error('/lf want rows insert error:', wantErr);
  }

  const matched = wantRows.filter((r) => r.ygo_card_id != null).length;
  await interaction.editReply(
    [
      `🔎 **Looking For** posted — ${wantRows.length} card(s)` +
        (matched ? ` (${matched} matched to the marketplace)` : '') +
        (archetype ? ` · archetype **${archetype}**` : ''),
      `${APP_URL}/en/announces/${announceId}`,
    ].join('\n')
  );
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  try {
    if (interaction.commandName === 'search') return await handleSearchCommand(interaction);
    if (interaction.commandName === 'lf') return await handleLfCommand(interaction);
  } catch (err) {
    console.error(`/${interaction.commandName} failed:`, err);
    const msg = '⚠️ Something went wrong. Please try again in a moment.';
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(msg).catch(() => {});
    } else {
      await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
});

// ── Ready ──────────────────────────────────────────────────────────────────────
const ENTITLEMENT_RESYNC_MS = 10 * 60 * 1000; // re-sync every 10 min, self-heals

client.once(Events.ClientReady, async (c) => {
  await loadAllGuildConfigs();
  await registerSlashCommands(c);
  await syncEntitlements(c);
  setInterval(() => syncEntitlements(c), ENTITLEMENT_RESYNC_MS);

  processThreadDeletionQueue();
  setInterval(processThreadDeletionQueue, DELETION_POLL_MS);

  console.log(`✅ Bot ready — logged in as ${c.user.tag}`);
  console.log(`   Active on ${c.guilds.cache.size} server(s)`);
  console.log(`   Premium SKU: ${DISCORD_PREMIUM_SKU_ID || '(none configured)'}`);
});

client.login(DISCORD_BOT_TOKEN);
