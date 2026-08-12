# vite-ssg-seo

Reference skill for fixing SSR/SSG SEO issues in Vue 3 + vite-ssg + @unhead/vue v2.

## 1. useHead + vue-i18n locale in SSR (H1 fix)

**Problem:** During SSG, `setLocale('fr')` updates `i18n.global.locale.value` but @unhead/vue v2
snapshots head tags *after* app render. If `t()` is called without an explicit locale option,
it resolves against whatever locale was active at snapshot time — often English (the default).

**Root cause (corrected 2026-08-12):** vite-ssg renders each route in a new app instance, but
`src/i18n.js` exported one `createI18n()` result at module scope, so every app shared a single
locale ref. vite-ssg renders routes concurrently in one Node process; the locale one route's
guard set was overwritten by another route's before the first finished rendering. Nothing about
@unhead's snapshot timing was involved.

**Fix (real):** `createAppI18n()` is a factory called inside the `ViteSSG` setup callback, and
`main.js`'s `router.beforeEach` — the only code holding that app's instance — is the single
place the locale is set. `src/router/index.js` is shared by every app and must stay stateless.

**Fix (the workaround below):** forcing an explicit locale on `t()` inside `useHead` made the
*head* immune to the shared ref. It is still correct and worth keeping, but on its own it hid
the bug rather than fixing it: `/fr/`, `/de/` and `/it/` shipped correct localized titles above
an English body for months, and a title-only check cannot see that. Assert on the **body**:
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

## 6. Vercel must be told to serve the prerendered files (P1 fix)

**Problem:** vite-ssg writes `dist/en/cards.html`, `dist/en/card/19144622.html` and so on, but
Vercel served the SPA shell at every one of those URLs. `/en/` worked because directory indexes
always resolve to `index.html`; `/en/cards` did not, because Vercel will not try `cards.html`
for an extensionless path unless `cleanUrls` is on. The lookup missed, and the SPA-fallback
rewrite caught it. 250 of the 254 URLs in `sitemap.xml` were byte-identical 7 kB shells.

**Fix:** `"cleanUrls": true` in `frontend/vercel.json`. Keep the catch-all rewrite — it is still
the right fallback for routes that are not prerendered. `cleanUrls` also 308s `/en/cards.html`
to `/en/cards`, which stops the prerendered files being indexable at a second address.

**`vercel.json` takes no comments.** It is schema-validated, and an unknown key — including a
`"//"` comment key — fails the deployment during configuration validation, *before* the build
runs. The symptom is a failed check with no build logs at all and a status URL pointing at the
project-configuration docs. Explain changes in the commit message instead.

**Verify on a deploy, never locally** — `vite preview` does its own extension resolution and
will happily serve pages that production does not:
```bash
curl -sI https://<deployment>/en/cards | grep -i content-length   # ~42 kB, not ~7 kB
curl -s  https://<deployment>/en/cards | grep -o '<title>[^<]*'   # page title, not the shell's
```

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

# Locale titles — necessary but NOT sufficient: these passed for months while
# the bodies below were English. Never treat a green title check as proof.
grep '<title>' dist/fr/index.html   # must contain French text
grep '<title>' dist/de/index.html   # must contain German text
grep '<title>' dist/it/index.html   # must contain Italian text

# Locale bodies — the check that actually catches a leaked locale.
npm run verify:ssg                  # asserts body copy per locale, all page types
```
