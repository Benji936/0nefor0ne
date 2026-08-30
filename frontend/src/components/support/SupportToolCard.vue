<script setup>
// One outbound link on the support page: a partner's mark, its name, and what
// it does for us.
//
// Extracted because the page renders this twice — once for the marketplaces you
// can shop through and once for the service the money pays for — and a copy of
// eighteen lines of markup in the same file is how two grids drift apart.
//
// SSR-safe: the brand marks are inline SVG paths or bundled assets, so a
// prerendered page makes no extra request to draw them.
// Two presentations, because the page makes two different statements with the
// same data. "card" is a thing you might click and go shop at. "row" is a line
// on a receipt — and a receipt with one line on it should be one line, not a
// grid with a single 760px-wide cell stretched across it.
defineProps({
  tool:    { type: Object,  required: true },
  isDark:  { type: Boolean, default: true },
  variant: { type: String,  default: "card" },
});
</script>

<template>
  <a
    :href="tool.href"
    target="_blank"
    rel="sponsored noopener noreferrer"
    class="stc"
    :class="`stc--${variant}`"
  >
    <span class="stc__logo">
      <img
        v-if="tool.img"
        :src="isDark ? tool.img.dark : tool.img.light"
        :alt="tool.name"
        class="stc__logo-img"
      />
      <svg v-else-if="tool.path" :viewBox="tool.viewBox" fill="currentColor" aria-hidden="true">
        <path :d="tool.path" />
      </svg>
      <span v-else class="stc__wordmark">{{ tool.name }}</span>
    </span>
    <span class="stc__name">{{ tool.name }}</span>
    <span class="stc__blurb"><slot /></span>
  </a>
</template>

<style scoped>
.stc {
  display: flex;
  padding: 20px;
  border-radius: var(--sp-r-card, 16px);
  border: 1px solid var(--sp-line, var(--c-border));
  background: var(--sp-panel, var(--c-surface));
  /* A lit top edge rather than a drop shadow. The card used to lift on
     translateY with a raw purple shadow underneath, which the light theme drew
     as a bruise (DESIGN.md, The Flat-By-Default Rule). */
  box-shadow: var(--sp-lit, none);
  text-decoration: none;
  transition: border-color 0.18s ease, background 0.18s ease;
}
.stc:hover {
  border-color: color-mix(in srgb, var(--c-trade) 55%, transparent);
  background: color-mix(in srgb, var(--c-trade) 5%, var(--sp-panel, var(--c-surface)));
}
.stc:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 3px; }

.stc--card { flex-direction: column; gap: 9px; }

/* The receipt line. The mark sits left, the name and what it does read across —
   a shape that works the same whether there is one service or six. */
.stc--row {
  align-items: center;
  gap: 16px;
  padding: 14px 18px;
  flex-wrap: wrap;
}
.stc--row .stc__logo { flex: none; }
.stc--row .stc__name { flex: none; }
.stc--row .stc__blurb { flex: 1 1 260px; min-width: 0; }

.stc__logo {
  display: flex;
  align-items: center;
  height: 28px;
  color: var(--c-muted);
  transition: color 0.18s ease;
}
.stc:hover .stc__logo { color: var(--c-text); }
.stc__logo svg { height: 24px; width: auto; display: block; }
.stc__logo-img { height: 24px; width: auto; max-width: 150px; object-fit: contain; display: block; }
.stc__wordmark {
  font-family: "Space Grotesk", "Manrope", system-ui, sans-serif;
  font-weight: 700;
  font-size: 20px;
  letter-spacing: -0.5px;
}

.stc__name { font-size: 14.5px; font-weight: 700; color: var(--c-text); }
.stc__blurb { font-size: 13px; line-height: 1.5; color: var(--c-muted); }

@media (prefers-reduced-motion: reduce) {
  .stc, .stc__logo { transition: none; }
}
</style>
