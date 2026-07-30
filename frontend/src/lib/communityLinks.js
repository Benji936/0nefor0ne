// Platform registry for community profile links. A community carries a `links`
// JSONB array of { platform, url, label? }; the profile renders each with its
// brand icon. `icon` is an mdi glyph name, except the "tiktok" sentinel which
// PlatformIcon.vue draws as an inline SVG (mdi has no TikTok glyph).
export const LINK_PLATFORMS = [
  { id: "website",   icon: "mdi-web" },
  { id: "instagram", icon: "mdi-instagram" },
  { id: "facebook",  icon: "mdi-facebook" },
  { id: "x",         icon: "mdi-twitter" },
  { id: "tiktok",    icon: "tiktok" },
  { id: "youtube",   icon: "mdi-youtube" },
  { id: "discord",   icon: "discord" },
  { id: "whatsapp",  icon: "mdi-whatsapp" },
  { id: "email",     icon: "mdi-email-outline" },
  { id: "other",     icon: "mdi-link-variant" },
];

export const PLATFORM_IDS = LINK_PLATFORMS.map((p) => p.id);
const BY_ID = Object.fromEntries(LINK_PLATFORMS.map((p) => [p.id, p]));

export const MAX_LINKS = 12;

// Metadata for a platform id, falling back to "other" for anything unknown so a
// legacy or malformed value still renders a generic link rather than breaking.
export function platformMeta(id) {
  return BY_ID[id] || BY_ID.other;
}

// The href a link points to: email becomes a mailto:, everything else is the
// stored http(s) URL.
export function linkHref(link) {
  if (!link?.url) return null;
  if (link.platform === "email") return `mailto:${String(link.url).replace(/^mailto:/i, "")}`;
  return link.url;
}

// A single row's shape is valid when it has a non-empty url and, for email, a
// well-formed address. Used by the editor to gate saving and flag bad rows.
export function isValidLink(link) {
  const url = String(link?.url ?? "").trim();
  if (!url) return false;
  if (link.platform === "email") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url.replace(/^mailto:/i, "").trim());
  }
  return true;
}

// Normalize a links array for persistence: drop empty/unknown rows, keep only a
// trimmed label on "other", forgivingly prefix https:// where a scheme is
// missing, strip mailto: from emails, and cap the count. Never throws; the
// editor validates for feedback, this is the final safety net.
export function sanitizeLinks(links) {
  if (!Array.isArray(links)) return [];
  const out = [];
  for (const raw of links) {
    const platform = String(raw?.platform ?? "").trim();
    let url = String(raw?.url ?? "").trim();
    if (!platform || !url || !PLATFORM_IDS.includes(platform)) continue;
    if (platform === "email") {
      url = url.replace(/^mailto:/i, "").trim();
    } else if (!/^https?:\/\//i.test(url)) {
      url = "https://" + url;
    }
    const entry = { platform, url };
    if (platform === "other") {
      const label = String(raw?.label ?? "").trim().slice(0, 40);
      if (label) entry.label = label;
    }
    out.push(entry);
    if (out.length >= MAX_LINKS) break;
  }
  return out;
}
