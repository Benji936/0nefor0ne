# 0nefor.one Discord Bot — v2 (Premium)

Same job as v1 — syncs posts from the Discord announces channel to the
[0nefor.one](https://0nefor.one) marketplace — rebuilt on **discord.js v14** with
**Discord-native monetization** (a Guild Subscription).

## What "Premium" does

The business model is one branch in the code. When an announce is posted:

- **Free guild** → plain announce. No community name, icon, or link is written.
- **Premium guild** (active Guild Subscription entitlement) → the announce is
  stamped with the server's **name**, **icon**, and a **community link** the
  admin set with `!setcommunity`. Every listing becomes promotion for that server.

Entitlements are the **source of truth**. Because announces arrive as plain
messages (no interaction payload), the bot can't read the entitlement off the
message. Instead it keeps an in-memory `Set` of premium guild ids:

- seeded on startup via `client.application.entitlements.fetch({ skus, excludeEnded })`
- kept live by `entitlementCreate` / `entitlementUpdate` / `entitlementDelete` events
- re-synced every 10 minutes so it self-heals from any missed event

---

## Prerequisites (do these first — code is inert without them)

1. **Enable Monetization** on your app: Dev Portal → your app → Monetization.
   Team must be verified with payout/tax set up.
2. **Create a Guild Subscription SKU**. Copy its id into `DISCORD_PREMIUM_SKU_ID`.
3. **DB column**: add `community_url` to the `announce` table (text, nullable):
   ```sql
   ALTER TABLE announce ADD COLUMN IF NOT EXISTS community_url text;
   ```
   (The bot writes it only for premium guilds; it's null otherwise.)

## Setup

```bash
cd discord-bot
cp .env.example .env      # fill in all values, including DISCORD_PREMIUM_SKU_ID
npm install
npm run dev               # or: npm start
```

Enable **Message Content Intent** in Dev Portal → Bot → Privileged Gateway Intents.

Bot permissions (OAuth2 URL Generator, scope `bot`): Read Messages/View Channels,
Send Messages, Read Message History, Create Public Threads, Send Messages in
Threads, Manage Threads.

## Deploy (Railway)

Push to GitHub → New Project → Deploy from repo → set Root Directory to
`discord-bot` → add the `.env` vars in Railway Variables (including
`DISCORD_PREMIUM_SKU_ID`) → deploy.

---

## Commands

| Command | Who | Effect |
|---|---|---|
| `!help` | anyone | Overview + points to the sub-topics below |
| `!help sell` | anyone | Step-by-step for a sell/trade announce |
| `!help lf` | anyone | Step-by-step for a Looking For post |
| `!help admin` | anyone | Lists the mod/admin commands |
| `!upgrade` / `!premium` | anyone | Shows the native Discord purchase button |
| `!botcheck` | mod/admin | Shows watched channel **and plan (Free/Premium)** |
| `!setchannel [#channel]` | Manage Server | Set the announces channel |
| `!setmessage <text\|reset>` | Manage Server | Customize the thread message |
| `!setcommunity <url\|clear>` | **Premium** + Manage Server | Set the community link shown on announces |

The upgrade button uses `ButtonStyle.Premium` + your `sku_id`; Discord renders
the checkout. Non-premium admins who try `!setcommunity` get the button too.

---

## Testing the premium flow

- **Test entitlements** (no payment): create/delete a test entitlement for your
  guild via the API to toggle the premium state, then re-run `syncEntitlements`
  (restart, or wait for the 10-min timer) or fire an event.
- **Live flow at 100% off**: team members see a full discount on the SKU, so you
  can click the `!upgrade` button and complete a real (free) purchase to exercise
  the whole `entitlementCreate` path.

## What was reused from v1

`lib/parseAnnounce.js` is copied **verbatim** — it's pure and library-agnostic,
and its 21 unit tests pass unchanged (`npm test`). Only the Discord plumbing was
migrated to v14 and the entitlement layer added.

## Migration notes (v13 → v14)

`Intents` → `GatewayIntentBits`; `Permissions.FLAGS` → `PermissionFlagsBits`;
string events → `Events.*`; buttons via `ButtonBuilder`/`ButtonStyle`;
`iconURL({ dynamic })` → `iconURL({ extension, size })`.
