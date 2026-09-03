<script setup>
// The page behind "Support us" in the nav.
//
// It used to be a colophon — "Built with & partners", a logo wall of the
// services that run the site — with the actual ask sitting in one panel in the
// middle of it. Someone who clicks a heart labelled "Support us" and lands on a
// list of our hosting provider has not been answered. So the page is now the
// ask, and the colophon is the receipt underneath it.
//
// The referral disclosure moved with it. It was grey fine print between the ask
// and the wall, which made the best free way to help read like an apology; it
// is now one of the two ways, and its eyebrow says what it costs the reader.
// Every outbound link still carries rel="sponsored" so search engines treat
// them correctly, which is the part that actually has to be true.
//
// SSR-safe: no top-level window/document access. Logos are inline brand SVGs
// (Railway, eBay from Simple Icons; TCGplayer is a styled wordmark since it is
// not in the icon set), so the page renders server-side with zero extra
// network requests.
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useTheme } from "vuetify";
import { BUILT_WITH_TOOLS } from "@/lib/builtWithTools";
import SupportToolCard from "@/components/support/SupportToolCard.vue";

const route = useRoute();
const locale = computed(() => route.params.locale || "en");

// Track the active theme so brand-image logos swap to their white/dark treatment
// (mirrors CardPage's isDarkTheme). Default theme is dark during SSG.
const theme = useTheme();
const isDark = computed(() => theme.global.name.value !== "neonDuskLight");

// Direct donation link (Ko-fi). We link to the page rather than embedding Ko-fi's
// external widget script, which would clash with the SSG/self-contained setup.
const KOFI_URL = "https://ko-fi.com/T5S0233R1W";
// Ko-fi cup logo (Simple Icons, CC0).
const KOFI_PATH = "M11.351 2.715c-2.7 0-4.986.025-6.83.26C2.078 3.285 0 5.154 0 8.61c0 3.506.182 6.13 1.585 8.493 1.584 2.701 4.233 4.182 7.662 4.182h.83c4.209 0 6.494-2.234 7.637-4a9.5 9.5 0 0 0 1.091-2.338C21.792 14.688 24 12.22 24 9.208v-.415c0-3.247-2.13-5.507-5.792-5.87-1.558-.156-2.65-.208-6.857-.208m0 1.947c4.208 0 5.09.052 6.571.182 2.624.311 4.13 1.584 4.13 4v.39c0 2.156-1.792 3.844-3.87 3.844h-.935l-.156.649c-.208 1.013-.597 1.818-1.039 2.546-.909 1.428-2.545 3.064-5.922 3.064h-.805c-2.571 0-4.831-.883-6.078-3.195-1.09-2-1.298-4.155-1.298-7.506 0-2.181.857-3.402 3.012-3.714 1.533-.233 3.559-.26 6.39-.26m6.547 2.287c-.416 0-.65.234-.65.546v2.935c0 .311.234.545.65.545 1.324 0 2.051-.754 2.051-2s-.727-2.026-2.052-2.026m-10.39.182c-1.818 0-3.013 1.48-3.013 3.142 0 1.533.858 2.857 1.949 3.897.727.701 1.87 1.429 2.649 1.896a1.47 1.47 0 0 0 1.507 0c.78-.467 1.922-1.195 2.623-1.896 1.117-1.039 1.974-2.364 1.974-3.897 0-1.662-1.247-3.142-3.039-3.142-1.065 0-1.792.545-2.338 1.298-.493-.753-1.246-1.298-2.312-1.298";

// The two groups no longer share a heading style or a section, because they no
// longer mean the same kind of thing: one is a way to help, the other is what
// the help pays for.
const MARKETPLACES = computed(() => BUILT_WITH_TOOLS.filter((t) => t.group === "marketplace"));
const STACK        = computed(() => BUILT_WITH_TOOLS.filter((t) => t.group === "stack"));
</script>

<template>
  <div class="sp">
    <router-link :to="`/${locale}/`" class="sp__back">
      <v-icon icon="mdi-arrow-left" size="14" />{{ $t("builtWith.back") }}
    </router-link>

    <!-- The claim the whole page rests on, and the owner's own words for it.
         Every marketplace this page goes on to link takes a percentage; this
         one does not, which is the single most characteristic thing about it
         and the reason there is anything to ask for. -->
    <header class="sp__hero">
      <h1 class="sp__h1">{{ $t("builtWith.heading") }}</h1>
      <p class="sp__lede">{{ $t("builtWith.intro") }}</p>
    </header>

    <!-- Way one. -->
    <section class="sp__way" aria-labelledby="sp-coffee-h">
      <span class="sp__eyebrow">{{ $t("builtWith.ways.coffee.eyebrow") }}</span>
      <h2 id="sp-coffee-h" class="sp__h2">{{ $t("builtWith.ways.coffee.title") }}</h2>
      <p class="sp__body">{{ $t("builtWith.ways.coffee.body") }}</p>
      <a :href="KOFI_URL" target="_blank" rel="noopener noreferrer" class="sp__kofi">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path :d="KOFI_PATH" /></svg>
        {{ $t("builtWith.ways.coffee.cta") }}
      </a>
    </section>

    <!-- Way two, which used to be the disclosure. The cards below it are not a
         logo wall here — they are the links the paragraph is talking about. -->
    <section class="sp__way" aria-labelledby="sp-shop-h">
      <span class="sp__eyebrow sp__eyebrow--free">{{ $t("builtWith.ways.shop.eyebrow") }}</span>
      <h2 id="sp-shop-h" class="sp__h2">{{ $t("builtWith.ways.shop.title") }}</h2>
      <p class="sp__body">{{ $t("builtWith.ways.shop.body") }}</p>

      <!-- No heading over these. The paragraph above already says what they
           are, and a third level between it and the links it is pointing at
           labels nothing that was not just said. -->
      <div class="sp__grid">
        <SupportToolCard
          v-for="tool in MARKETPLACES"
          :key="tool.key"
          :tool="tool"
          :is-dark="isDark"
        >{{ $t(`builtWith.tools.${tool.key}`) }}</SupportToolCard>
      </div>
    </section>

    <!-- The colophon, demoted to what it is: the receipt. -->
    <section v-if="STACK.length" class="sp__runs" aria-labelledby="sp-runs-h">
      <h2 id="sp-runs-h" class="sp__label">{{ $t("builtWith.runsOn") }}</h2>
      <div class="sp__rows">
        <SupportToolCard
          v-for="tool in STACK"
          :key="tool.key"
          :tool="tool"
          :is-dark="isDark"
          variant="row"
        >{{ $t(`builtWith.tools.${tool.key}`) }}</SupportToolCard>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Same three-surface stack and lit top edge the landing page and the announces
   board are built from, so the page you reach from the nav is recognisably the
   same product as the page you arrived on. */
.sp {
  --sp-w: min(100%, 760px);
  --sp-r-card: 16px;
  --sp-panel: color-mix(in srgb, var(--c-surface) 94%, var(--c-bg));
  --sp-line: color-mix(in srgb, var(--c-border) 60%, transparent);
  --sp-line-soft: color-mix(in srgb, var(--c-border) 34%, transparent);
  --sp-lit: inset 0 1px 0 color-mix(in srgb, var(--c-text) 8%, transparent);
  /* Ko-fi's own blue. It belongs on Ko-fi's button and nowhere else: as the
     panel's border, gradient and shadow it made a third party's brand the most
     saturated thing on a NoBinder page. */
  --sp-kofi: #72A4F2;

  width: var(--sp-w);
  margin-inline: auto;
  padding-block: clamp(28px, 5vw, 56px);
  display: flex;
  flex-direction: column;
  gap: clamp(28px, 4vw, 44px);
}

/* Padded to the 24px target minimum: it is a standalone link rather than one
   inside a sentence, so it does not get the inline exception. */
.sp__back {
  display: inline-flex; align-items: center; gap: 5px;
  width: fit-content;
  min-height: 24px;
  padding: 3px 0;
  font-size: 12px;
  color: var(--c-muted);
  text-decoration: none;
  transition: color 0.15s ease;
}
.sp__back:hover { color: var(--c-text); }
.sp__back:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 3px; border-radius: 4px; }

/* ── Hero ─────────────────────────────────────────── */
.sp__hero { display: flex; flex-direction: column; gap: 12px; margin-top: -12px; }
.sp__h1 {
  font-family: "Space Grotesk", "Manrope", system-ui, sans-serif;
  font-size: clamp(1.9rem, 4.4vw, 2.75rem);
  font-weight: 700;
  line-height: 1.04;
  letter-spacing: -0.032em;
  color: var(--c-text);
  margin: 0;
  text-wrap: balance;
}
.sp__lede {
  font-size: clamp(0.95rem, 1.2vw, 1.05rem);
  line-height: 1.6;
  color: var(--c-muted);
  margin: 0;
  max-width: 58ch;
}

/* ── The two ways ─────────────────────────────────── */
.sp__way { display: flex; flex-direction: column; gap: 10px; }

/* The structural device on this page. It is not decoration and it is not a
   sequence — these are alternatives, not steps, so they are not numbered.
   What separates them is what they cost the reader, so that is what the label
   says. Mono and tracked, the voice the app labels every other section in. */
.sp__eyebrow {
  display: inline-flex; align-items: center;
  width: fit-content;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--c-trade);
  background: color-mix(in srgb, var(--c-trade) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--c-trade) 26%, transparent);
  border-radius: 999px;
  padding: 6px 13px;
}
/* The free option is the one most people can actually take, so it gets the
   warmer of the two and reads as the invitation it is. */
/* 8% rather than the amethyst eyebrow's 12%: pink text over a pink tint eats
   its own headroom, and at 12% this measured 4.55:1 in the light theme against
   the 4.5 an 11px label needs. 8% puts it at 5.01 without changing what it
   looks like. */
.sp__eyebrow--free {
  color: var(--c-accent);
  background: color-mix(in srgb, var(--c-accent) 8%, transparent);
  border-color: color-mix(in srgb, var(--c-accent) 30%, transparent);
}

.sp__h2 {
  font-family: "Space Grotesk", "Manrope", system-ui, sans-serif;
  font-size: clamp(1.2rem, 2vw, 1.45rem);
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.02em;
  color: var(--c-text);
  margin: 4px 0 0;
}
.sp__body {
  font-size: 14px;
  line-height: 1.6;
  color: var(--c-muted);
  margin: 0;
  max-width: 62ch;
}

/* Section label for the grids underneath a way. */
.sp__label {
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--c-muted);
  margin: 14px 0 0;
}

/* ── Ko-fi button ─────────────────────────────────── */
/* Dark ink, not white. White on this blue measured 2.53:1 at 15px/700, against
   the 4.5 that size needs — and because both values are fixed, it failed in
   both themes rather than just one. The app's own light-theme ink clears 7:1 on
   the same blue (DESIGN.md, The Label Contrast Rule). */
.sp__kofi {
  align-self: flex-start;
  margin-top: 4px;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  min-height: 44px;
  padding: 0 20px;
  border-radius: 12px;
  background: var(--sp-kofi);
  color: #1A0D45;
  font-weight: 700;
  font-size: 14.5px;
  text-decoration: none;
  transition: filter 0.15s ease;
}
.sp__kofi:hover { filter: brightness(1.06); }
.sp__kofi:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 3px; }
.sp__kofi svg { width: 21px; height: 21px; }

/* ── Grids ────────────────────────────────────────── */
.sp__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: 12px;
  margin-top: 10px;
}

.sp__rows { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }

/* ── The receipt ──────────────────────────────────── */
/* Set apart by a rule rather than a heading size: what the money pays for is a
   different kind of statement from a way to help, and the page should not look
   like it is asking three times. */
.sp__runs {
  display: flex;
  flex-direction: column;
  padding-top: clamp(20px, 3vw, 32px);
  border-top: 1px solid var(--sp-line-soft);
}
.sp__runs .sp__label { margin-top: 0; }

@media (prefers-reduced-motion: reduce) {
  .sp__back, .sp__kofi { transition: none; }
}
</style>
