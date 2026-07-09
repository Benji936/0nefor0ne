# 0nefor.one Discord Bot

Syncs posts from the Discord #announces text channel to the [0nefor.one](https://0nefor.one) marketplace.

## How it works

1. User posts in **#announces** (a Discord text channel)
2. Bot looks up their Discord account in the Supabase `Trader` table via `discord_id`
3. If **linked** → inserts the announce, uploads images, **opens a thread on the post** and puts the confirmation + site link as its first message
4. If **not linked** → replies with a prompt to create an account via "Login with Discord" on the site

---

## Setup

### 1. Create a Discord Application & Bot

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) → **New Application**
2. Go to **Bot** → **Reset Token** → copy the token
3. Under **Privileged Gateway Intents**, enable:
   - ✅ **Message Content Intent**
4. Go to **OAuth2 → URL Generator**:
   - Scopes: `bot`
   - Bot Permissions: `Read Messages/View Channels`, `Send Messages`, `Read Message History`, `Create Public Threads`, `Send Messages in Threads`, `Manage Threads`
5. Copy the generated URL → open in browser → add the bot to your server

### 2. Enable Discord OAuth in Supabase

1. Supabase Dashboard → **Authentication → Providers → Discord** → toggle ON
2. Copy **Client ID** and **Client Secret** from your Discord Application → paste into Supabase
3. Add Redirect URLs:
   - `https://0nefor.one/auth/callback`
   - `http://localhost:5173/auth/callback` (for local dev)

### 3. Run the DB migration

Run `supabase/migrations/20260706_discord_link.sql` in the Supabase SQL editor.
This adds the `discord_id` column to `Trader` and a trigger that auto-syncs it on login.

### 4. Configure the bot

```bash
cd discord-bot
cp .env.example .env
# Fill in all values in .env
npm install
```

### 5. Run locally

```bash
npm run dev   # auto-restarts on file changes
# or
npm start
```

### 6. Deploy to Railway (free)

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select the repo, set **Root Directory** to `discord-bot`
4. Add the env vars from `.env` in Railway's Variables tab
5. Deploy — Railway detects Node.js automatically via `railway.json`

---

## Message format

The bot accepts any message. It tries to parse:

| Field | How |
|---|---|
| **Title** | First line, strips `WTS:` / `WTT:` / `WTB:` prefix |
| **Price** | Regex scan for patterns like `45€`, `45 EUR`, `$45`, `45.50 GBP` |
| **Description** | All lines after the first |
| **Images** | Any image attachments are uploaded to Supabase Storage |

**Example post:**
```
WTS: Blue-Eyes White Dragon PSA 9
Mint condition, bought from TCGplayer last year.
Price: 45€
[photo attached]
```

**A photo is required** — a post with no image attachment is rejected with a prompt to add one. All announces are published immediately (`status: 'active'`).

---

## Commands

Run these in Discord (they work in any channel):

| Command | Who | Effect |
|---|---|---|
| `!help` | anyone | Explains how to post an announce + lists commands (admins also see admin commands) |
| `!botcheck` | anyone | Shows the current listening channel and whether this channel matches |
| `!setchannel` | **Manage Server** | Sets the listening channel to the one you run it in |
| `!setchannel #other` | **Manage Server** | Sets the listening channel to the mentioned channel |
| `!setmessage` | **Manage Server** | Shows the current thread message + placeholders |
| `!setmessage <text>` | **Manage Server** | Sets a custom thread message (replies with a preview) |
| `!setmessage reset` | **Manage Server** | Restores the default thread message |

The chosen channel is saved in the Supabase `bot_config` table, so it **persists across restarts and redeploys**. `DISCORD_ANNOUNCES_CHANNEL_ID` in `.env` is only the initial default used before `!setchannel` has ever been run.

### Customizing the thread message

The first message the bot posts in each announce thread is customizable with `!setmessage <text>`. These placeholders are filled in per announce:

| Placeholder | Becomes |
|---|---|
| `{link}` | The listing URL on the site |
| `{title}` | The announce title |
| `{price}` | The price |
| `{currency}` | The currency (EUR/USD/GBP) |
| `{photos}` | Number of photos uploaded |

Example: `!setmessage 🔥 New listing: {title} for {price}{currency}! See it here: {link}`

The template is stored in `bot_config` (persists across restarts). `!setmessage reset` restores the default.

---

## Deletion sync

Announces posted from Discord are kept in sync both ways:

- **Delete the Discord thread → the announce is deleted** on the site (bot `threadDelete` handler). Its images and chat messages go too (via `ON DELETE CASCADE`). Note: auto-archiving a thread after 7 days does **not** delete it.
- **Delete the announce on the site → the linked Discord thread is deleted** (within ~15s). A DELETE trigger on `announce` enqueues the thread id into `discord_thread_deletion_queue`; the bot polls that queue and deletes the thread. Needs `Manage Threads`.
