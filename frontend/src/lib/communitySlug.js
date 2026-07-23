// URL-safe slug generation for community profiles. Mirrors the DB CHECK
// constraint slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'. Deterministic: the seed
// script and the create flow must produce identical slugs for the same input.
const MAX = 60;

function normalize(input) {
  return String(input ?? "")
    .normalize("NFKD")               // split accented letters into base + mark
    .replace(/[̀-ͯ]/g, "") // drop the combining marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")     // everything else becomes a separator
    .replace(/^-+|-+$/g, "");        // trim leading/trailing separators
}

export function slugify(name, opts = {}) {
  const parts = [normalize(name)];
  if (opts.city) parts.push(normalize(opts.city));
  let slug = parts.filter(Boolean).join("-").replace(/-+/g, "-");
  if (slug.length > MAX) slug = slug.slice(0, MAX).replace(/-+$/g, "");
  return slug || "community";
}

export function withSuffix(base, n) {
  return `${base}-${n}`;
}
