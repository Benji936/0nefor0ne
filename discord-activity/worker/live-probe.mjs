// Exercises a running Worker and its Durable Object over a real socket.
//
// This is the part no unit test reaches. duelReducer.test.js proves the reducer
// refuses what it should; grant.test.js proves a forged payload does not verify.
// Neither proves that the Worker actually strips the client's ctx parameter
// before writing its own, which is the single line the whole trust boundary
// rests on — and a refactor could break it while every unit test stayed green.
//
//   npx wrangler dev --port 8791 --local
//   node worker/live-probe.mjs
//
// Needs .dev.vars for the signing secret, so it runs locally and never against
// a deployed Worker. Nothing here touches Discord or Supabase: the grants are
// signed with the same local secret the Worker verifies with, which is exactly
// the position the real /api/context is in after it has done its checks.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { signGrant } from './grant.js';

const here = dirname(fileURLToPath(import.meta.url));
const SECRET = readFileSync(resolve(here, '../.dev.vars'), 'utf8')
  .match(/DISCORD_CLIENT_SECRET=(.*)/)?.[1]?.trim();

if (!SECRET) {
  console.error('No DISCORD_CLIENT_SECRET in .dev.vars — copy .dev.vars.example and fill it in.');
  process.exit(1);
}

const BASE = process.env.PROBE_URL ?? 'ws://127.0.0.1:8791/ws';
let pass = 0, fail = 0;
const ok = (c, label) => { c ? (pass++, console.log('   ok  ' + label)) : (fail++, console.log('   FAILED  ' + label)); };

/** Connect, wait for the first state broadcast, close. */
function firstState(qs) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${BASE}?${qs}`);
    const timer = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('timeout')); }, 6000);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type !== 'state') return;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      resolve(msg.state);
    };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('socket error')); };
  });
}

const MATCH = {
  matchId: 42, tournamentId: 7, roundNumber: 2, tableNumber: 3, bestOf: 3,
  playerA: 11, playerB: 22, names: { 11: 'Ana', 22: 'Bo' },
  seats: { 'uid-ana': 11, 'uid-bo': 22 },
  community: { name: 'Red Line', slug: 'red-line' },
};

console.log('-- 1. A casual duel gets no context at all --');
{
  const s = await firstState('room=casual-1&uid=uid-ana&name=Ana');
  ok(s.tracked === false, 'no grant means not tracked');
  ok(s.tournament === null, 'and no tournament match');
  ok(s.match === null, 'and no match to score');
}

console.log('\n-- 2. A client cannot simply state a context --');
{
  const forgedCtx = encodeURIComponent(JSON.stringify({
    host: { name: 'Fake', slug: 'fake' }, tournament: MATCH,
  }));
  const s = await firstState(`room=forge-1&uid=uid-ana&name=Ana&ctx=${forgedCtx}&tournament=1`);
  ok(s.tracked === false, 'a ctx param the client wrote is stripped');
  ok(s.tournament === null, 'and buys no tournament match');
}

console.log('\n-- 3. A forged signature is refused --');
{
  const real = await signGrant(SECRET, { room: 'sig-1', tournament: MATCH, exp: Date.now() + 60000 });
  const [body, sig] = real.split('.');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  payload.tournament.tableNumber = 99;
  const forged = Buffer.from(JSON.stringify(payload)).toString('base64url') + '.' + sig;
  const s = await firstState(`room=sig-1&uid=uid-ana&name=Ana&grant=${encodeURIComponent(forged)}`);
  ok(s.tracked === false, 'an edited payload with the old signature buys nothing');
}

console.log('\n-- 4. A grant for another room does not travel --');
{
  const g = await signGrant(SECRET, { room: 'room-x', tournament: MATCH, exp: Date.now() + 60000 });
  const s = await firstState(`room=room-y&uid=uid-ana&name=Ana&grant=${encodeURIComponent(g)}`);
  ok(s.tracked === false, 'a grant lifted into a different room is refused');
}

console.log('\n-- 5. An expired grant is refused --');
{
  const g = await signGrant(SECRET, { room: 'exp-1', tournament: MATCH, exp: Date.now() - 1000 });
  const s = await firstState(`room=exp-1&uid=uid-ana&name=Ana&grant=${encodeURIComponent(g)}`);
  ok(s.tracked === false, 'a grant that has run out is refused');
}

console.log('\n-- 6. A real grant binds the room to the table --');
console.log('-- 7. ...and a second player with a different match does not move it --');
{
  // Both sockets stay open. The room drops its storage the moment the last one
  // leaves, so closing the first would have the second bind a fresh room and
  // prove nothing.
  const g1 = await signGrant(SECRET, {
    room: 'live-1', host: { name: 'Red Line', slug: 'red-line' }, tournament: MATCH,
    exp: Date.now() + 60000,
  });
  const other = { ...MATCH, matchId: 99, tableNumber: 8 };
  const g2 = await signGrant(SECRET, { room: 'live-1', tournament: other, exp: Date.now() + 60000 });

  const ws1 = new WebSocket(`${BASE}?room=live-1&uid=uid-ana&name=Ana&grant=${encodeURIComponent(g1)}`);
  let latest = null;
  ws1.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'state') latest = m.state;
  };
  await new Promise((r) => { ws1.onopen = r; });
  await new Promise((r) => setTimeout(r, 600));

  ok(latest?.tracked === true, 'the room is tracked');
  ok(latest?.tournament?.matchId === 42, 'and bound to match 42');
  ok(latest?.tournament?.tableNumber === 3, 'at table 3');
  ok(latest?.match?.bestOf === 3, 'with the format already set, so nobody picks one');
  ok(latest?.host?.slug === 'red-line', 'and it knows who is running it');
  // Not the last line: the join lands after context:set, so it is in the log,
  // not at the end of it.
  ok((latest?.log ?? []).some((l) => /Round 2 . table 3/.test(l.text)), 'the binding is announced in the log');

  const ws2 = new WebSocket(`${BASE}?room=live-1&uid=uid-bo&name=Bo&grant=${encodeURIComponent(g2)}`);
  await new Promise((r) => { ws2.onopen = r; });
  await new Promise((r) => setTimeout(r, 800));

  ok(latest?.tournament?.matchId === 42, 'a second grant for another match does not move the room');
  ok(latest?.tournament?.tableNumber === 3, 'and its table is unchanged');
  ok(Object.keys(latest?.players ?? {}).length === 2, 'while the player still joins normally');

  try { ws1.close(); } catch {}
  try { ws2.close(); } catch {}
  await new Promise((r) => setTimeout(r, 300));
}

console.log('\n-- 8. context:set is still not something a socket may send --');
{
  const ws = new WebSocket(`${BASE}?room=inject-1&uid=uid-ana&name=Ana`);
  const state = await new Promise((resolve) => {
    let last = null;
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.type === 'state') last = m.state;
    };
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: 'context:set', tournament: MATCH, host: { name: 'X', slug: 'x' } }));
      setTimeout(() => { try { ws.close(); } catch {} resolve(last); }, 1200);
    };
  });
  ok(state?.tracked === false, 'the action is not in CLIENT_ACTIONS and never reaches the reducer');
  ok(state?.tournament === null, 'so a player cannot deal themselves a table');
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} ok, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
