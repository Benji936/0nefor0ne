// URL <-> directory-filter mapping, kept pure so both the page and its tests
// share one source of truth. Empty strings, false, and page 0 are the "unset"
// values and never appear in the URL.
export function toQueryParams(f = {}) {
  const out = {};
  if (f.kind)          out.kind = f.kind;
  if (f.country)       out.country = f.country;
  if (f.region)        out.region = f.region;
  if (f.remoteDuel === true) out.remote = "1";
  if (f.q && f.q.trim()) out.q = f.q.trim();
  if (f.page && f.page > 0) out.page = String(f.page);
  return out;
}

export function fromQueryParams(query = {}) {
  return {
    kind:       query.kind ?? "",
    country:    query.country ?? "",
    region:     query.region ?? "",
    remoteDuel: query.remote === "1",
    q:          query.q ?? "",
    page:       query.page ? parseInt(query.page, 10) || 0 : 0,
  };
}
