// Avatar/banner uploads for community profiles. Pure helpers (validation, path)
// are unit-tested; uploadCommunityMedia is a thin Storage wrapper.
import { getClient } from "@/lib/supabaseClient";

const BUCKET = "community-media";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export function validateImageFile(file) {
  if (!file) return { ok: false, error: "no_file" };
  if (!(file.type || "").startsWith("image/")) return { ok: false, error: "wrong_type" };
  if (file.size > MAX_BYTES) return { ok: false, error: "too_large" };
  return { ok: true };
}

// "{communityId}/{kind}-{timestamp}.{ext}" — the leading community id is the RLS
// anchor; the timestamp busts the CDN cache when an image is replaced.
export function mediaPath(communityId, kind, file) {
  const dot = (file.name || "").lastIndexOf(".");
  const raw = dot >= 0 ? file.name.slice(dot + 1) : "";
  const ext = raw.toLowerCase().replace(/[^a-z0-9]/g, "") || "img";
  return `${communityId}/${kind}-${Date.now()}.${ext}`;
}

// Upload to the community-media bucket and return the public URL. Throws on failure.
export async function uploadCommunityMedia(communityId, kind, file) {
  const client = getClient();
  const path = mediaPath(communityId, kind, file);
  const { error } = await client.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600", upsert: false, contentType: file.type,
  });
  if (error) { console.error("uploadCommunityMedia failed", error); throw error; }
  return client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
