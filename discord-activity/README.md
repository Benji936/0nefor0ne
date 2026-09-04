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

## Match tracking (verified stores)

The duel is free and stays free: life points, coin, dice, first turn, timer,
chat. Nobody is refused, and a free server's activity is complete rather than a
trial of something else.

What a **verified** community's server adds is match tracking — best of 1/3/5, a
round record holding the life totals as they stood, a running score, undo — and
the store's name in the header.

In the state this is `tracked`, and it used to be called `tournament`. The
rename happened when real tournament matches arrived: this flag has always meant
"a store is hosting, so tracking is unlocked", which is a monetisation gate, and
one word cannot carry both readings.

This replaces the earlier plan to gate *launches* behind the guild-subscription
entitlement. A locked door is a bad first impression and gets a bot removed; a
shop paying for the thing only a shop needs is the same trade the rest of the
subscription makes.

### How it is gated

`guildId` comes from the Discord frame and a client can put anything there, so
none of it is trusted:

1. The client posts `/api/context` with its OAuth access token, guild id and
   room.
2. The Worker calls `GET /users/@me/guilds` with that token. Anyone can name a
   guild; only a member's token lists it.
3. The Worker asks Supabase `community_for_guild(guild_id)`, which answers with a
   row only for a **verified** community whose current owner linked that server
   with `/verify`.
4. On both passing, the Worker returns a **grant**: an HMAC-signed payload bound
   to that room and valid two minutes.
5. `/ws` verifies the signature, strips anything the client put in the URL, and
   sets the verified flag on the request it hands the Durable Object.

`context:set` is absent from `CLIENT_ACTIONS`, so a socket message asking for it
is dropped before it reaches the reducer.

The signing key is derived from `DISCORD_CLIENT_SECRET`, so there is no second
secret to configure. `SUPABASE_URL` and `SUPABASE_ANON_KEY` are plain vars in
`wrangler.jsonc` — both public, and the Worker holds no service-role key.

**The honest limit**: this proves the caller is a member of the store's server,
not that the activity is running in it. Someone who has joined a verified
store's Discord could open a duel elsewhere with match tracking on. They are the
store's own member, which is who the feature is for, and Discord gives the frame
no signed guild context to do better.

Apply `supabase/migrations/20260809_community_for_guild.sql` before deploying.

## Tournament matches

A duel can also *be* a round of a tournament, which is a different thing from
being tracked. When it is, the room arrives knowing its table: the format is
already set, the pairing names the opponent, and at the end one tap files the
result with 0nefor.one.

### How the room learns which match it is

Deliberately **not** from a channel id. The bot posts one pairing sheet to one
channel; it does not create sixteen voice channels a round, and asking it to
would need Manage Channels and leave dead channels behind after every event.

The player is the link instead. Whoever opens the Activity is somebody Discord
will identify, and a player is in at most one unfinished match at a time.

1. `/api/context` reaches an Edge Function, `activity-context`, which verifies
   the access token against `GET /users/@me` and reads the user id from
   **Discord's answer** rather than from the request.
2. That function holds the service role and asks
   `activity_match_for_discord_user`. The Worker cannot ask directly: it holds
   the anon key and serves the SPA from the same origin, so anything it can call
   is effectively public — and every Discord user id is published, so "which
   match is user X playing" is not a question to expose that way.
3. The match rides home inside the same signed grant as the host, so `/ws`
   trusts a signature rather than a claim. `worker/index.js` deletes the client's
   `ctx` parameter *before* writing its own; that ordering is the whole
   guarantee.
4. A room binds to the first match presented to it. Two players from different
   tables sharing a voice channel is a real thing, and the second grant must not
   move the room out from under the first.

### Filing the result

The Activity proposes; a player confirms; the database records. The button
appears from the first game played rather than only once the match is decided,
because a match that ran out of time at one game each is a real result and
hiding the button would push the players into inventing a third game.

The score is mapped from Discord uids to the pairing's `player_a` / `player_b`
order by `shared/tournamentResult.js`. Getting that backwards would file a loss
as a win, so it is one tested function rather than an expression at the call
site — and it refuses outright if somebody at the table is not in the pairing.

The result lands as `awaiting_confirmation` with the reporter set, exactly as a
report typed on the website does. **Life points are never read.** A physical
game ends by deck-out, by concession, by a slow-play ruling; the counter is a
convenience for the two people playing and no part of the record.

The Durable Object does not file anything. It could — a DO can make outbound
requests — but it would need a credential living as long as a match, and a
long-lived replayable token is worse than asking the person who just won to tap
a button.

Needs `supabase/migrations/20260904120000_activity_tournament.sql` and both
`activity-context` and `activity-result` deployed. Set `DISCORD_CLIENT_SECRET`
in the Supabase project only if you later move grant verification there; today
neither function needs it.

## Tests

```bash
npm test
```

60 tests, no network: the reducer's match and context rules, the uid-to-pairing
score mapping and every case where it refuses, and the grant's signing plus each
of its rejection paths.

```bash
npx wrangler dev --port 8791 --local
node worker/live-probe.mjs
```

19 assertions against a real Worker and Durable Object over a real socket. This
covers the one thing no unit test reaches: that the Worker actually strips the
client's `ctx` before writing its own. A refactor could break that line while
every unit test stayed green.
