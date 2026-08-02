import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initialState, reduce } from '../shared/duelReducer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const PORT = process.env.PORT || 3001;

const app = express();
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// OAuth code -> access_token. Runs server-side so the client secret never
// reaches the browser.
app.post('/api/token', async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ error: 'missing code' });
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return res.status(500).json({ error: 'server missing Discord credentials' });
    }
    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
      }),
    });
    const data = await response.json();
    if (!response.ok) return res.status(400).json({ error: data });
    res.json({ access_token: data.access_token });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Serve the built activity.
const dist = path.join(__dirname, '..', 'dist');
app.use(express.static(dist));
app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

/** @type {Map<string, { state: object, clients: Set<import('ws').WebSocket> }>} */
const rooms = new Map();

function getRoom(id) {
  let room = rooms.get(id);
  if (!room) {
    room = { state: initialState(), clients: new Set() };
    rooms.set(id, room);
  }
  return room;
}

function broadcast(room) {
  const payload = JSON.stringify({ type: 'state', state: room.state });
  for (const client of room.clients) {
    if (client.readyState === client.OPEN) client.send(payload);
  }
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const roomId = url.searchParams.get('room') || 'default';
  const uid = url.searchParams.get('uid') || 'anon';
  const name = url.searchParams.get('name') || 'Duelist';
  const avatar = url.searchParams.get('avatar') || null;

  const room = getRoom(roomId);
  room.clients.add(ws);
  ws.roomId = roomId;
  ws.uid = uid;

  room.state = reduce(room.state, { t: 'join', uid, name, avatar });
  broadcast(room);

  ws.on('message', (raw) => {
    let action;
    try {
      action = JSON.parse(raw.toString());
    } catch {
      return;
    }
    // Identity is bound to the connection, never trusted from the payload.
    action.uid = uid;
    room.state = reduce(room.state, action);
    broadcast(room);
  });

  ws.on('close', () => {
    room.clients.delete(ws);
    if (room.clients.size === 0) {
      // Duel is over once everyone leaves; drop the room so state is fresh next time.
      rooms.delete(roomId);
      return;
    }
    // Keep the seat (LP persists) but flag the player offline for the survivor.
    room.state = reduce(room.state, { t: 'offline', uid });
    broadcast(room);
  });
});

server.listen(PORT, () => {
  console.log(`Remote Duel activity listening on :${PORT}`);
});
