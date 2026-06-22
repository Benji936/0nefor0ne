# vite-ssg-seo

Reference skill for fixing SSR/SSG SEO issues in Vue 3 + vite-ssg + @unhead/vue v2.

## 1. useHead + vue-i18n locale in SSR (H1 fix)

**Problem:** During SSG, `setLocale('fr')` updates `i18n.global.locale.value` but @unhead/vue v2
snapshots head tags *after* app render. If `t()` is called without an explicit locale option,
it resolves against whatever locale was active at snapshot time — often English (the default).

**Root cause:** In vite-ssg, each route is rendered in a new app instance. The `locale` ref
from `useI18n()` is reactive, but the `computed(() => ...)` passed to `useHead` may close over
a stale locale value if vue-i18n's composable locale is not yet propagated when `@unhead` collects.

**Fix:** Force the locale explicitly on every `t()` call inside `useHead` computed:
```js
const { t, locale } = useI18n()
const localeVal = computed(() => route.params?.locale || 'en')

useHead(computed(() => {
  const opts = { locale: localeVal.value }
  const title = t(`meta.${page}.title`, {}, opts)
  const desc  = t(`meta.${page}.desc`,  {}, opts)
  return { title, meta: [{ name: 'description', content: desc }] }
}))
```

The third argument `{ locale }` to `t()` overrides the active locale for that call, making
the translation deterministic regardless of async reactivity during SSR.

**Reference:** https://github.com/antfu/vite-ssg/discussions/58

---

## 2. onServerPrefetch error handling — skip degraded routes (C1 fix)

**Problem:** If `onServerPrefetch` fetches card data and gets null (API timeout / empty result),
the `ssrCard` ref stays null. `useHead` returns a stub `{ title: "..." }` with no description,
og:image, or JSON-LD. vite-ssg silently writes degraded HTML.

**Two-layer fix:**

### Layer A — throw on null to skip the route
```js
onServerPrefetch(async () => {
  const data = await fetchCard(cardId)
  if (!data) {
    throw new Error(`No data for card ${cardId}`) // vite-ssg skips this route
  }
  ssrCard.value = data
})
```
Throwing inside `onServerPrefetch` causes vite-ssg to abort rendering that route and move on.
The route is simply omitted from the `dist/` output rather than written with incomplete HTML.

### Layer B — rich fallback in useHead for safety
Even if the throw path is present, add a full fallback so partial runs don't produce bare pages:
```js
if (!card) return {
  title: 'Yu-Gi-Oh! Card — One for One',
  meta: [
    { name: 'description', content: 'Trade Yu-Gi-Oh! cards on One for One.' },
    { property: 'og:image', content: `${BASE}/logo.png` },
    { property: 'og:url',   content: canonical },
    { rel: 'canonical',     href: canonical },   // NOTE: put links in link[], not meta[]
  ],
  link: [{ rel: 'canonical', href: canonical }],
}
```

---

## 3. Short meta descriptions — append context (H2 fix)

When `card.desc` is fewer than 30 characters (e.g. "2 Tuners"), the meta description is
SEO-worthless. Append platform context:
```js
const raw = card.desc ?? ''
const tooShort = raw.length > 0 && raw.length < 30
const desc = tooShort
  ? `${raw} — Trade ${card.name} on One for One.`
  : raw.length > 155
    ? raw.slice(0, 155) + '…'
    : raw || `Trade ${card.name} on One for One — the free Yu-Gi-Oh! card trading platform.`
```

---

## 4. Product JSON-LD Offer — remove price:0 (M2 fix)

**Problem:** `price: "0", priceCurrency: "USD", availability: "InStock"` in Offer entries
sends misleading signals. Google suppresses rich results for zero-priced Product structured data
(confirmed by Google Search Central docs and JSON-LD for SEO blog post).

**Why it's wrong:** Cards are listed for *trade*, not for sale at $0. Including a price field
implies a monetary transaction and triggers Google's price-mismatch validation.

**Fix:** Remove `price`, `priceCurrency`, and `availability` from every Offer in the JSON-LD.
Keep only fields that accurately describe a trade listing:
```js
offers: card.card_sets.map(s => ({
  '@type': 'Offer',
  sku: s.set_code,
  name: s.set_rarity,
  url: `https://www.cardmarket.com/...`,
  seller: { '@type': 'Organization', name: 'One for One' },
}))
```

**References:**
- https://www.ilanadavis.com/blogs/articles/json-ld-for-seo-now-hides-zero-priced-product-structured-data-by-default
- https://developers.google.com/search/docs/appearance/structured-data/product

---

## 5. fetchpriority="high" on LCP image (L1 fix)

**Problem:** The primary card image (above the fold) is fetched at normal browser priority.
This delays LCP, which Google uses as a Core Web Vital.

**Fix:** On the first/primary `<img>` element in CardPage:
```html
<img
  :src="cardImageUrl"
  :alt="card.name"
  fetchpriority="high"
/>
```
Remove `loading="lazy"` on this image — lazy loading and high fetch priority conflict and browsers
may ignore one or both hints if they appear together on the same element.

**Rules:**
- Only ONE image per page should have `fetchpriority="high"` — the above-fold LCP candidate.
- All other images keep `loading="lazy"` and no fetchpriority (or `fetchpriority="low"`).
- `fetchpriority` is a hint, not a directive — the browser may override it.

**Impact:** Real-world data shows 20–30% LCP improvement for above-fold hero images.

**References:**
- https://web.dev/articles/fetch-priority
- https://developer.mozilla.org/en-US/blog/fix-image-lcp/
- https://www.debugbear.com/blog/avoid-overusing-fetchpriority-high

---

## Affected Files

| File | Issues |
|------|--------|
| `frontend/src/views/App.vue` | H1 — locale-aware `t()` in `useHead` |
| `frontend/src/components/Pages/CardPage.vue` | C1, H2, M2, L1 |

## Verification Checklist

```bash
# After build:
grep -c '<meta name="description"' dist/en/card/*/index.html   # all non-zero
grep -c 'og:image' dist/en/card/*/index.html                   # all non-zero
grep '"price"' dist/en/card/*/index.html                       # should be empty
grep 'fetchpriority' dist/en/card/*/index.html                 # should appear

# Locale titles
grep '<title>' dist/fr/index.html   # must contain French text
grep '<title>' dist/de/index.html   # must contain German text
grep '<title>' dist/it/index.html   # must contain Italian text
```
