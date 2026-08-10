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
const { createHash } = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { parseAnnounce, ANNOUNCE_KIND } = require('./lib/parseAnnounce');
const { parseWantList, buildWantRows, wantListTitle } = require('./lib/wantList');
const { isCloseCommand, closedStatusFor, canCloseAnnounce } = require('./lib/closeAnnounce');
const { searchListings } = require('./lib/marketplace');
const { commandDefinitions, buildSearchEmbed, escapeMd } = require('./lib/slashCommands');
const { buildEventEmbed, eventAnnouncement } = require('./lib/eventPost');

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
// Shape: Map<guildId, { channelId, threadMessage, communityUrl, eventsChannelId }>
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
      channelId:       DISCORD_ANNOUNCES_CHANNEL_ID ?? null,
      threadMessage:   DEFAULT_THREAD_MESSAGE,
      communityUrl:    null,
      // Null means "wherever announces go". A server that never sets this still
      // gets its events; one that wants a #events channel says so once.
      eventsChannelId: null,
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

// Guilds whose linked community is verified on the website. Paying either way
// buys the same thing, so a store that subscribed on 0nefor.one gets the bot's
// premium features here without buying a second subscription through Discord.
//
// This is the only honest form of "and vice versa": Discord mints Guild
// Subscription entitlements when somebody pays Discord, and there is no
// production API to grant one for free. So the bot honours the website's
// answer rather than pretending Discord issued something.
const siteVerifiedGuilds = new Set();

function isPremiumGuild(guildId) {
  return premiumGuilds.has(guildId) || siteVerifiedGuilds.has(guildId);
}

/**
 * A Discord Guild Subscription verifies the linked community on the website.
 *
 * Two things have to be true beyond the entitlement, and the second is the one
 * that matters: the guild must be linked to a community by /verify, and the
 * Discord account that **owns the guild** must be the account that owns the
 * community. Manage Server is enough to link a server; it is not enough to
 * spend the server owner's subscription on your own listing.
 *
 * Writes only `discord_entitlement_at`, then asks the database to recompute.
 * `community.verified` is derived from Stripe and Discord together, so an
 * entitlement ending can never strip the badge from somebody paying by card.
 */
async function syncGuildEntitlement(guildId, active) {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return; // not a server we are in; nothing to check ownership against

    const { data, error } = await supabase.rpc('discord_entitlement_target', { p_guild_id: guildId });
    if (error) { console.error('[entitlement→site] target lookup failed:', error); return; }
    const target = Array.isArray(data) ? data[0] : null;
    if (!target?.community_id) return; // never linked, or identity not proved yet

    if (!target.owner_discord_id || target.owner_discord_id !== guild.ownerId) {
      // Linked, but by somebody who is not the server's owner. Say so once
      // rather than every ten minutes.
      if (active && !entitlementOwnerWarned.has(guildId)) {
        entitlementOwnerWarned.add(guildId);
        console.warn(
          `[entitlement→site] guild ${guildId} is premium but its owner is not the community owner — not verifying`,
        );
      }
      return;
    }

    const { data: claim } = await supabase
      .from('community_claim')
      .select('id, discord_entitlement_at')
      .eq('community', target.community_id)
      .not('discord_guild_id', 'is', null)
      .maybeSingle();
    if (!claim) return;

    const held = claim.discord_entitlement_at != null;
    if (held === active) return; // already in the state we want; no write, no noise

    const { error: writeErr } = await supabase
      .from('community_claim')
      .update({ discord_entitlement_at: active ? new Date().toISOString() : null })
      .eq('id', claim.id);
    if (writeErr) { console.error('[entitlement→site] write failed:', writeErr); return; }

    const { data: verified, error: recErr } = await supabase
      .rpc('recompute_community_verified', { p_community: target.community_id });
    if (recErr) { console.error('[entitlement→site] recompute failed:', recErr); return; }

    console.log(
      `[entitlement→site] guild ${guildId} → community ${target.community_id}: ` +
      `entitlement ${active ? 'granted' : 'ended'}, verified=${verified}`,
    );
  } catch (err) {
    console.error('syncGuildEntitlement failed:', err);
  }
}

const entitlementOwnerWarned = new Set();

/** The reverse direction: who is verified on the website right now. */
async function syncSiteVerifiedGuilds() {
  try {
    const { data, error } = await supabase
      .from('community_claim')
      .select('discord_guild_id, community!inner(verified)')
      .not('discord_guild_id', 'is', null)
      .eq('community.verified', true);
    if (error) { console.error('[site→premium] fetch failed:', error); return; }

    siteVerifiedGuilds.clear();
    for (const row of data ?? []) {
      if (row.discord_guild_id) siteVerifiedGuilds.add(row.discord_guild_id);
    }
    console.log(`[site→premium] ${siteVerifiedGuilds.size} guild(s) premium via website verification`);
  } catch (err) {
    console.error('syncSiteVerifiedGuilds failed:', err);
  }
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

    // Push the answer to the website for every server we are in, not only the
    // premium ones: this is also how an entitlement that ended while the bot
    // was down gets cleared. syncGuildEntitlement writes nothing when the state
    // already matches, so the usual pass is all reads.
    for (const guildId of client.guilds.cache.keys()) {
      await syncGuildEntitlement(guildId, premiumGuilds.has(guildId));
    }
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
      if (setting === 'events_channel_id')       cfg.eventsChannelId = row.value;
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
    `• ✅ **Close one of your listings** → type \`!sold\` or \`!close\` in its thread`,
    `• 🗡️ **Duel someone over webcam** → type \`!duel\``,
    ``,
    `⚠️ First time? Link a free account so your listings live on your profile — click **Login with Discord** on ${APP_URL}`,
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
    ``,
    `**When it sells** — type \`!sold\` in your listing's thread. That takes it off`,
    `the marketplace and locks the thread. \`!close\` does the same for a listing`,
    `you simply no longer want up.`,
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
    ``,
    `**When you find it** — type \`!found\` in your post's thread to take it down,`,
    `or \`!close\` if you gave up on the hunt.`,
  ].join('\n');
}

function helpAdmin() {
  return [
    `**🛠 Mod / Admin commands** *(need Manage Server)*`,
    `• \`!botcheck\` — show the watched channel + current plan`,
    `• \`!setchannel [#channel]\` — set the announces channel`,
    `• \`!setmessage <text|reset>\` — customize the thread message`,
    `   placeholders: \`{link}\` \`{title}\` \`{price}\` \`{currency}\` \`{photos}\``,
    `• \`!seteventchannel [#channel|clear]\` — where your community's events are posted`,
    `• \`!setcommunity <url|clear>\` — community link shown on announces *(Premium)*`,
    `• \`!upgrade\` — upgrade this server to Premium`,
    `• \`!close\` / \`!sold\` — in a listing's thread, close it on the author's behalf`,
    `   *(needs Manage Messages; authors can always close their own)*`,
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

/**
 * The community this server is linked to, if any.
 *
 * This is what lets somebody post without a 0nefor.one account: the announce is
 * owned by the community instead of by a member. It deliberately requires the
 * link that `/verify` creates, so an unlinked server has no community to post
 * into and its members still get the signup prompt.
 */
async function findCommunityByGuildId(guildId) {
  // Not maybeSingle(): there is no unique index on discord_guild_id, and one
  // stray duplicate must not start rejecting every post in the server.
  const { data, error } = await supabase
    .from('community_claim')
    .select('community_row:community!inner(id, name, slug)')
    .eq('discord_guild_id', guildId)
    .order('id', { ascending: true })
    .limit(1);
  if (error) { console.error('Community lookup error:', error); return null; }
  return data?.[0]?.community_row ?? null;
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
    // Community announces have no uploader account. The path segment is only a
    // namespace (no storage policy reads it), so a literal stands in fine.
    const safePath = `${announceId}/${uploaderId ?? 'community'}/${Date.now()}_${index}.${ext}`;
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

  // ── !close / !sold — close your own listing, from its thread ─────────────────
  // Both retire the announce; they differ only in the status written, which is
  // what the marketplace shows. `!sold` is the happy ending, `!close` is "never
  // mind". Either way the listing leaves the marketplace (fetchAnnounces only
  // returns status = 'active') and the thread is locked so the conversation
  // stops without destroying the history.
  if (isCloseCommand(lower)) {
    if (!message.channel?.isThread()) {
      await message.reply('💬 Use this **inside your listing\'s thread** — the thread the bot opened under your announce.');
      return;
    }

    const threadUrl = `https://discord.com/channels/${guildId}/${message.channelId}`;
    const { data: row, error } = await supabase
      .from('announce')
      .select('id, title, kind, status, seller, discord_author_id')
      .eq('discord_url', threadUrl)
      .maybeSingle();

    if (error) {
      console.error('close lookup failed:', error);
      await message.reply('⚠️ Could not reach the marketplace. Please try again in a moment.');
      return;
    }
    if (!row) {
      await message.reply('🤔 This thread is not linked to a listing, so there is nothing to close.');
      return;
    }
    if (row.status !== 'active') {
      await message.reply(`✅ **${row.title}** is already closed (${row.status}).`);
      return;
    }

    // Who may close it. Both branches guard against a null on either side:
    // a community announce has no seller, and a visitor has no account, so an
    // unguarded comparison would let null match null and hand strangers the key.
    const myUserId = await findUserByDiscordId(message.author.id);
    const isAuthor = canCloseAnnounce({
      announce: row, discordUserId: message.author.id, supabaseUserId: myUserId,
    });
    // Mods can close on the author's behalf: people leave servers, and a stale
    // listing should not be un-closable because its author is gone.
    const isMod = !!(canManage || member?.permissions.has(PermissionFlagsBits.ManageMessages));

    if (!isAuthor && !isMod) {
      await message.reply('⛔ Only the person who posted this listing can close it.');
      return;
    }

    const status = closedStatusFor(lower);
    const sold = status === 'sold';

    const { error: updErr } = await supabase
      .from('announce')
      .update({ status })
      .eq('id', row.id);
    if (updErr) {
      console.error('close update failed:', updErr);
      await message.reply('⚠️ Could not close the listing. Please try again in a moment.');
      return;
    }

    const isLfRow = row.kind === ANNOUNCE_KIND.LOOKING_FOR;
    const headline = sold
      ? (isLfRow ? '🎯 Marked as **found**.' : '💰 Marked as **sold**.')
      : '📕 Listing **closed**.';
    // Reply before locking: a message sent to an archived thread would reopen it.
    await message.reply(
      `${headline} **${row.title}** has been removed from the marketplace.` +
      (isMod && !isAuthor ? `\n🛡️ Closed by a moderator.` : ''),
    );

    // Best-effort: the listing is already closed on the site, and failing to
    // tidy the thread must not make it look like the command did not work.
    try {
      await message.channel.setLocked(true);
      await message.channel.setArchived(true);
    } catch (err) {
      console.error('close: could not lock/archive thread:', err);
    }
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

  // ── !seteventchannel [#channel|clear] — admin only ───────────────────────────
  // Where this server's 0nefor.one events are announced. Unset means they land
  // in the announces channel, so a verified community gets them without doing
  // anything; this exists for servers that want them kept apart.
  if (lower.startsWith('!seteventchannel')) {
    if (!canManage) {
      await message.reply('⛔ You need the **Manage Server** permission to change the events channel.');
      return;
    }
    const arg = content.slice('!seteventchannel'.length).trim().toLowerCase();
    try {
      if (arg === 'clear' || arg === 'reset') {
        await deleteGuildSetting(guildId, 'events_channel_id');
        cfg.eventsChannelId = null;
        await message.reply(
          cfg.channelId
            ? `✅ Events will go to the announces channel, <#${cfg.channelId}>.`
            : '✅ Events channel cleared. Set an announces channel with `!setchannel` so events have somewhere to go.',
        );
        return;
      }
      const target = message.mentions.channels.first() ?? message.channel;
      await saveGuildSetting(guildId, 'events_channel_id', target.id);
      cfg.eventsChannelId = target.id;
      // A guild that was skipped for having no channel deserves another look.
      eventChannelWarned.delete(guildId);
      await message.reply(
        `✅ Events from your 0nefor.one community will be posted in <#${target.id}>.\n` +
        `Your community has to be **verified**, and this server linked to it with \`/verify\`.`,
      );
    } catch (err) {
      console.error('seteventchannel failed:', err);
      await message.reply('⚠️ Could not save the events channel. Please try again.');
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

  // No account is no longer a dead end. If this server is linked to a community,
  // the announce goes live owned by that community, tagged with the author's
  // public Discord identity, and buyers are pointed back to the Discord message.
  // Signing up later retro-claims every announce posted this way (see
  // claim_community_announces in 20260810_community_announce.sql).
  const community = supabaseUserId ? null : await findCommunityByGuildId(guildId);

  if (!supabaseUserId && !community) {
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
      seller: supabaseUserId,                     // null for a community announce
      community: community?.id ?? null,           // set only when there is no seller
      discord_author_id:     supabaseUserId ? null : discordUserId,
      discord_author_name:   supabaseUserId ? null : message.author.displayName ?? message.author.username,
      discord_author_avatar: supabaseUserId ? null : (message.author.displayAvatarURL({ extension: 'png', size: 128 }) ?? null),
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
  if (community) {
    // Say plainly that the listing is not on their own account yet, and what
    // signing up would change. This is the pitch the old signup gate used to
    // make, except now it is made after the announce is already live.
    confirmationLines.push(
      `👥 Posted under **${community.name}**, with your Discord name on it. ` +
      `Buyers will be sent to this message to reach you.`,
      `💡 Sign in with Discord at ${APP_URL} and this listing becomes yours automatically.`,
    );
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
    syncGuildEntitlement(ent.guildId, true);
  }
});

client.on(Events.EntitlementUpdate, (_oldEnt, ent) => {
  if (DISCORD_PREMIUM_SKU_ID && ent.skuId !== DISCORD_PREMIUM_SKU_ID) return;
  if (!ent.guildId) return;
  if (entitlementIsActive(ent)) {
    premiumGuilds.add(ent.guildId);
    syncGuildEntitlement(ent.guildId, true);
  } else {
    premiumGuilds.delete(ent.guildId);
    console.log(`[entitlements] -premium guild ${ent.guildId} (ended)`);
    syncGuildEntitlement(ent.guildId, false);
  }
});

client.on(Events.EntitlementDelete, (ent) => {
  if (DISCORD_PREMIUM_SKU_ID && ent.skuId !== DISCORD_PREMIUM_SKU_ID) return;
  if (ent.guildId) {
    premiumGuilds.delete(ent.guildId);
    console.log(`[entitlements] -premium guild ${ent.guildId} (removed)`);
    syncGuildEntitlement(ent.guildId, false);
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

// ── A verified community's events → its own Discord server ────────────────────
//
// The guild/community link is written by /verify. Everything else lives in
// community_event_post: which events have been announced, where, and which
// announcements now have to come down. See the migration for the shape.
//
// Polling rather than realtime, matching the deletion queue above: one query a
// minute against an indexed anti-join is cheaper than another live connection
// to keep alive, and an event announced sixty seconds late is still news.
const EVENT_POLL_MS = 60000;

// Discord errors that will not fix themselves by trying again with the same
// channel id: the channel is gone, or the bot cannot see or post in it.
const PERMANENT_DISCORD_ERRORS = new Set([10003, 50001, 50013]);

// One line per guild per process, not one line per poll.
const eventChannelWarned = new Set();

/** Events go to the events channel if there is one, else wherever announces go. */
function eventsChannelFor(guildId) {
  const cfg = getConfig(guildId);
  return cfg.eventsChannelId ?? cfg.channelId ?? null;
}

async function postOneEvent(row) {
  const channelId = eventsChannelFor(row.guild_id);
  if (!channelId) {
    if (!eventChannelWarned.has(row.guild_id)) {
      eventChannelWarned.add(row.guild_id);
      console.warn(`[events] guild ${row.guild_id} has no channel set — run !seteventchannel there`);
    }
    return;
  }

  // Claim the event before sending anything. The primary key on `event` is what
  // makes this safe: two bot instances racing produces one failed insert, not
  // two announcements in the same channel.
  const { error: claimErr } = await supabase
    .from('community_event_post')
    .insert({ event: row.event_id, guild_id: row.guild_id, channel_id: channelId });
  if (claimErr) {
    if (claimErr.code !== '23505') console.error('[events] could not claim event:', claimErr);
    return;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) {
      throw Object.assign(new Error('configured channel is not a text channel'), { code: 10003 });
    }
    const message = await channel.send({
      content: eventAnnouncement(row),
      embeds: [buildEventEmbed(row, APP_URL)],
    });
    await supabase
      .from('community_event_post')
      .update({ message_id: message.id })
      .eq('event', row.event_id);
    console.log(`[events] posted event #${row.event_id} to ${row.guild_id}/${channelId}`);
  } catch (err) {
    if (PERMANENT_DISCORD_ERRORS.has(err?.code)) {
      // Keep the claim and record why. Retrying a channel the bot cannot post
      // in would mean this line every minute until the event starts.
      await supabase
        .from('community_event_post')
        .update({ error: String(err?.message ?? err).slice(0, 300) })
        .eq('event', row.event_id);
      console.error(`[events] giving up on event #${row.event_id}: ${err?.message ?? err}`);
    } else {
      // Release the claim so the next poll tries again.
      await supabase.from('community_event_post').delete().eq('event', row.event_id);
      console.error(`[events] event #${row.event_id} will be retried: ${err?.message ?? err}`);
    }
  }
}

async function postPendingEvents() {
  try {
    const { data, error } = await supabase.rpc('discord_pending_event_posts', { p_limit: 10 });
    if (error) { console.error('[events] pending fetch failed:', error); return; }
    for (const row of data ?? []) await postOneEvent(row);
  } catch (err) {
    console.error('postPendingEvents failed:', err);
  }
}

/**
 * Take down announcements for events that were deleted or hidden on the site.
 * A Discord post advertising a tournament that is not happening is worse than
 * never having posted it, which is why the ledger outlives the event row.
 */
async function retractEventPosts() {
  try {
    const { data, error } = await supabase
      .from('community_event_post')
      .select('event, channel_id, message_id')
      .not('retract_at', 'is', null)
      .limit(25);
    if (error) { console.error('[events] retract fetch failed:', error); return; }

    for (const row of data ?? []) {
      try {
        const channel = await client.channels.fetch(row.channel_id).catch(() => null);
        const message = channel?.isTextBased()
          ? await channel.messages.fetch(row.message_id).catch(() => null)
          : null;
        if (message) {
          await message.delete();
          console.log(`[events] retracted the post for event #${row.event}`);
        }
        // The row goes whether the message was there or not: gone is the state
        // we wanted, and a message somebody already deleted by hand is done.
        await supabase.from('community_event_post').delete().eq('event', row.event);
      } catch (err) {
        // Left in place on purpose. A bot can always delete its own message, so
        // a failure here is transient and worth another pass.
        console.error(`[events] retract failed for event #${row.event}, will retry:`, err?.message ?? err);
      }
    }
  } catch (err) {
    console.error('retractEventPosts failed:', err);
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

/**
 * /verify <code> — the bot half of community verification.
 *
 * The website issues a one-time code to the owner of a community and stores its
 * hash. Running the command here proves two things at once that the website
 * cannot prove on its own: that the caller holds Manage Server on a real guild,
 * and which guild it is. Both replies are ephemeral; nobody else in the channel
 * needs to see somebody's verification code being handled.
 */
async function handleVerifyCommand(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!interaction.guild) {
    return interaction.editReply('Run this in the server you want to verify, not in a DM.');
  }
  if (!interaction.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.editReply(
      'Only someone with **Manage Server** here can verify this server. Ask an admin to run it.',
    );
  }

  const code = interaction.options.getString('code', true).trim().toUpperCase();
  const hash = createHash('sha256').update(code).digest('hex');

  const { data: claim, error } = await supabase
    .from('community_claim')
    .select('id, link_token_expires_at, community:community ( slug, name )')
    .eq('link_token_hash', hash)
    .maybeSingle();

  if (error) {
    console.error('/verify lookup failed:', error);
    return interaction.editReply('⚠️ Could not check that code. Try again in a moment.');
  }
  // One message for "wrong" and "already used": a used token is deleted, so the
  // two are indistinguishable here, and saying which would leak whether a code
  // was ever real.
  if (!claim) {
    return interaction.editReply(
      'That code is not valid. Codes are single-use and last 15 minutes, so generate a fresh one on the verification page.',
    );
  }
  if (!claim.link_token_expires_at || new Date(claim.link_token_expires_at) < new Date()) {
    return interaction.editReply('That code has expired. Generate a new one on the verification page.');
  }

  const { error: updateError } = await supabase
    .from('community_claim')
    .update({
      identity_verified_at: new Date().toISOString(),
      discord_guild_id: interaction.guild.id,
      proof_method: 'discord_bot',
      link_token_hash: null,
      link_token_expires_at: null,
    })
    .eq('id', claim.id);

  if (updateError) {
    console.error('/verify update failed:', updateError);
    return interaction.editReply('⚠️ Could not complete verification. Try again in a moment.');
  }

  const slug = claim.community?.slug;
  return interaction.editReply(
    [
      `✅ **${escapeMd(interaction.guild.name)}** is verified as ${claim.community?.name ? `**${escapeMd(claim.community.name)}**` : 'your community'}.`,
      slug ? `Finish setting it up: ${APP_URL}/en/community/${slug}/verify` : '',
    ].filter(Boolean).join('\n'),
  );
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  try {
    if (interaction.commandName === 'search') return await handleSearchCommand(interaction);
    if (interaction.commandName === 'lf') return await handleLfCommand(interaction);
    if (interaction.commandName === 'verify') return await handleVerifyCommand(interaction);
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
  await syncSiteVerifiedGuilds();
  setInterval(async () => {
    await syncEntitlements(c);
    // After, not before: a guild this pass just verified should count as
    // premium here on the same tick rather than ten minutes later.
    await syncSiteVerifiedGuilds();
  }, ENTITLEMENT_RESYNC_MS);

  processThreadDeletionQueue();
  setInterval(processThreadDeletionQueue, DELETION_POLL_MS);

  postPendingEvents();
  retractEventPosts();
  setInterval(postPendingEvents, EVENT_POLL_MS);
  setInterval(retractEventPosts, EVENT_POLL_MS);

  console.log(`✅ Bot ready — logged in as ${c.user.tag}`);
  console.log(`   Active on ${c.guilds.cache.size} server(s)`);
  console.log(`   Premium SKU: ${DISCORD_PREMIUM_SKU_ID || '(none configured)'}`);
});

client.login(DISCORD_BOT_TOKEN);
