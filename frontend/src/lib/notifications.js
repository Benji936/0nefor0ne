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

/**
 * Returns the human-readable text string for a notification row.
 * Pass the vue-i18n `t` function for translated output; omit for English fallback.
 */
export function notifText(n, t) {
  if (!t) return (NOTIF_META[n.kind]?.text ?? FALLBACK_META.text)(n);
  const name = n.counterparty_name;
  switch (n.kind) {
    case 'proposal_received':  return t('notifications.proposalReceived',  { name: name ?? t('notifications.someone') });
    case 'proposal_accepted':  return t('notifications.proposalAccepted',  { name: name ?? t('notifications.them') });
    case 'proposal_declined':  return t('notifications.proposalDeclined',  { name: name ?? t('notifications.them') });
    case 'proposal_cancelled': return t('notifications.proposalCancelled', { name: name ?? t('notifications.them') });
    case 'side_confirmed':     return t('notifications.sideConfirmed',     { name: name ?? t('notifications.them') });
    case 'trade_completed':    return t('notifications.tradeCompleted',    { name: name ?? t('notifications.them') });
    default:                   return t('notifications.fallback');
  }
}

/**
 * Returns a compact time-ago string.
 * Pass the vue-i18n `t` function for translated output.
 * short=false → "5m ago" / "il y a 5min"
 * short=true  → "5m" / "5min"
 */
export function timeAgo(ts, t, { short = false } = {}) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (!t) {
    // English fallback when t is not provided
    const suffix = short ? '' : ' ago';
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m${suffix}`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h${suffix}`;
    return `${Math.floor(h / 24)}d${suffix}`;
  }
  if (m < 1)  return t('time.justNow');
  if (m < 60) return short ? t('time.minutes', { count: m })      : t('time.minutesAgo', { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return short ? t('time.hours',   { count: h })      : t('time.hoursAgo',   { count: h });
  const d = Math.floor(h / 24);
              return short ? t('time.days',    { count: d })      : t('time.daysAgo',    { count: d });
}
