/**
 * Shared notification metadata and helpers used by NotificationBell and TradeCenter.
 */

export const NOTIF_META = {
  proposal_received:  { icon: 'mdi-swap-horizontal',       color: 'var(--c-trade)',  text: n => `${n.counterparty_name ?? 'Someone'} sent you a trade proposal` },
  proposal_accepted:  { icon: 'mdi-check-circle-outline',  color: 'var(--c-mutual)', text: n => `${n.counterparty_name ?? 'They'} accepted your proposal` },
  proposal_declined:  { icon: 'mdi-close-circle-outline',  color: 'var(--c-accent)', text: n => `${n.counterparty_name ?? 'They'} declined your proposal` },
  proposal_cancelled: { icon: 'mdi-cancel',                color: 'var(--c-muted)',  text: n => `Trade with ${n.counterparty_name ?? 'them'} was cancelled` },
  side_confirmed:     { icon: 'mdi-handshake-outline',     color: 'var(--c-mutual)', text: n => `${n.counterparty_name ?? 'They'} confirmed the exchange` },
  trade_completed:    { icon: 'mdi-handshake',             color: 'var(--c-mutual)', text: n => `Exchange with ${n.counterparty_name ?? 'them'} complete` },
};

const FALLBACK_META = { icon: 'mdi-bell-outline', color: 'var(--c-muted)', text: () => 'Notification' };

/** Returns { icon, color } for a notification row. */
export function notifMeta(n) {
  return NOTIF_META[n.kind] ?? FALLBACK_META;
}

/** Returns the human-readable text string for a notification row. */
export function notifText(n) {
  return (NOTIF_META[n.kind]?.text ?? FALLBACK_META.text)(n);
}

/**
 * Returns a compact time-ago string.
 * short=false → "5m ago", "2h ago", "3d ago"
 * short=true  → "5m", "2h", "3d"
 */
export function timeAgo(ts, { short = false } = {}) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  const suffix = short ? '' : ' ago';
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m${suffix}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${suffix}`;
  return `${Math.floor(h / 24)}d${suffix}`;
}
