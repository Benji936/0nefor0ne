// ─────────────────────────────────────────────────────────────────────────────
// 0nefor.one Discord Bot
//
// Listens for new posts in the #announces text channel, looks up the poster's
// Discord account in Supabase, inserts the announce, uploads images, opens a
// thread on the post, and posts a link to the listing as the first message.
//
// Fully multi-server: each guild stores its own channel + message template.
// Config is persisted in the bot_config table (keyed as "setting:guildId")
// so choices survive restarts and work independently across servers.
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();
const { Client, Intents, Permissions } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
const { parseAnnounce, ANNOUNCE_KIND } = require('./lib/parseAnnounce');

// ── Validate env ──────────────────────────────────────────────────────────────
const {
  DISCORD_BOT_TOKEN,
  DISCORD_ANNOUNCES_CHANNEL_ID, // fallback for servers that haven't run !setchannel yet
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  APP_URL = 'https://0nefor.one',
} = process.env;

if (!DISCORD_BOT_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required env vars. Copy .env.example → .env and fill in all values.');
  process.exit(1);
}

// ── Supabase admin client (service role — bypasses RLS) ───────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Per-guild config ───────────────────────────────────────────────────────────
// guildConfigs is the single source of truth in memory.
// Shape: Map<guildId, { channelId: string|null, threadMessage: string }>

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

/** Get or create a mutable config object for a guild. */
function getConfig(guildId) {
  if (!guildConfigs.has(guildId)) {
    guildConfigs.set(guildId, {
      channelId:     DISCORD_ANNOUNCES_CHANNEL_ID ?? null,
      threadMessage: DEFAULT_THREAD_MESSAGE,
    });
  }
  return guildConfigs.get(guildId);
}

// ── Persistence helpers ───────────────────────────────────────────────────────

async function loadAllGuildConfigs() {
  try {
    const { data, error } = await supabase
      .from('bot_config')
      .select('key, value');
    if (error) { console.error('loadAllGuildConfigs error:', error); return; }

    for (const row of data ?? []) {
      // Keys are scoped as "setting:guildId"
      const [setting, guildId] = row.key.split(':');
      if (!guildId) continue; // skip legacy un-scoped keys

      const cfg = getConfig(guildId);
      if (setting === 'announces_channel_id')   cfg.channelId     = row.value;
      if (setting === 'announce_thread_message') cfg.threadMessage = row.value;
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

// ── Fill {placeholders} in a template ────────────────────────────────────────
function renderTemplate(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? String(vars[key]) : m));
}

// ── YGO set code detection ─────────────────────────────────────────────────────
const SET_CODE_RE = /^[A-Z0-9]{2,6}-[A-Z]{0,2}\d{3,4}$/i;

function extractSetCode(content) {
  const lines = content.trim().split('\n').map(l => l.trim());
  for (const line of lines) {
    if (SET_CODE_RE.test(line)) {
      console.log(`[setcode] detected: "${line.trim().toUpperCase()}"`);
      return line.trim().toUpperCase();
    }
  }
  console.log('[setcode] none detected in message');
  return null;
}

// ── YGOPRODeck API lookup ──────────────────────────────────────────────────────
async function lookupCardBySetCode(rawCode) {
  try {
    const parts = rawCode.split('-');
    const normalizedCode = parts[0] + '-EN' + parts[1].replace(/[a-zA-Z]/g, '');
    console.log(`[setcode] looking up: ${rawCode} → normalized: ${normalizedCode}`);

    const cardData = await new Promise((resolve, reject) => {
      const https = require('https');
      const url = `https://db.ygoprodeck.com/api/v7/cardsetsinfo.php?setcode=${encodeURIComponent(normalizedCode)}`;
      console.log(`[setcode] API URL: ${url}`);
      https.get(url, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          console.log(`[setcode] raw API response: ${body.slice(0, 200)}`);
          try { resolve(JSON.parse(body)); }
          catch { resolve(null); }
        });
        res.on('error', reject);
      }).on('error', reject);
    });

    if (!cardData || cardData.error) {
      console.log(`[setcode] API returned no match or error:`, cardData);
      return null;
    }
    console.log(`[setcode] matched card: id=${cardData.id} name="${cardData.name}"`);
    return {
      ygo_card_id: cardData.id,
      card_name:   cardData.name,
    };
  } catch (err) {
    console.error('lookupCardBySetCode failed:', err);
    return null;
  }
}

// ── YGOPRODeck archetype list (cached for the process lifetime) ───────────────
// Only used to tag LF posts. A failure here must never block an announce, so
// every error path resolves to [] and the post is simply saved untagged.
let _archetypesCache = null;

async function getArchetypes() {
  if (_archetypesCache) return _archetypesCache;
  try {
    const list = await new Promise((resolve, reject) => {
      const https = require('https');
      https.get('https://db.ygoprodeck.com/api/v7/archetypes.php', (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            resolve((parsed ?? []).map(a => a?.archetype_name).filter(Boolean));
          } catch { resolve([]); }
        });
        res.on('error', reject);
      }).on('error', reject);
    });
    if (list.length > 0) _archetypesCache = list;
    return list;
  } catch (err) {
    console.error('getArchetypes failed:', err);
    return [];
  }
}

// ── Discord client ────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.MESSAGE_CONTENT, // Requires enabling in Discord Dev Portal → Bot → Privileged Gateway Intents
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
 * Download a Discord attachment and upload it to Supabase Storage.
 */
async function uploadAttachment(announceId, uploaderId, url, index) {
  try {
    const buffer = await new Promise((resolve, reject) => {
      const https = require('https');
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

// ── Main event handler ─────────────────────────────────────────────────────────

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const guildId = message.guild.id;
  const cfg = getConfig(guildId);

  // ── !botcheck — mods/admins only ──────────────────────────────────────────
  if (message.content.trim().toLowerCase() === '!botcheck') {
    const canCheck = message.member?.permissions.has(Permissions.FLAGS.MANAGE_GUILD)
      || message.member?.permissions.has(Permissions.FLAGS.MANAGE_CHANNELS);
    if (!canCheck) {
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

  // ── !help ────────────────────────────────────────────────────────────────────
  if (message.content.trim().toLowerCase() === '!help') {
    const isAdmin = message.member?.permissions.has(Permissions.FLAGS.MANAGE_GUILD);
    const isMod   = message.member?.permissions.has(Permissions.FLAGS.MANAGE_CHANNELS);
    const channelMention = cfg.channelId ? `<#${cfg.channelId}>` : '*(not set)*';

    const lines = [
      `**🃏 0nefor.one — how it works**`,
      ``,
      `Post a card you want to sell or trade in ${channelMention} and I'll publish it to the marketplace automatically.`,
      ``,
      `**How to post an announce**`,
      `1️⃣ Write the card name on the first line`,
      `2️⃣ Add a price somewhere — e.g. \`45€\`, \`$45\`, \`30 GBP\``,
      `3️⃣ **Attach at least one photo** 📷`,
      `4️⃣ Anything else becomes the description`,
      ``,
      `I'll open a thread on your post with a direct link to the listing.`,
      ``,
      `⚠️ You need a free account first — click **Login with Discord** on ${APP_URL}`,
      `Once you're signed in, just post here and it goes live automatically.`,
    ];

    if (isAdmin || isMod) {
      lines.push(
        ``,
        `**Mod / Admin commands**`,
        `• \`!botcheck\` — check which channel I'm watching`,
        `• \`!setchannel [#channel]\` — set the announces channel *(Manage Server)*`,
        `• \`!setmessage <text>\` — customize the thread message *(Manage Server)*`,
        `   placeholders: \`{link}\` \`{title}\` \`{price}\` \`{currency}\` \`{photos}\``,
        `• \`!setmessage reset\` — restore the default message`,
      );
    }

    lines.push(``, `• \`!help\` — show this message`);
    await message.reply(lines.join('\n'));
    return;
  }

  // ── !setchannel [#channel] — admin only, per-guild ───────────────────────────
  if (message.content.trim().toLowerCase().startsWith('!setchannel')) {
    if (!message.member?.permissions.has(Permissions.FLAGS.MANAGE_GUILD)) {
      await message.reply('⛔ You need the **Manage Server** permission to change the announces channel.');
      return;
    }
    const target = message.mentions.channels.first() ?? message.channel;
    try {
      await saveGuildSetting(guildId, 'announces_channel_id', target.id);
      cfg.channelId = target.id;
      await message.reply(`✅ Bot now listens for announces in <#${target.id}> on **${message.guild.name}**.`);
      console.log(`[${message.guild.name}] channel set to ${target.id} by ${message.author.tag}`);
    } catch (err) {
      console.error('setchannel failed:', err);
      await message.reply('⚠️ Could not save the channel. Please try again.');
    }
    return;
  }

  // ── !setmessage [text|reset] — admin only, per-guild ────────────────────────
  if (/^!setmessage\b/i.test(message.content.trim())) {
    if (!message.member?.permissions.has(Permissions.FLAGS.MANAGE_GUILD)) {
      await message.reply('⛔ You need the **Manage Server** permission to change the announce message.');
      return;
    }
    const arg = message.content.trim().slice('!setmessage'.length).trim();

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
      console.log(`[${message.guild.name}] announce message updated by ${message.author.tag}`);
    } catch (err) {
      console.error('setmessage failed:', err);
      await message.reply('⚠️ Could not save the message. Please try again.');
    }
    return;
  }

  // ── Announce processing — only in this guild's configured channel ─────────────
  if (!cfg.channelId) return; // guild hasn't set a channel yet

  const isInAnnouncesChannel =
    message.channelId === cfg.channelId ||
    message.channel?.parentId === cfg.channelId;

  if (!isInAnnouncesChannel) return;

  const discordUserId = message.author.id;

  // 1. Look up the user in Supabase
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
        ``,
        `Type \`!help\` to see how it works.`,
      ].join('\n'),
    });
    return;
  }

  // 2. Parse the message
  const archetypes = await getArchetypes();
  const { kind, title, description, price, currency, archetype, wantDetail } =
    parseAnnounce(message.content, archetypes);
  const isLf = kind === ANNOUNCE_KIND.LOOKING_FOR;

  if (!title) {
    await message.reply('❓ Could not read a title from your message. Start with the card name, `WTS: [name]`, or `LF: [what you want]`.');
    return;
  }

  // ── 2b. Optional set code → card link ──────────────────────────────────────
  let cardLink = null; // { ygo_card_id, card_name } or null
  let setCodeWarning = null;

  const detectedSetCode = extractSetCode(message.content);
  if (detectedSetCode) {
    cardLink = await lookupCardBySetCode(detectedSetCode);
    if (!cardLink) {
      setCodeWarning = `⚠️ Set code \`${detectedSetCode}\` not found — announce posted without card link.`;
    }
  }

  // 3. Images: required when selling, optional when looking for something.
  //    A buyer after a "Darklord deck base" has nothing to photograph.
  const imageAttachments = [...message.attachments.values()].filter(
    (a) => a.contentType?.startsWith('image/')
  );

  if (imageAttachments.length === 0 && !isLf) {
    await message.reply('📷 Your announce needs at least one photo. Please repost your listing with an image attached.');
    return;
  }

  // 4. Insert announce
  const discordUrl  = `https://discord.com/channels/${message.guild.id}/${message.channelId}/${message.id}`;
  const guildName   = message.guild.name;
  const guildIcon   = message.guild.iconURL({ dynamic: true, size: 128 }) ?? null;

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
      discord_guild_name: guildName,
      discord_guild_icon: guildIcon,
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

  // 5. Upload attachments
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

  // 6. Build confirmation message using this guild's template
  const confirmationLines = [renderTemplate(cfg.threadMessage, {
    link:     `${APP_URL}/en/announces/${announceId}`,
    title,
    price:    price ?? '—',
    currency: price === null ? '' : currency,
    photos:   imageAttachments.length,
  })];
  if (isLf) {
    confirmationLines.unshift(
      `🔎 **Looking For** post` + (archetype ? ` — archetype: **${archetype}**` : '')
    );
  }
  if (cardLink) {
    confirmationLines.push(`🃏 Linked to **${cardLink.card_name}** (\`${detectedSetCode}\`)`);
  }
  const confirmation = { content: confirmationLines.join('\n') };

  // 7. Open a discussion thread
  let thread = null;
  try {
    thread = await message.startThread({
      name: title.slice(0, 100),
      autoArchiveDuration: 10080, // 7 days
    });
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
  }

  if (thread) {
    await thread.send(confirmation);
  } else {
    await message.reply(confirmation);
  }

  if (setCodeWarning) {
    if (thread) {
      await thread.send(setCodeWarning);
    } else {
      await message.reply(setCodeWarning);
    }
  }

  console.log(
    `[${guildName}] ${kind} #${announceId} "${title}" ${price ?? 'no price'}${price === null ? '' : currency}` +
    (archetype ? ` | archetype=${archetype}` : '') +
    (cardLink ? ` | card=${cardLink.ygo_card_id} (${cardLink.card_name})` : '') +
    ` | user=${discordUserId}`
  );
});

// ── Thread deleted in Discord → delete the linked announce ────────────────────
client.on('threadDelete', async (thread) => {
  try {
    const threadUrl = `https://discord.com/channels/${thread.guild.id}/${thread.id}`;
    const { data, error } = await supabase
      .from('announce')
      .delete()
      .eq('discord_url', threadUrl)
      .select('id');
    if (error) { console.error('threadDelete → announce delete error:', error); return; }
    if (data?.length) console.log(`[threadDelete] deleted announce #${data[0].id} (thread ${thread.id})`);
  } catch (err) {
    console.error('threadDelete handler failed:', err);
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

// ── Ready ──────────────────────────────────────────────────────────────────────
client.once('ready', async (c) => {
  await loadAllGuildConfigs();
  processThreadDeletionQueue();
  setInterval(processThreadDeletionQueue, DELETION_POLL_MS);
  console.log(`✅ Bot ready — logged in as ${c.user.tag}`);
  console.log(`   Active on ${c.guilds.cache.size} server(s)`);
  console.log(`   Polling announce-deletion queue every ${DELETION_POLL_MS / 1000}s`);
});

client.login(DISCORD_BOT_TOKEN);
