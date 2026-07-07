// ─────────────────────────────────────────────────────────────────────────────
// 0nefor.one Discord Bot
//
// Listens for new posts in the #announces Forum Channel, looks up the poster's
// Discord account in Supabase, inserts the announce, uploads images, and replies
// with a link to the listing on the website.
//
// If the user hasn't linked their Discord account (i.e. never logged in via
// "Login with Discord" on 0nefor.one), the bot guides them to do so.
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();
const { Client, Intents } = require('discord.js');
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

/**
 * Check whether a user has already posted at least one approved announce.
 * First-timers get status 'pending'; returning sellers go straight to 'active'.
 */
async function isReturningUser(sellerId) {
  const { count } = await supabase
    .from('announce')
    .select('id', { count: 'exact', head: true })
    .eq('seller', sellerId)
    .eq('status', 'active');
  return (count ?? 0) > 0;
}

// ── Main event handler ─────────────────────────────────────────────────────────

client.on('messageCreate', async (message) => {
  // Ignore bots and DMs
  if (message.author.bot) return;
  if (!message.guild) return;

  // Only process messages in the designated announces channel
  // For a Forum Channel: message.channelId is the thread ID, so we check
  // message.channel.parentId (the Forum Channel itself).
  const isInAnnouncesChannel =
    message.channelId === DISCORD_ANNOUNCES_CHANNEL_ID ||
    message.channel?.parentId === DISCORD_ANNOUNCES_CHANNEL_ID;

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

  // ── 3. Determine status (pending for first-timers) ─────────────────────────
  const returning = await isReturningUser(supabaseUserId);
  const status = returning ? 'active' : 'pending';

  // ── 4. Insert announce into Supabase ───────────────────────────────────────
  const { data: announceData, error: announceError } = await supabase
    .from('announce')
    .insert({
      seller: supabaseUserId,
      title,
      description,
      price,
      currency,
      status,
    })
    .select('id')
    .single();

  if (announceError) {
    console.error('announce insert error:', announceError);
    await message.reply('⚠️ Something went wrong saving your announce. Please try again in a moment.');
    return;
  }

  const announceId = announceData.id;

  // ── 5. Upload attachments ──────────────────────────────────────────────────
  const imageAttachments = [...message.attachments.values()].filter(
    (a) => a.contentType?.startsWith('image/')
  );

  if (imageAttachments.length > 0) {
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
  }

  // ── 6. Reply in the thread ─────────────────────────────────────────────────
  if (status === 'active') {
    await message.reply({
      content: [
        `✅ **Your announce is live!**`,
        `🔗 ${APP_URL}/en/announces/${announceId}`,
        ``,
        `• **${title}** — ${price} ${currency}`,
        imageAttachments.length > 0 ? `• 📷 ${imageAttachments.length} photo(s) uploaded` : '',
      ].filter(Boolean).join('\n'),
    });
  } else {
    await message.reply({
      content: [
        `⏳ **Your announce is pending review** (first listing).`,
        `An admin will approve it shortly — usually within a few hours.`,
        ``,
        `• **${title}** — ${price} ${currency}`,
      ].join('\n'),
    });
  }

  console.log(
    `[announce #${announceId}] "${title}" ${price}${currency} | status=${status} | user=${discordUserId}`
  );
});

// ── Ready ──────────────────────────────────────────────────────────────────────
client.once('ready', (c) => {
  console.log(`✅ Bot ready — logged in as ${c.user.tag}`);
  console.log(`   Watching channel: ${DISCORD_ANNOUNCES_CHANNEL_ID}`);
});

client.login(DISCORD_BOT_TOKEN);
