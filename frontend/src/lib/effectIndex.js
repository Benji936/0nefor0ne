// Lazy, cached loader for the precomputed EDOPro effect index.
// The file (public/data/effect-index.json) is fetched once on first use and
// reused for the rest of the session. It maps passcode -> { fetches: [...] }.

let _cache = null;
let _promise = null;

export async function loadEffectIndex() {
  if (_cache) return _cache;
  if (!_promise) {
    const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
    _promise = fetch(`${base}/data/effect-index.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((json) => {
        _cache = json;
        return json;
      })
      .catch(() => {
        _promise = null; // allow retry
        return {};
      });
  }
  return _promise;
}

/** Return the effect entry for a passcode, or null. */
export async function getCardEffects(id) {
  const index = await loadEffectIndex();
  return index[String(id)] ?? null;
}
