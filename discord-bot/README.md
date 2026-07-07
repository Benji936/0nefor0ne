# 0nefor.one Discord Bot

Syncs posts from the Discord #announces Forum Channel to the [0nefor.one](https://0nefor.one) marketplace.

## How it works

1. User posts in **#announces** (Discord Forum Channel)
2. Bot looks up their Discord account in the Supabase `Trader` table via `discord_id`
3. If **linked** → inserts the announce, uploads images, replies with a link
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
   - Bot Permissions: `Read Messages/View Channels`, `Send Messages`, `Read Message History`
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

---

## First-announce moderation

- **First listing** from a new user → `status: 'pending'` (awaiting admin approval)
- **Returning users** with at least one approved listing → `status: 'active'` (published immediately)

To approve a pending announce, update its status in Supabase:
```sql
UPDATE announce SET status = 'active' WHERE id = <id>;
```
