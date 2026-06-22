# Analysis: SEO Post-SSR Fixes

## Affected Files

1. `frontend/src/components/Pages/CardPage.vue`
2. `frontend/src/views/App.vue`
3. `frontend/scripts/verify-ssg-output.mjs`

---

## CardPage.vue — Current Code Sections Requiring Change

### C1a — useHead fallback (line 244-245)
Returns only `{ title: "Yu-Gi-Oh! Card — One for One" }`. Must also return description, og:image, og:url, canonical, twitter:card/title/description/image, and link[canonical].

### C1b — onServerPrefetch null handling (lines 233-236)
```js
const data = res?.data?.data?.[0] ?? res?.data?.[0] ?? null;
if (data) ssrCard.value = data;
```
When data is null the block silently exits — vite-ssg snapshots degraded HTML. Fix: add `if (!data) throw new Error(...)` so vite-ssg skips the route.

### H2 — Thin description logic (line 253)
```js
const desc = raw.length > 155 ? raw.slice(0, 155) + "…" : raw ||
  `Trade ${card.name} on One for One — the free Yu-Gi-Oh! card trading platform.`;
```
When 0 < raw.length < 30, neither guard fires. Fix: add explicit check for raw.length < 30 to append platform context.

### M2 — Offer schema fields (lines 270-274)
Remove `price: "0"`, `priceCurrency: "USD"`, `availability: "https://schema.org/InStock"` from every Offer object.

### L1 — Hero image (lines 40-46)
img tag lacks `fetchpriority="high"`. No `loading="lazy"` present — only fetchpriority needs adding.

---

## App.vue — Current Code Sections Requiring Change

### H1 — t() calls missing locale option (lines 35-39)
`localeVal.value` is computed on line 21 but never passed to any `t()` call. All t() calls must receive `{ locale: localeVal.value }` as the third argument (or merged into options where params are passed).

---

## verify-ssg-output.mjs — Missing Assertions

Current checks: title, description presence, canonical, hreflang, og:title, og:url, json-ld (cards).

New checks needed:
- `og:image` on card pages
- description content is non-empty (not just attribute presence)
- /fr/, /de/, /it/ titles are not the English string
- JSON-LD on card pages does not contain `"price"` field

---

## Integration Points

- `useHead` already imported and reactive computed pattern already in place in both files
- `localeVal` already defined in App.vue line 21; just needs threading into t() calls
- `onServerPrefetch` already has try/catch + re-throw for errors; null case just needs an explicit throw
- `cardImage(card.id)` already imported in CardPage.vue; fallback useHead block can reuse for og:image

---

## Risks

1. **C1b throw on null**: If API returns null transiently, those card routes will be absent from dist entirely rather than having degraded HTML. Confirm the 6 affected IDs are truly broken vs. transient.

2. **H1 locale in t()**: Missing translation keys will still fall back to English via the `|| t("meta.search.title")` chain — that fallback call also needs a locale arg to avoid English fallback for non-en locales.

3. **H2 desc truncation order**: Appending platform context before checking length may push past 155 chars. Compute appended string first, then apply truncation.

4. **verify locale title checks**: Hardcoded expected strings will break if translations change. Use substring/keyword match instead of exact strings.
