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

## Community events → this server

A community that is **verified** on 0nefor.one and linked to this server with
`/verify` gets its events announced here. The owner creates the event once, on
the website, and it appears in their own Discord without a second post.

- **Where they go**: the channel set with `!seteventchannel`, or the announces
  channel if that was never set. Nothing to configure for it to work.
- **What links a server to a community**: `/verify` writes
  `community_claim.discord_guild_id`. Only the claim belonging to the community's
  *current* owner counts, so a shop that changed hands does not announce into the
  previous owner's server.
- **Verified is checked at post time**, not at event-creation time. A community
  whose subscription lapsed stops being announced; the events it already posted
  stay where they are.
- **Deleted or hidden on the site → deleted here.** A post advertising a
  tournament that is not happening is worse than never having posted it, so the
  ledger outlives the event row specifically to be able to take the message down.
- **Events that already started are never posted.** The bot being down over a
  weekend means catching up on what is still ahead, not announcing a backlog.

### Setup

Apply `supabase/migrations/20260809_discord_event_posts.sql`, which creates
`community_event_post` (the ledger of what has been announced) and
`discord_pending_event_posts()` (what to announce next, service-role only).

No new env vars. The bot polls once a minute, alongside the deletion queue.

### When nothing appears

Check, in order: the community is verified; `/verify` was run **in this server**
by someone with Manage Server; the event is published and starts in the future;
a channel is set. If the bot could not post at all, the reason is stored on the
ledger row:

```sql
SELECT event, guild_id, channel_id, error FROM community_event_post WHERE error IS NOT NULL;
```

A row with an `error` is not retried — the bot gives up on a channel it cannot
see or post in rather than logging the same failure every minute. Fix the
permission, delete the row, and it will be picked up on the next poll.

---

## Commands

| Command | Who | Effect |
|---|---|---|
| `!help` | anyone | Overview + points to the sub-topics below |
| `!help sell` | anyone | Step-by-step for a sell/trade announce |
| `!help lf` | anyone | Step-by-step for a Looking For post |
| `!help admin` | anyone | Lists the mod/admin commands |
| `!sold` / `!found` | listing author | **In the listing's thread**: marks it sold, locks the thread |
| `!close` / `!cancel` | listing author | Same, but records it as archived rather than sold |
| `!upgrade` / `!premium` | anyone | Shows the native Discord purchase button |
| `!botcheck` | mod/admin | Shows watched channel **and plan (Free/Premium)** |
| `!setchannel [#channel]` | Manage Server | Set the announces channel |
| `!setmessage <text\|reset>` | Manage Server | Customize the thread message |
| `!seteventchannel [#channel\|clear]` | Manage Server | Where this community's events are posted (defaults to the announces channel) |
| `!setcommunity <url\|clear>` | **Premium** + Manage Server | Set the community link shown on announces |
| `/verify <code>` | Manage Server | Link this server to your 0nefor.one community |
| `/tournament list` | anyone | What this server is running right now |
| `/tournament join [id]` | anyone | Join a tournament with registration open |
| `/tournament checkin [id]` | entrant | Check in, once check-in has opened |
| `/tournament pairing [id]` | entrant | Your table and your opponent, privately |
| `/tournament standings [id]` | anyone | The current standings |
| `/tournament drop [id]` | entrant | Drop out |
| `/tournament round [id]` | organizer | Pair the next round |

The upgrade button uses `ButtonStyle.Premium` + your `sku_id`; Discord renders
the checkout. Non-premium admins who try `!setcommunity` get the button too.

---

## Tournaments

Needs the tournament migrations (`supabase/migrations/2026090410*.sql` and
`20260904110000_tournament_discord.sql`) applied, and this server verified
against a community — the guild link is `community_claim.discord_guild_id`,
written by `/verify`. Until then `/tournament` finds nothing and the round
announcer logs one line and stays quiet.

**Setup is on the website.** Creating a tournament needs six fields and a date
picker, and the community profile already has that form. What the bot carries is
the loop that repeats during an event, which is where the friction is.

**The id is optional everywhere.** Most servers run one thing at a time, so the
bot resolves an omitted id to the only candidate at the right stage and asks
only when there is a genuine choice.

**Every reply is ephemeral.** A pairing is between two people and a channel full
of bot replies is how a useful command gets muted. The one public message is the
round announcement.

**Round announcements** work like the events ledger above: `tournament_round_post`
is polled every 15 seconds, the primary key on `round` is the idempotency
guarantee, and the sheet goes to the events channel (`!seteventchannel`) or the
announces channel. Faster than the 60-second event poll because players are
standing around waiting to be told where to sit.

There is deliberately **no retraction** for a round post, unlike an event post.
An event that is no longer happening is a stale invitation and must come down. A
pairing sheet is a record of what was played, and players scroll back to it.

**The bot decides nothing.** It hands the interaction's Discord user id to a
service-role RPC, which resolves the account that owns that snowflake, becomes
it for the length of the transaction, and calls the same function the website
calls. A player impersonated through the bot gets a player's permissions and
nothing more — there is no separate privileged path to keep in sync. See the
header comment on `20260904110000_tournament_discord.sql`.

Nobody has to link anything by hand: `Trader.discord_id` is already maintained
by two auth triggers. Someone who has never signed in gets told to, with a link.

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
