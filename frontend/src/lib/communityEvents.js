// Data access for community events. Events belong to a community; RLS returns
// published events (of published communities) to the public and every event to
// the owner, so a single fetch works for both and the client partitions into
// upcoming / past. Writes go straight through PostgREST under the owner-through-
// parent RLS policies (no Edge Function).
import { getClient } from "@/lib/supabaseClient";

export const MAX_TITLE = 140;
export const MAX_DESC = 2000;

// Mirrors the assertHttp style in community.js: null passes through, a present
// value must carry an http(s) scheme.
function assertHttp(url, label = "Link") {
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) throw new Error(`${label} must start with http:// or https://`);
  return url;
}

// Every event of a community the caller may see, ordered by start ascending.
export async function fetchEvents(communityId) {
  const { data, error } = await getClient()
    .from("community_event")
    .select("*")
    .eq("community", communityId)
    .order("starts_at", { ascending: true });
  if (error) { console.error("fetchEvents failed", error); throw error; }
  return data ?? [];
}

// Split rows into upcoming (start >= now, soonest first) and past (start < now,
// most recent first). `now` is injectable for deterministic tests.
export function partitionEvents(rows, now = Date.now()) {
  const upcoming = [];
  const past = [];
  for (const e of rows ?? []) {
    const t = new Date(e?.starts_at).getTime();
    if (Number.isNaN(t)) continue;
    (t >= now ? upcoming : past).push(e);
  }
  upcoming.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  past.sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
  return { upcoming, past };
}

// Validate an editor event object. Returns { ok, error? } where error is an
// i18n key suffix (community.eventErr_<error>).
export function validateEvent(e) {
  const title = String(e?.title ?? "").trim();
  if (!title) return { ok: false, error: "titleRequired" };
  if (title.length > MAX_TITLE) return { ok: false, error: "titleTooLong" };
  if (String(e?.description ?? "").length > MAX_DESC) return { ok: false, error: "descTooLong" };
  if (!e?.starts_at) return { ok: false, error: "startRequired" };
  const start = new Date(e.starts_at).getTime();
  if (Number.isNaN(start)) return { ok: false, error: "startInvalid" };
  if (e?.ends_at) {
    const end = new Date(e.ends_at).getTime();
    if (Number.isNaN(end)) return { ok: false, error: "endInvalid" };
    if (end < start) return { ok: false, error: "endBeforeStart" };
  }
  if (e?.url && !/^https?:\/\//i.test(String(e.url).trim())) return { ok: false, error: "urlInvalid" };
  return { ok: true };
}

// Whitelist + normalize an editor object into a DB row. `community` is included
// on insert and stripped on update so an event can never change community.
function toRow(communityId, e) {
  return {
    community:   communityId,
    title:       String(e.title).trim(),
    description: String(e.description ?? "").trim(),
    starts_at:   new Date(e.starts_at).toISOString(),
    ends_at:     e.ends_at ? new Date(e.ends_at).toISOString() : null,
    timezone:    e.timezone || null,
    is_online:   !!e.is_online,
    location:    String(e.location ?? "").trim() || null,
    url:         assertHttp(String(e.url ?? "").trim() || null, "Event link"),
    cover_url:   e.cover_url || null,
    status:      e.status === "hidden" ? "hidden" : "published",
  };
}

export async function createEvent(communityId, e) {
  const { data, error } = await getClient()
    .from("community_event").insert(toRow(communityId, e)).select().single();
  if (error) { console.error("createEvent failed", error); throw error; }
  return data;
}

export async function updateEvent(id, communityId, e) {
  const row = toRow(communityId, e);
  delete row.community; // an event never moves between communities
  const { data, error } = await getClient()
    .from("community_event").update(row).eq("id", id).select().single();
  if (error) { console.error("updateEvent failed", error); throw error; }
  return data;
}

export async function deleteEvent(id) {
  const { error } = await getClient().from("community_event").delete().eq("id", id);
  if (error) { console.error("deleteEvent failed", error); throw error; }
}

// Locale-aware "when" label. The event's stored timezone (if any) drives display
// so a store's time reads consistently; a bad tz or SSR falls back to UTC rather
// than throwing.
export function formatEventWhen(event, locale = "en") {
  if (!event?.starts_at) return "";
  const start = new Date(event.starts_at);
  if (Number.isNaN(start.getTime())) return "";
  const tz = event.timezone || undefined;
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", ...(tz ? { timeZone: tz } : {}) }).format(start);
  } catch {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(start);
  }
}

/**
 * The community's own address, as free text ("Geneva, Switzerland").
 * Used to prefill a store's event location — a store's events are almost
 * always at the store — and as the fallback when an in-person event has no
 * location of its own.
 */
export function communityLocation(community) {
  return [community?.city, community?.country].map((s) => String(s ?? "").trim()).filter(Boolean).join(", ");
}

/**
 * Where an event actually is, as displayable text: the event's own location,
 * falling back to the community's. Empty for online events.
 */
export function eventPlace(event, community) {
  if (event?.is_online) return "";
  return String(event?.location ?? "").trim() || communityLocation(community);
}

/**
 * A map link for an event's location, or null when there is nothing to point
 * at (online events, or no address anywhere). Uses the same Google Maps search
 * form as the community profile's map link.
 *
 * Prefers the community's exact coordinates when the event has no location of
 * its own, since those pin the venue precisely rather than re-searching text.
 */
export function eventMapUrl(event, community) {
  if (event?.is_online) return null;

  const own = String(event?.location ?? "").trim();
  if (!own && community?.lat != null && community?.lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${community.lat},${community.lng}`;
  }

  const place = own || communityLocation(community);
  if (!place) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
}
