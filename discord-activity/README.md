# Remote Duel — 0nefor.one Discord Activity

A **Discord Activity** (Embedded App SDK) that runs inside a voice channel as a
companion for Yu-Gi-Oh remote duels. Two players open it in the same voice
channel and share, in real time:

- **Life points** — tap +/- (100 / 500 / 1000), tap the number to set it, halve LP
- **Coin flip** and **d6** — server-generated so neither player can fudge the result
- **First turn** randomizer
- **Turn timer** (shared start / pause / reset)

It is a separate web app from the bot — same Discord application, different
deployment. The bot is the entry point; this is the screen.

## How the pieces fit

```
Discord voice channel
   └─ Activity iframe  (this app, served over HTTPS)
        ├─ Embedded App SDK  → identifies the players, gives an instanceId
        └─ WebSocket → our own Express server (same origin, via Discord's /.proxy/)
                          └─ in-memory duel state per instanceId (shared reducer)
```

Discord does **not** sync game state — it only tells us who is in the channel.
So the activity talks to its own tiny relay server. Because that server is the
same origin as the app, traffic rides Discord's built-in `/.proxy/` mapping and
needs **no external-domain URL mapping**. State is ephemeral (a duel needs no
persistence), so there is no database here.

`shared/duelReducer.js` is the single source of truth and runs **only on the
server**, which keeps coin/dice randomness authoritative and every client in
lockstep.

## Prerequisites (Dev Portal — do these once)

Use the **same application** as the bot (id `1523756849051205692`).

1. **OAuth2** → copy the **Client Secret** into `DISCORD_CLIENT_SECRET`.
2. **Activities** → enable it, then under **URL Mappings** add a root mapping:
   - Prefix `/` → Target: your deployed host (e.g. `remote-duel.up.railway.app`)
3. Make sure the app is installed in the server where you want to test.

## Local development

```bash
cd discord-activity
cp .env.example .env      # fill DISCORD_CLIENT_SECRET
npm install
npm run dev               # Vite on :5173, relay server on :3001
```

- Plain browser at `http://localhost:5173` runs in **dev mock mode** (fake user),
  so you can exercise the UI and the live sync without Discord. Open two tabs
  with the same `?room=test` to see LP/coin/dice sync between them.
- To test **inside Discord**, expose the app over HTTPS (e.g.
  `cloudflared tunnel --url http://localhost:5173`), point the Dev Portal URL
  mapping at that tunnel, then launch the activity from a voice channel.

## Deploy (Railway)

Same pattern as the bot:

1. New Project → Deploy from repo → set **Root Directory** to `discord-activity`.
2. Add Variables: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`,
   `VITE_DISCORD_CLIENT_ID` (Railway injects `PORT`).
   `VITE_DISCORD_CLIENT_ID` must be present at **build** time.
3. Deploy, then set the Dev Portal Activities URL mapping to the Railway host.

Build runs `npm install && npm run build`; start runs `npm start` (serves the
built app + the WebSocket relay from one process).

## Launching it

Players open the activity from the voice-channel toolbar (the rocket / Activities
button). The bot's `!duel` command posts a short reminder of how to start it.

## Premium gating (deferred)

Shipping open for now. When ready, gate launches behind the guild-subscription
entitlement the bot already tracks (reuse the premium-guild `Set`), so only
premium communities can start a duel.
