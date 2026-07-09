// ─────────────────────────────────────────────────────────────────────────────
// 0nefor.one Discord Bot
//
// Listens for new posts in the #announces text channel, looks up the poster's
// Discord account in Supabase, inserts the announce, uploads images, opens a
// thread on the post, and posts a link to the listing as the first message.
// The listening channel can be changed at runtime with the !setchannel command.
//
// If the user hasn't linked their Discord account (i.e. never logged in via
// "Login with Discord" on 0nefor.one), the bot guides them to do so.
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();
const { Client, Intents, Permissions } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

// ── Validate env ──────────────────────────────────────────────────────────────
const {
  DISCORD_BOT_TOKEN,
  DISCORD_ANNOUNCES_CHANNEL_ID,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  APP_URL = 'https://0nefor.one',
} = process.env;

if (!DISCORD_BOT_TOKEN || !DISCORD_ANNOUNCES_CHANNEL_ID || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required env vars. Copy .env.example → .env and fill in all values.');
  process.exit(1);
}

// ── Supabase admin client (service role — bypasses RLS) ───────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Listening channel (env default, overridable at runtime via !setchannel) ───
// Persisted in the bot_config table so the choice survives restarts/redeploys.
const LISTEN_KEY = 'announces_channel_id';
let listenChannelId = DISCORD_ANNOUNCES_CHANNEL_ID;

async function loadListenChannel() {
  try {
    const { data, error } = await supabase
      .from('bot_config').select('value').eq('key', LISTEN_KEY).maybeSingle();
    if (error) { console.error('loadListenChannel error:', error); return; }
    if (data?.value) listenChannelId = data.value;
  } catch (err) {
    console.error('loadListenChannel failed:', err);
  }
}

async function saveListenChannel(channelId) {
  const { error } = await supabase
    .from('bot_config')
    .upsert({ key: LISTEN_KEY, value: channelId, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// ── Thread confirmation message (customizable via !setmessage) ────────────────
// Placeholders {link} {title} {price} {currency} {photos} are filled per announce.
const MESSAGE_KEY = 'announce_thread_message';
const DEFAULT_THREAD_MESSAGE = [
  `✅ **Your announce is live!**`,
  `🔗 {link}`,
  ``,
  `• **{title}** — {price} {currency}`,
  `• 📷 {photos} photo(s) uploaded`,
  ``,
  `💬 Interested? Reply in this thread to reach the seller.`,
].join('\n');
let threadMessageTemplate = DEFAULT_THREAD_MESSAGE;

async function loadThreadMessage() {
  try {
    const { data, error } = await supabase
      .from('bot_config').select('value').eq('key', MESSAGE_KEY).maybeSingle();
    if (error) { console.error('loadThreadMessage error:', error); return; }
    if (data?.value) threadMessageTemplate = data.value;
  } catch (err) {
    console.error('loadThreadMessage failed:', err);
  }
}

async function saveThreadMessage(template) {
  const { error } = await supabase
    .from('bot_config')
    .upsert({ key: MESSAGE_KEY, value: template, updated_at: new Date().toISOString() });
  if (error) throw error;
}

async function resetThreadMessage() {
  const { error } = await supabase.from('bot_config').delete().eq('key', MESSAGE_KEY);
  if (error) throw error;
}

// Fill {placeholders} from a values object; unknown placeholders are left as-is.
function renderTemplate(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? String(vars[key]) : m));
}

// ── Discord client (v13 API) ───────────────────────────────────────────────────
const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.MESSAGE_CONTENT, // Requires enabling in Discord Dev Portal → Bot → Privileged Gateway Intents
  ],
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Look up a Supabase user UUID by their Discord User ID.
 * Returns the UUID string, or null if not found.
 */
async function findUserByDiscordId(discordUserId) {
  const { data, error } = await supabase
    .from('Trader')
    .select('id')
    .eq('discord_id', discordUserId)
    .maybeSingle();

  if (error) {
    console.error('Supabase lookup error:', error);
    return null;
  }
  return data?.id ?? null;
}

/**
 * Parse a Discord message into announce fields.
 *
 * Expected format (flexible):
 *   WTS: Blue-Eyes White Dragon PSA 9
 *   Mint condition, bought from TCGplayer.
 *   Price: 45€
 *
 * Falls back gracefully if the format isn't perfect.
 */
function parseAnnounce(content) {
  const lines = content.trim().split('\n').map(l => l.trim()).filter(Boolean);

  // Title: first line, strip optional "WTS:" / "WTT:" / "WTB:" prefix
  let title = lines[0] ?? 'Untitled';
  title = title.replace(/^(WTS|WTT|WTB)\s*:\s*/i, '').trim();
  if (title.length > 120) title = title.slice(0, 117) + '…';

  // Price: scan all lines for a pattern like "45€", "45 EUR", "$45", "45.50 GBP"
  const priceRe = /(\d+(?:[.,]\d{1,2})?)\s*(€|EUR|USD|GBP|\$|£)/i;
  let price = 0;
  let currency = 'EUR';

  for (const line of lines) {
    const m = line.match(priceRe);
    if (m) {
      price = parseFloat(m[1].replace(',', '.'));
      const sym = m[2].toUpperCase();
      if (sym === '€' || sym === 'EUR') currency = 'EUR';
      else if (sym === '$' || sym === 'USD') currency = 'USD';
      else if (sym === '£' || sym === 'GBP') currency = 'GBP';
      break;
    }
  }

  // Description: everything except the title line, joined back
  const description = lines.slice(1).join('\n').trim().slice(0, 1000);

  return { title, description, price, currency };
}

/**
 * Download a Discord attachment and upload it to Supabase Storage.
 * Returns the public URL, or null on failure.
 */
async function uploadAttachment(announceId, uploaderId, url, index) {
  try {
    // Download using built-in https — no external fetch dependency needed
    const buffer = await new Promise((resolve, reject) => {
      const https = require('https');
      const chunks = [];
      https.get(url, (res) => {
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    });

    const contentType = 'image/jpeg'; // Discord serves images as JPEG/PNG/WebP
    const ext = url.split('.').pop()?.split('?')[0] ?? 'jpg';
    const safePath = `${announceId}/${uploaderId}/${Date.now()}_${index}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('announce-images')
      .upload(safePath, buffer, { contentType, upsert: false });

    if (uploadError) {
      console.error('Storage upload failed:', uploadError);
      return null;
    }

    const { data } = supabase.storage.from('announce-images').getPublicUrl(safePath);
    return data.publicUrl;
  } catch (err) {
    console.error('Attachment upload error:', err);
    return null;
  }
}

// ── Main event handler ─────────────────────────────────────────────────────────

client.on('messageCreate', async (message) => {
  // Ignore bots and DMs
  if (message.author.bot) return;
  if (!message.guild) return;

  // ── !botcheck — diagnostic command, works in ANY channel ─────────────────
  if (message.content.trim().toLowerCase() === '!botcheck') {
    const currentId   = message.channelId;
    const parentId    = message.channel?.parentId ?? null;
    const watchingId  = listenChannelId;
    const isMatch     = currentId === watchingId || parentId === watchingId;

    await message.reply([
      `**OneforOne bot — diagnostics**`,
      ``,
      `🔍 **This channel ID:** \`${currentId}\``,
      parentId ? `📁 **Parent channel ID:** \`${parentId}\`` : null,
      `👁 **Watching channel:** <#${watchingId}> (\`${watchingId}\`)`,
      ``,
      isMatch
        ? `✅ **Match! Posts in this channel will be processed.**`
        : `❌ **No match.** Post in <#${watchingId}>, or run \`!setchannel\` here to switch.`,
    ].filter(Boolean).join('\n'));
    return;
  }

  // ── !help — how to use the bot (works in any channel, for anyone) ───────────
  if (message.content.trim().toLowerCase() === '!help') {
    const isAdmin = message.member?.permissions.has(Permissions.FLAGS.MANAGE_GUILD);
    const lines = [
      `**🃏 0nefor.one — how it works**`,
      ``,
      `Post a card you want to sell or trade in <#${listenChannelId}> and I'll publish it to the marketplace.`,
      ``,
      `**How to post an announce**`,
      `1️⃣ Card name on the first line (you can prefix \`WTS:\` / \`WTT:\` / \`WTB:\`)`,
      `2️⃣ Add a price somewhere — e.g. \`45€\`, \`$45\`, \`30 GBP\``,
      `3️⃣ **Attach at least one photo** 📷`,
      `4️⃣ Anything else becomes the description`,
      ``,
      `I'll create a thread on your post with a link to the listing.`,
      ``,
      `⚠️ You need a free account first — click **Login with Discord** on ${APP_URL}. Then just post here and it goes live automatically.`,
      ``,
      `**Commands**`,
      `• \`!help\` — show this message`,
      `• \`!botcheck\` — check that I'm watching this channel`,
    ];
    if (isAdmin) {
      lines.push(
        ``,
        `**Admin only (Manage Server)**`,
        `• \`!setchannel [#channel]\` — choose the channel I listen in`,
        `• \`!setmessage <text>\` — customize the thread message`,
        `   placeholders: \`{link}\` \`{title}\` \`{price}\` \`{currency}\` \`{photos}\``,
        `• \`!setmessage reset\` — restore the default message`,
      );
    }
    await message.reply(lines.join('\n'));
    return;
  }

  // ── !setchannel [#channel] — admin: choose the channel the bot listens in ──
  // Run in the target channel, or mention one. Persists across restarts.
  if (message.content.trim().toLowerCase().startsWith('!setchannel')) {
    if (!message.member?.permissions.has(Permissions.FLAGS.MANAGE_GUILD)) {
      await message.reply('⛔ You need the **Manage Server** permission to change the announces channel.');
      return;
    }
    const target = message.mentions.channels.first() ?? message.channel;
    try {
      await saveListenChannel(target.id);
      listenChannelId = target.id;
      await message.reply(`✅ The bot now listens for announces in <#${target.id}>.`);
      console.log(`[config] announces channel set to ${target.id} by ${message.author.tag}`);
    } catch (err) {
      console.error('setchannel failed:', err);
      await message.reply('⚠️ Could not save the channel. Please try again.');
    }
    return;
  }

  // ── !setmessage [text|reset] — admin: customize the thread confirmation ──────
  // Placeholders: {link} {title} {price} {currency} {photos}
  if (/^!setmessage\b/i.test(message.content.trim())) {
    if (!message.member?.permissions.has(Permissions.FLAGS.MANAGE_GUILD)) {
      await message.reply('⛔ You need the **Manage Server** permission to change the announce message.');
      return;
    }
    const arg = message.content.trim().slice('!setmessage'.length).trim();

    // No argument → show the current template + available placeholders.
    if (!arg) {
      await message.reply(
        'Placeholders: `{link}` `{title}` `{price}` `{currency}` `{photos}`\n' +
        '**Current announce message:**\n```\n' + threadMessageTemplate + '\n```\n' +
        'Set a new one with `!setmessage <your text>`, or `!setmessage reset` to restore the default.'
      );
      return;
    }

    // Reset to the default.
    if (arg.toLowerCase() === 'reset') {
      try {
        await resetThreadMessage();
        threadMessageTemplate = DEFAULT_THREAD_MESSAGE;
        await message.reply('✅ Announce message reset to the default.');
      } catch (err) {
        console.error('setmessage reset failed:', err);
        await message.reply('⚠️ Could not reset the message. Please try again.');
      }
      return;
    }

    // Set a custom template.
    if (arg.length > 1500) {
      await message.reply('⚠️ That message is too long (max ~1500 characters).');
      return;
    }
    try {
      await saveThreadMessage(arg);
      threadMessageTemplate = arg;
      const preview = renderTemplate(arg, {
        link: `${APP_URL}/en/announces/123`,
        title: 'Blue-Eyes White Dragon', price: 45, currency: 'EUR', photos: 2,
      });
      await message.reply('✅ Announce message updated. Preview:\n```\n' + preview + '\n```');
      console.log(`[config] announce message updated by ${message.author.tag}`);
    } catch (err) {
      console.error('setmessage failed:', err);
      await message.reply('⚠️ Could not save the message. Please try again.');
    }
    return;
  }

  // Only process announces in the designated channel.
  // For a Forum Channel: message.channelId is the thread ID, so we also check
  // message.channel.parentId (the Forum Channel itself).
  const isInAnnouncesChannel =
    message.channelId === listenChannelId ||
    message.channel?.parentId === listenChannelId;

  if (!isInAnnouncesChannel) return;

  const discordUserId = message.author.id;

  // ── 1. Look up the user in Supabase ────────────────────────────────────────
  const supabaseUserId = await findUserByDiscordId(discordUserId);

  if (!supabaseUserId) {
    // User hasn't linked their Discord account yet
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

  // ── 2. Parse the message ────────────────────────────────────────────────────
  const { title, description, price, currency } = parseAnnounce(message.content);

  if (!title) {
    await message.reply('❓ Could not read a title from your message. Start with the card name or `WTS: [name]`.');
    return;
  }

  // ── 3. Require at least one image ──────────────────────────────────────────
  // An announce must have a photo. Check before inserting so we never create an
  // announce row with no image attached.
  const imageAttachments = [...message.attachments.values()].filter(
    (a) => a.contentType?.startsWith('image/')
  );

  if (imageAttachments.length === 0) {
    await message.reply('📷 Your announce needs at least one photo. Please repost your listing with an image attached.');
    return;
  }

  // ── 4. Status ──────────────────────────────────────────────────────────────
  // All announces go live immediately (the app only surfaces 'active' announces
  // and has no moderation queue). Allowed values: 'active' | 'sold' | 'archived'.
  const status = 'active';

  // ── 5. Insert announce into Supabase ───────────────────────────────────────
  // Link back to the Discord post + snapshot the server name/icon for display.
  // We store the message URL now (always known); once the thread is created
  // below we upgrade this to the thread URL.
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
      status,
      discord_url:        discordUrl,
      discord_guild_name: guildName,
      discord_guild_icon: guildIcon,
    })
    .select('id')
    .single();

  if (announceError) {
    console.error('announce insert error:', announceError);
    await message.reply('⚠️ Something went wrong saving your announce. Please try again in a moment.');
    return;
  }

  const announceId = announceData.id;

  // ── 6. Upload attachments ──────────────────────────────────────────────────
  const uploads = await Promise.all(
    imageAttachments.map((att, i) =>
      uploadAttachment(announceId, supabaseUserId, att.url, i)
    )
  );

  const imageRecords = uploads
    .filter(Boolean)
    .map((url, sort_order) => ({
      announce: announceId,
      uploader: supabaseUserId,
      url,
      sort_order,
    }));

  if (imageRecords.length > 0) {
    const { error: imgError } = await supabase
      .from('announce_image')
      .insert(imageRecords);
    if (imgError) console.error('announce_image insert error:', imgError);
  }

  // ── 7. Open a discussion thread and post the confirmation as its first message
  // Keeps #announces a clean feed: each listing gets its own thread for buyers to
  // reply in. Requires the bot to have the "Create Public Threads" permission.
  // The message text is the server's customizable template (see !setmessage).
  const confirmation = {
    content: renderTemplate(threadMessageTemplate, {
      link:     `${APP_URL}/en/announces/${announceId}`,
      title,
      price,
      currency,
      photos:   imageAttachments.length,
    }),
  };

  let thread = null;
  try {
    thread = await message.startThread({
      name: title.slice(0, 100),   // Discord thread names cap at 100 chars
      autoArchiveDuration: 10080,  // archive after 7 days of inactivity
    });
  } catch (err) {
    console.error('Failed to create thread:', err);
  }

  // Prefer linking to the thread (where discussion happens) over the raw message.
  if (thread) {
    const threadUrl = `https://discord.com/channels/${message.guild.id}/${thread.id}`;
    const { error: urlError } = await supabase
      .from('announce')
      .update({ discord_url: threadUrl })
      .eq('id', announceId);
    if (urlError) console.error('announce discord_url update error:', urlError);
  }

  // Post the first message inside the new thread; fall back to a plain reply
  // (e.g. if the channel is a Forum where the post is already a thread).
  if (thread) {
    await thread.send(confirmation);
  } else {
    await message.reply(confirmation);
  }

  console.log(
    `[announce #${announceId}] "${title}" ${price}${currency} | status=${status} | user=${discordUserId}`
  );
});

// ── Thread deleted in Discord → delete the linked announce ──────────────────────
// (Images and chat messages are removed via ON DELETE CASCADE.)
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

// ── Website announce deleted → delete the linked Discord thread ─────────────────
// A DELETE trigger on announce enqueues the thread id (see 20260708_thread_deletion_queue.sql);
// we drain that queue by polling. Needs the "Manage Threads" permission.
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
      // Clear the entry after attempting (thread deleted or already gone) so we
      // don't reprocess it every poll.
      await supabase.from('discord_thread_deletion_queue').delete().eq('id', row.id);
    }
  } catch (err) {
    console.error('processThreadDeletionQueue failed:', err);
  }
}

// ── Ready ──────────────────────────────────────────────────────────────────────
client.once('ready', async (c) => {
  await loadListenChannel();                          // restore a previously-set channel, if any
  await loadThreadMessage();                          // restore a custom announce message, if any
  processThreadDeletionQueue();                       // drain anything queued while offline
  setInterval(processThreadDeletionQueue, DELETION_POLL_MS); // then poll for new deletions
  console.log(`✅ Bot ready — logged in as ${c.user.tag}`);
  console.log(`   Watching channel: ${listenChannelId}`);
  console.log(`   Polling announce-deletion queue every ${DELETION_POLL_MS / 1000}s`);
});

client.login(DISCORD_BOT_TOKEN);
