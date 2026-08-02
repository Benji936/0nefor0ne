// Thin WebSocket client for the duel relay. The activity connects to its OWN
// server (same origin), so in Discord the traffic rides through the built-in
// `/.proxy/` mapping — no external-domain URL mapping required.

export function createRoom({ instanceId, user, onState }) {
  const isEmbedded = Boolean(new URLSearchParams(window.location.search).get('frame_id'));
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const prefix = isEmbedded ? '/.proxy/ws' : '/ws';

  const qs = new URLSearchParams({
    room: instanceId,
    uid: user.id,
    name: user.global_name || user.username || 'Duelist',
    avatar: user.avatar || '',
  });

  let ws = null;
  let closed = false;
  let retry = 0;

  function connect() {
    ws = new WebSocket(`${proto}://${window.location.host}${prefix}?${qs.toString()}`);
    ws.onopen = () => {
      retry = 0;
    };
    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === 'state') onState(msg.state);
    };
    ws.onclose = () => {
      if (closed) return;
      retry += 1;
      setTimeout(connect, Math.min(1000 * retry, 5000));
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };
  }

  connect();

  return {
    send(action) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(action));
      }
    },
    close() {
      closed = true;
      if (ws) ws.close();
    },
  };
}
