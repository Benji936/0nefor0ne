/**
 * Reading a row from the `fetch_trade_events` RPC.
 *
 * This exists because the field names are not guessable and getting one wrong
 * fails silently. The RPC returns
 *
 *   { id, event_type, actor_id, from_status, to_status, notes, created_at }
 *
 * and a view that reached for `evt.type` or `evt.actor` got `undefined`, fell
 * through to the unknown-event fallback, and rendered a generic icon with an
 * empty label next to a perfectly correct timestamp. Nothing threw, nothing
 * failed a build, and the row still looked like a row.
 *
 * So the mapping lives here with a test that feeds it the exact shape the RPC
 * returns. Renaming a column on the database side now breaks a test instead of
 * quietly blanking the activity log.
 */

/** Icon and colour per event type. Labels stay in the view — they need `t`. */
const EVENT_META = {
  created:   { icon: "mdi-plus-circle-outline",   color: "var(--c-trade)",  labelKey: "tradeDetail.tradeProposed" },
  accepted:  { icon: "mdi-check-circle-outline",  color: "var(--c-mutual)", labelKey: "proposal.accepted"         },
  declined:  { icon: "mdi-close-circle-outline",  color: "var(--c-accent)", labelKey: "proposal.declined"         },
  cancelled: { icon: "mdi-cancel",                color: "var(--c-muted)",  labelKey: "proposal.cancelled"        },
  completed: { icon: "mdi-handshake-outline",     color: "var(--c-mutual)", labelKey: "proposal.completed"        },
  updated:   { icon: "mdi-pencil-circle-outline", color: "var(--c-muted)",  labelKey: "tradeDetail.proposalEdited"},
};

const UNKNOWN = { icon: "mdi-information-outline", color: "var(--c-muted)", labelKey: null };

/**
 * Normalise one RPC row into what the activity log renders.
 *
 * `labelKey` is null for an event type we have no wording for. The view shows
 * the raw type in that case, which is ugly but honest — better than a blank
 * line, which is what the bug this replaces produced.
 *
 * @param {{event_type?: string, actor_id?: string|null, from_status?: string|null,
 *          to_status?: string|null, notes?: string|null, created_at?: string}} evt
 * @param {string|null} currentUserId
 */
export function describeEvent(evt, currentUserId = null) {
  const type = evt?.event_type ?? null;
  const meta = EVENT_META[type] ?? UNKNOWN;
  const actorId = evt?.actor_id ?? null;
  return {
    type,
    icon: meta.icon,
    color: meta.color,
    labelKey: meta.labelKey,
    // Falls back to the raw type so an unmapped event still says something.
    fallbackLabel: meta.labelKey ? null : (type ?? ""),
    actorId,
    // null when the event has no actor — the system, or a row written before
    // actor_id existed. The view renders a dash for that, not "them".
    actorIsMe: actorId != null && currentUserId != null && actorId === currentUserId,
    hasActor: actorId != null,
    fromStatus: evt?.from_status ?? null,
    toStatus: evt?.to_status ?? null,
    // Only shown when both ends are known; "→ accepted" on its own reads as a
    // transition from nothing.
    hasTransition: Boolean(evt?.from_status && evt?.to_status),
    notes: evt?.notes ?? null,
    createdAt: evt?.created_at ?? null,
  };
}
