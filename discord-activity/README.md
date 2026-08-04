# Remote Duel — 0nefor.one Discord Activity

A **Discord Activity** (Embedded App SDK) that runs inside a voice channel as a
companion for Yu-Gi-Oh remote duels. Two players open it in the same voice
channel and share, in real time:

- **Life points** — tap +/- (100 / 500 / 1000), tap the number to set it, halve LP
- **Coin flip** and **d6** — generated server-side so neither player can fudge the result
- **First turn** randomizer
- **Turn timer** (shared start / pause / reset)
- A **duel log** sidebar of everything that happened

It is a separate web app from the bot — same Discord application, different
deployment. The bot is the entry point (`!duel`); this is the screen.

Runs on **Cloudflare Workers + Durable Objects**.

## How the pieces fit

```
Discord voice channel
   └─ Activity iframe  (served by the Worker)
        ├─ Embedded App SDK  → identifies the players, gives an instanceId
        └─ WebSocket → same origin, via Discord's /.proxy/
                          └─ Durable Object, one per instanceId
                               └─ shared/duelReducer.js (authoritative)
```

Discord does **not** sync game state — it only tells us who is in the channel.
So the activity keeps its own state, and `idFromName(instanceId)` guarantees
**both players land on the same Durable Object**: one object per duel, globally.
That is why there is no replica or sticky-session concern.

`shared/duelReducer.js` is the single source of truth and runs **only in the
Durable Object**, which keeps coin/dice randomness authoritative and every
client in lockstep. Player identity is bound to the socket
(`serializeAttachment`) and never trusted from the message payload.

The object uses the **WebSocket Hibernation API**, so an idle duel is evicted
from memory while the sockets stay open — you are not billed while two players
think about their next move. Because of hibernation, duel state lives in
Durable Object storage rather than only in memory, and is cleared when the last
player disconnects.

## Prerequisites (Dev Portal — do these once)

Use the **same application** as the bot (id `1523756849051205692`).

1. **OAuth2** → copy the **Client Secret** (a ~32-char string with no dots —
   this is *not* the bot token).
2. **Activities** → enable it, then under **URL Mappings** add a root mapping:
   - Prefix `/` → Target: your deployed host (e.g. `remote-duel.<subdomain>.workers.dev`)
3. Make sure the app is installed in the server where you want to test.

## Local development

```bash
cd discord-activity
cp .dev.vars.example .dev.vars    # fill DISCORD_CLIENT_SECRET
npm install
npm run dev                       # vite build --watch + wrangler dev
```

`wrangler dev` serves the built client **and** the Worker/Durable Object on one
origin, so local dev matches production exactly (no proxying).

- Plain browser at `http://localhost:8787` runs in **dev mock mode** (fake user),
  so you can exercise the UI and live sync without Discord. Open two tabs with
  the same `?room=test` to see LP/coin/dice sync between them.
- To test **inside Discord**, expose it over HTTPS (e.g.
  `cloudflared tunnel --url http://localhost:8787`), point the Dev Portal URL
  mapping at that tunnel, then launch the activity from a voice channel.

## Deploy

```bash
npx wrangler login                              # once
npx wrangler secret put DISCORD_CLIENT_SECRET   # once, paste the OAuth2 secret
npm run deploy                                  # builds, then wrangler deploy
```

`DISCORD_CLIENT_ID` is a plain var in `wrangler.jsonc`; only the secret needs
`wrangler secret put`. Deploy prints the `*.workers.dev` URL — put that host in
the Dev Portal **Activities → URL Mappings** target (no `https://`, no trailing
slash).

Durable Objects are available on the **Workers Free plan** using the SQLite
backend, which is what `wrangler.jsonc` configures
(`migrations[].new_sqlite_classes`).

Logs: `npm run tail`.

## Launching it

Players open the activity from the voice-channel toolbar (the rocket /
Activities button). The bot's `!duel` command explains the same thing.

## Premium gating (deferred)

Shipping open for now. When ready, gate launches behind the guild-subscription
entitlement the bot already tracks (reuse the premium-guild `Set`), so only
premium communities can start a duel.
