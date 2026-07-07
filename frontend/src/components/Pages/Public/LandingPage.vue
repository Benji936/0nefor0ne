<script setup>
// Public marketing landing page ("One for One"). Ported faithfully from the
// exported design (frontend/One for One - Landing (offline).html): 7 sections —
// header/nav, hero (3D-tilted app-window mockup + floating mutual-match card),
// card-art marquee, how-it-works, features, trade showcase, footer.
//
// SSR-safe (this page is SSG-pre-rendered): no top-level/setup-level access to
// window/document/localStorage/navigator. Card art comes from static CDN URLs
// (plain strings) so the page renders server-side; broken images fade out via
// an onerror handler that only runs in the browser on a real <img> error event.
//
// Theme via repo --c-* tokens (1:1 with the design). Tailwind is used only for
// layout/spacing/typography; all show/hide is driven by scoped-CSS media queries
// (never `hidden sm:flex` — Tailwind v4 base `.hidden` defeats `sm:` here).
import { computed } from "vue";
import { useRoute } from "vue-router";

const props = defineProps({
  // Session | null, forwarded by App.vue's RouterView. Drives the auth-aware CTAs.
  login: { type: [Object, null], default: null },
});

const emit = defineEmits(["requireAuth"]);

const route = useRoute();
// Locale-aware path prefix, mirroring App.vue:291 (the privacy footer link).
const locale = computed(() => route.params.locale || "en");

const isAuthed = computed(() => !!props.login);

// ── Card pool (static, SSR-safe). IDs + names from the design's `pool`. ──
const thumb = (id) => `https://images.ygoprodeck.com/images/cards_small/${id}.jpg`;
const art = (id) => `https://images.ygoprodeck.com/images/cards_cropped/${id}.jpg`;

const POOL = [
  { id: "89631139", name: "Blue-Eyes White Dragon" },
  { id: "46986414", name: "Dark Magician" },
  { id: "38033121", name: "Dark Magician Girl" },
  { id: "14558127", name: "Ash Blossom & Joyous Spring" },
  { id: "53129443", name: "Dark Hole" },
  { id: "55144522", name: "Pot of Greed" },
  { id: "74677422", name: "Red-Eyes Black Dragon" },
  { id: "70781052", name: "Summoned Skull" },
  { id: "33396948", name: "Exodia the Forbidden One" },
  { id: "23995346", name: "Blue-Eyes Ultimate Dragon" },
];

// Marquee: pool doubled for a seamless -50% translate loop.
const marquee = [...POOL, ...POOL].map((c) => art(c.id));

// Hero result grid (6 cards, mirrors the design's order + per-tile gradients).
const heroGrid = [
  { id: "89631139", name: "Blue-Eyes White Dragon", grad: "linear-gradient(140deg,var(--c-trade),var(--c-accent))" },
  { id: "23995346", name: "Blue-Eyes Ultimate Dragon", grad: "linear-gradient(140deg,var(--c-trade),var(--c-accent))" },
  { id: "46986414", name: "Dark Magician", grad: "linear-gradient(140deg,var(--c-trade),var(--c-accent))" },
  { id: "38033121", name: "Dark Magician Girl", grad: "linear-gradient(140deg,var(--c-trade),var(--c-accent))" },
  { id: "14558127", name: "Ash Blossom & Joyous Spring", grad: "linear-gradient(140deg,var(--c-mutual),var(--c-trade))" },
  { id: "55144522", name: "Pot of Greed", grad: "linear-gradient(140deg,var(--c-accent),var(--c-trade))" },
];

// Feature-card mini illustrations (from previewSearch / previewDeck / previewColl).
const previewSearch = ["89631139", "46986414", "38033121", "14558127"].map((id) => ({ id, src: thumb(id) }));
const previewDeck = ["89631139", "74677422", "70781052", "23995346", "53129443"].map((id, i) => ({
  id,
  src: thumb(id),
  ml: i === 0 ? "0" : "-22px",
}));
const previewColl = [
  { id: "89631139", owned: true },
  { id: "23995346", owned: true },
  { id: "70781052", owned: false },
  { id: "74677422", owned: true },
  { id: "33396948", owned: false },
].map((c) => ({
  id: c.id,
  src: thumb(c.id),
  opacity: c.owned ? "1" : "0.32",
  filter: c.owned ? "none" : "grayscale(1)",
}));

// Broken card art fades out, leaving the gradient tile behind it. Runs only in
// the browser on a real <img> error — never at module/setup level (SSR-safe).
function onImgError(e) {
  if (e?.currentTarget) e.currentTarget.style.opacity = "0";
}
</script>

<template>
  <div class="landing">
    <!-- ===== Header / nav ===== -->
    <header class="lp-header">
      <div class="lp-header-inner">
        <router-link :to="`/${locale}/`" class="lp-brand" :aria-label="$t('landing.hero.productName')">
          <img src="/logo.png" alt="One for One" class="lp-badge" />
          <span class="lp-wordmark">{{ $t("landing.hero.productName") }}</span>
        </router-link>

        <nav class="lp-nav" aria-label="Primary">
          <router-link :to="`/${locale}/cards`" class="lp-nav-link">{{ $t("landing.nav.search") }}</router-link>
          <router-link :to="`/${locale}/decks`" class="lp-nav-link">{{ $t("landing.nav.decks") }}</router-link>
          <router-link :to="`/${locale}/library`" class="lp-nav-link">{{ $t("landing.nav.collection") }}</router-link>
          <router-link :to="`/${locale}/trade`" class="lp-nav-link">{{ $t("landing.nav.trade") }}</router-link>
        </nav>

        <div class="lp-header-cta">
          <template v-if="isAuthed">
            <router-link :to="`/${locale}/cards`" class="lp-btn lp-btn-accent lp-btn-sm">
              {{ $t("landing.hero.ctaGoToApp") }}
              <svg class="lp-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </router-link>
          </template>
          <template v-else>
            <button type="button" class="lp-login" @click="emit('requireAuth')">{{ $t("landing.nav.login") }}</button>
            <button type="button" class="lp-btn lp-btn-accent lp-btn-sm" @click="emit('requireAuth')">
              {{ $t("landing.hero.ctaGetStartedShort") }}
            </button>
          </template>
        </div>
      </div>
    </header>

    <!-- ===== Hero ===== -->
    <section class="lp-hero">
      <div class="lp-hero-glow" aria-hidden="true" />
      <div class="lp-hero-inner">
        <!-- Copy column -->
        <div class="lp-hero-copy">
          <span v-if="isAuthed" class="lp-eyebrow lp-eyebrow-authed">{{ $t("landing.hero.eyebrowAuthed") }}</span>
          <span v-else class="lp-eyebrow">
            <span class="lp-eyebrow-dot" />{{ $t("landing.hero.eyebrow") }}
          </span>

          <!-- Single H1 — design renders it across two lines with an accent span. -->
          <h1 class="lp-h1" v-html="$t('landing.hero.headline')" />

          <p class="lp-subhead">{{ $t("landing.hero.subheadline") }}</p>

          <div class="lp-cta-row">
            <!-- Primary CTA: anonymous opens the shared AuthDialog (App.vue),
                 logged-in routes straight into the app. -->
            <router-link v-if="isAuthed" :to="`/${locale}/cards`" class="lp-btn lp-btn-accent lp-btn-lg">
              {{ $t("landing.hero.ctaGoToApp") }}
              <svg class="lp-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </router-link>
            <button v-else type="button" class="lp-btn lp-btn-accent lp-btn-lg" @click="emit('requireAuth')">
              {{ $t("landing.hero.ctaGetStarted") }}
              <svg class="lp-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>

            <router-link :to="`/${locale}/cards`" class="lp-btn lp-btn-outline lp-btn-lg">
              <svg class="lp-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
              {{ $t("landing.hero.ctaBrowse") }}
            </router-link>
          </div>

          <ul class="lp-bullets">
            <li><span class="lp-bullet-dot" />{{ $t("landing.hero.bullets.noFees") }}</li>
            <li><span class="lp-bullet-dot" />{{ $t("landing.hero.bullets.noAuctions") }}</li>
            <li><span class="lp-bullet-dot" />{{ $t("landing.hero.bullets.directP2P") }}</li>
            <li><span class="lp-bullet-dot" />{{ $t("landing.hero.bullets.mutualMatches") }}</li>
          </ul>
        </div>

        <!-- Visual column: tilted app-window mockup + floating mutual-match card -->
        <div class="lp-hero-visual">
          <div class="lp-tilt">
            <div
              class="lp-window"
              role="img"
              :aria-label="$t('landing.features.search.body')"
            >
              <div class="lp-window-bar">
                <span class="lp-dots">
                  <span class="lp-dot" style="background:#ef6a7e" />
                  <span class="lp-dot" style="background:#f3c34e" />
                  <span class="lp-dot" style="background:#5ec98a" />
                </span>
                <span class="lp-url">
                  <svg class="lp-ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M7 11V7a5 5 0 0 1 10 0v4" /><rect x="5" y="11" width="14" height="9" rx="2" /></svg>
                  0nefor.one/{{ locale }}/cards
                </span>
              </div>
              <div class="lp-window-body">
                <div class="lp-search-field">
                  <svg class="lp-ico-sm" viewBox="0 0 24 24" fill="none" stroke="var(--c-accent)" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
                  <span class="lp-search-term">blue-eyes</span>
                  <span class="lp-caret" />
                  <span class="lp-results">6 results</span>
                </div>
                <div class="lp-chips">
                  <span class="lp-chip lp-chip-active">All</span>
                  <span class="lp-chip">Monster</span>
                  <span class="lp-chip">Spell</span>
                  <span class="lp-chip">LIGHT</span>
                  <span class="lp-chip">Ultra Rare</span>
                </div>
                <div class="lp-hero-grid">
                  <div v-for="card in heroGrid" :key="card.id" class="lp-hero-cell">
                    <div class="lp-thumb" :style="{ background: card.grad }">
                      <img :src="thumb(card.id)" :alt="card.name" loading="eager" @error="onImgError" />
                    </div>
                    <span class="lp-thumb-name">{{ card.name }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Floating mutual-match card -->
            <div class="lp-match-card">
              <div class="lp-match-head">
                <span class="lp-match-title">{{ $t("landing.tradeShowcase.heading") }}</span>
                <span class="lp-match-found">
                  <span class="lp-match-found-dot" />{{ $t("landing.tradeShowcase.labelMatch") }}
                </span>
              </div>
              <div class="lp-match-body">
                <div class="lp-match-side">
                  <span class="lp-match-label lp-match-label-give">{{ $t("landing.tradeShowcase.labelPile") }}</span>
                  <div class="lp-thumb lp-thumb-give">
                    <img :src="thumb('46986414')" alt="Dark Magician" @error="onImgError" />
                  </div>
                </div>
                <div class="lp-swap-circle">
                  <svg class="lp-ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 8h12l-3-3M17 16H5l3 3" /></svg>
                </div>
                <div class="lp-match-side">
                  <span class="lp-match-label lp-match-label-get">{{ $t("landing.tradeShowcase.labelWishlist") }}</span>
                  <div class="lp-thumb lp-thumb-get">
                    <img :src="thumb('89631139')" alt="Blue-Eyes White Dragon" @error="onImgError" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Card-art marquee strip (decorative) -->
      <div class="lp-marquee" :aria-label="$t('landing.marquee.ariaLabel')" aria-hidden="true">
        <div class="lp-marquee-track">
          <div v-for="(src, i) in marquee" :key="i" class="lp-marquee-cell">
            <img :src="src" alt="" loading="lazy" @error="onImgError" />
          </div>
        </div>
      </div>
    </section>

    <!-- ===== How it works ===== -->
    <section class="lp-section lp-how" aria-labelledby="lp-how-heading">
      <h2 id="lp-how-heading" class="lp-h2">{{ $t("landing.howItWorks.heading") }}</h2>
      <p class="lp-section-sub">{{ $t("landing.howItWorks.subheading") }}</p>
      <div class="lp-how-grid">
        <div v-for="(step, i) in ['01', '02', '03', '04']" :key="step" class="lp-step-card">
          <span class="lp-step-num" :class="`lp-step-num-${i}`">{{ step }}</span>
          <h3 class="lp-h3">{{ $t(`landing.howItWorks.steps.${step}.title`) }}</h3>
          <p class="lp-step-body">{{ $t(`landing.howItWorks.steps.${step}.body`) }}</p>
        </div>
      </div>
    </section>

    <!-- ===== Features ===== -->
    <section class="lp-section lp-features" aria-labelledby="lp-features-heading">
      <div class="lp-features-head">
        <h2 id="lp-features-heading" class="lp-h2">{{ $t("landing.features.heading") }}</h2>
        <p class="lp-section-sub">{{ $t("landing.features.subheading") }}</p>
      </div>

      <div class="lp-features-grid">
        <!-- Search -->
        <router-link :to="`/${locale}/cards`" class="lp-feature lp-feature-accent">
          <div class="lp-feature-illu lp-illu-row">
            <div v-for="c in previewSearch" :key="c.id" class="lp-thumb lp-illu-thumb">
              <img :src="c.src" :alt="$t('landing.features.search.title')" loading="lazy" @error="onImgError" />
            </div>
          </div>
          <div class="lp-feature-body">
            <span class="lp-feature-icon lp-icon-accent">
              <svg class="lp-ico-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.4-3.4" /></svg>
            </span>
            <h3 class="lp-h3 lp-feature-title">{{ $t("landing.features.search.title") }}</h3>
            <p class="lp-feature-text">{{ $t("landing.features.search.body") }}</p>
            <span class="lp-feature-cta lp-cta-accent">
              {{ $t("landing.features.search.cta") }}
              <svg class="lp-ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
          </div>
        </router-link>

        <!-- Decks -->
        <router-link :to="`/${locale}/decks`" class="lp-feature lp-feature-trade">
          <div class="lp-feature-illu lp-illu-stack">
            <div v-for="c in previewDeck" :key="c.id" class="lp-thumb lp-illu-deck" :style="{ marginLeft: c.ml }">
              <img :src="c.src" :alt="$t('landing.features.decks.title')" loading="lazy" @error="onImgError" />
            </div>
          </div>
          <div class="lp-feature-body">
            <span class="lp-feature-icon lp-icon-trade">
              <svg class="lp-ico-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 3 8l9 5 9-5-9-5Z" /><path d="m3 13 9 5 9-5" /></svg>
            </span>
            <h3 class="lp-h3 lp-feature-title">{{ $t("landing.features.decks.title") }}</h3>
            <p class="lp-feature-text">{{ $t("landing.features.decks.body") }}</p>
            <span class="lp-feature-cta lp-cta-trade">
              {{ $t("landing.features.decks.cta") }}
              <svg class="lp-ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
          </div>
        </router-link>

        <!-- Collection -->
        <router-link :to="`/${locale}/library`" class="lp-feature lp-feature-mutual">
          <div class="lp-feature-illu lp-illu-coll">
            <div class="lp-coll-meter">
              <span class="lp-coll-set">Legend of Blue Eyes</span>
              <span class="lp-coll-pct">72%</span>
            </div>
            <div class="lp-coll-bar"><span class="lp-coll-fill" style="width:72%" /></div>
            <div class="lp-illu-row lp-coll-row">
              <div v-for="c in previewColl" :key="c.id" class="lp-thumb lp-illu-coll-thumb" :style="{ filter: c.filter }">
                <img :src="c.src" :alt="$t('landing.features.collection.title')" loading="lazy" :style="{ opacity: c.opacity }" @error="onImgError" />
              </div>
            </div>
          </div>
          <div class="lp-feature-body">
            <span class="lp-feature-icon lp-icon-mutual">
              <svg class="lp-ico-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h7v7H3zM14 5h7v4h-7zM14 13h7v6h-7zM3 16h7v3H3z" /><path d="m15.5 6.5 1.3 1.3 2.7-2.7" /></svg>
            </span>
            <h3 class="lp-h3 lp-feature-title">{{ $t("landing.features.collection.title") }}</h3>
            <p class="lp-feature-text">{{ $t("landing.features.collection.body") }}</p>
            <span class="lp-feature-cta lp-cta-mutual">
              {{ $t("landing.features.collection.cta") }}
              <svg class="lp-ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
          </div>
        </router-link>

        <!-- Trade (emphasized / CORE) -->
        <router-link :to="`/${locale}/trade`" class="lp-feature lp-feature-core">
          <span class="lp-core-badge">{{ $t("landing.features.coreBadge") }}</span>
          <div class="lp-feature-illu lp-illu-pair">
            <div class="lp-thumb lp-illu-pair-card">
              <img :src="thumb('74677422')" alt="Red-Eyes Black Dragon" loading="lazy" @error="onImgError" />
            </div>
            <div class="lp-swap-circle">
              <svg class="lp-ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 8h12l-3-3M17 16H5l3 3" /></svg>
            </div>
            <div class="lp-thumb lp-illu-pair-card lp-illu-pair-get">
              <img :src="thumb('89631139')" alt="Blue-Eyes White Dragon" loading="lazy" @error="onImgError" />
            </div>
          </div>
          <div class="lp-feature-body">
            <span class="lp-feature-icon lp-icon-core">
              <svg class="lp-ico-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7h11l-3-3M17 17H6l3 3" /></svg>
            </span>
            <h3 class="lp-h3 lp-feature-title">{{ $t("landing.features.trade.title") }}</h3>
            <p class="lp-feature-text">{{ $t("landing.features.trade.body") }}</p>
            <span class="lp-feature-cta lp-cta-accent">
              {{ $t("landing.features.trade.cta") }}
              <svg class="lp-ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
          </div>
        </router-link>
      </div>
    </section>

    <!-- ===== Trade showcase ===== -->
    <section class="lp-section lp-showcase" aria-labelledby="lp-trade-heading">
      <div class="lp-showcase-panel">
        <div class="lp-showcase-copy">
          <span class="lp-eyebrow lp-eyebrow-trade">{{ $t("landing.tradeShowcase.eyebrow") }}</span>
          <h2 id="lp-trade-heading" class="lp-h2 lp-showcase-h2">{{ $t("landing.tradeShowcase.heading") }}</h2>
          <p class="lp-showcase-body">{{ $t("landing.tradeShowcase.body") }}</p>
          <router-link :to="`/${locale}/trade`" class="lp-btn lp-btn-trade">
            {{ $t("landing.tradeShowcase.cta") }}
            <svg class="lp-ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </router-link>
        </div>
        <div class="lp-showcase-visual">
          <div class="lp-showcase-pair">
            <div class="lp-showcase-side">
              <span class="lp-match-label lp-match-label-give">{{ $t("landing.tradeShowcase.labelPile") }}</span>
              <div class="lp-thumb lp-showcase-card lp-thumb-give">
                <img :src="thumb('46986414')" alt="Dark Magician" loading="lazy" @error="onImgError" />
              </div>
              <span class="lp-showcase-name">Dark Magician</span>
            </div>
            <div class="lp-showcase-match">
              <div class="lp-swap-circle lp-swap-ring">
                <svg class="lp-ico-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 8h12l-3-3M17 16H5l3 3" /></svg>
              </div>
              <span class="lp-match-tag">{{ $t("landing.tradeShowcase.labelMatch") }}</span>
            </div>
            <div class="lp-showcase-side">
              <span class="lp-match-label lp-match-label-get">{{ $t("landing.tradeShowcase.labelWishlist") }}</span>
              <div class="lp-thumb lp-showcase-card lp-thumb-get">
                <img :src="thumb('89631139')" alt="Blue-Eyes White Dragon" loading="lazy" @error="onImgError" />
              </div>
              <span class="lp-showcase-name">Blue-Eyes W. Dragon</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== Footer ===== -->
    <footer class="lp-footer">
      <div class="lp-footer-inner">
        <div class="lp-footer-brand">
          <div class="lp-footer-brand-row">
            <img src="/logo.png" alt="One for One" class="lp-badge lp-badge-sm" />
            <span class="lp-wordmark">{{ $t("landing.hero.productName") }}</span>
          </div>
          <p class="lp-footer-blurb">{{ $t("landing.footer.blurb") }}</p>
        </div>

        <nav class="lp-footer-col" :aria-label="$t('landing.footer.colProduct')">
          <span class="lp-footer-col-title">{{ $t("landing.footer.colProduct") }}</span>
          <router-link :to="`/${locale}/cards`" class="lp-footer-link">{{ $t("landing.footer.search") }}</router-link>
          <router-link :to="`/${locale}/decks`" class="lp-footer-link">{{ $t("landing.footer.decks") }}</router-link>
          <router-link :to="`/${locale}/library`" class="lp-footer-link">{{ $t("landing.footer.collection") }}</router-link>
          <router-link :to="`/${locale}/trade`" class="lp-footer-link">{{ $t("landing.footer.trade") }}</router-link>
        </nav>

        <nav class="lp-footer-col" :aria-label="$t('landing.footer.colMore')">
          <span class="lp-footer-col-title">{{ $t("landing.footer.colMore") }}</span>
          <router-link :to="`/${locale}/privacy`" class="lp-footer-link">{{ $t("landing.footer.about") }}</router-link>
          <router-link :to="`/${locale}/privacy`" class="lp-footer-link">{{ $t("landing.footer.privacy") }}</router-link>
          <a href="mailto:hello@0nefor.one" class="lp-footer-link">{{ $t("landing.footer.contact") }}</a>
        </nav>
      </div>
      <div class="lp-footer-sub">
        <div class="lp-footer-sub-inner">
          <span class="lp-copyright">{{ $t("landing.footer.copyright") }}</span>
          <router-link :to="`/${locale}/privacy`" class="lp-footer-link">{{ $t("landing.footer.privacyPolicy") }}</router-link>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* ── Full-bleed: cancel App.vue <main>'s px-5 md:px-16 / pt padding so the
   landing reads as a standalone marketing surface (header, marquee, footer
   all run edge-to-edge). ── */
.landing {
  font-family: "Manrope", system-ui, sans-serif;
  background: var(--c-bg);
  color: var(--c-text);
  margin: -1.25rem -1.25rem 0; /* cancel main's px-5 + pt-5 */
  overflow-x: hidden;
}
@media (min-width: 768px) {
  .landing {
    margin: -2rem -4rem 0; /* cancel main's md:px-16 + md:pt-8 */
  }
}

.landing :where(h1, h2, h3) {
  font-family: "Space Grotesk", "Manrope", system-ui, sans-serif;
}

/* ── Shared buttons ── */
.lp-btn {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  border: none;
  cursor: pointer;
  text-decoration: none;
  font-family: inherit;
  font-weight: 700;
  transition: filter 0.15s ease, transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;
}
.lp-btn-sm { padding: 10px 18px; border-radius: 9px; font-size: 14.5px; }
.lp-btn-lg { padding: 14px 26px; border-radius: 11px; font-size: 16px; }
.lp-btn-accent { background: var(--c-accent); color: var(--c-on-accent); box-shadow: var(--c-shadow-card, 0 1px 2px rgba(28, 8, 82, 0.05)); }
.lp-btn-accent:hover { filter: brightness(1.07); transform: translateY(-1px); }
.lp-btn-outline { background: transparent; color: var(--c-text); border: 1px solid var(--c-border); padding: 13px 24px; }
.lp-btn-outline:hover { background: var(--c-surface); border-color: var(--c-accent); }
.lp-btn-trade { background: var(--c-trade); color: #fff; padding: 13px 22px; border-radius: 11px; font-size: 15px; margin-top: 26px; }
.lp-btn-trade:hover { filter: brightness(1.07); }

.lp-ico { width: 17px; height: 17px; }
.lp-ico-md { width: 22px; height: 22px; }
.lp-ico-sm { width: 15px; height: 15px; flex: none; }

/* ── Header ── */
.lp-header {
  position: sticky;
  top: 0;
  z-index: 40;
  background: color-mix(in srgb, var(--c-bg) 82%, transparent);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid color-mix(in srgb, var(--c-border) 55%, transparent);
}
/* Landing-specific offset so the header doesn't hug the very top */
.landing .lp-header {
  top: 12px;
}
.lp-header-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 clamp(18px, 4vw, 40px);
  height: 68px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.lp-brand { display: flex; align-items: center; gap: 11px; text-decoration: none; color: var(--c-text); }
.lp-badge {
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  overflow: hidden;
  background: transparent;
  padding: 0;
}
.lp-badge img { width: 100%; height: 100%; object-fit: contain; display: block; }
.lp-badge-sm { width: 30px; height: 30px; border-radius: 8px; }
.lp-wordmark { font-family: "Space Grotesk", sans-serif; font-weight: 700; font-size: 18px; letter-spacing: -0.4px; }

/* Center nav + "Log in" are hidden < 760px (the design's JS breakpoint), driven
   from scoped CSS — NOT `hidden sm:flex` (Tailwind v4 base .hidden defeats it). */
.lp-nav { display: none; align-items: center; gap: 6px; }
.lp-nav-link {
  padding: 8px 14px;
  border-radius: 8px;
  text-decoration: none;
  color: var(--c-muted);
  font-weight: 600;
  font-size: 14.5px;
  transition: color 0.15s ease, background 0.15s ease;
}
.lp-nav-link:hover { color: var(--c-text); background: var(--c-surface); }

.lp-header-cta { display: flex; align-items: center; gap: 10px; }
.lp-login {
  display: none;
  align-items: center;
  padding: 10px 14px;
  border-radius: 9px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--c-text);
  font-family: inherit;
  font-weight: 600;
  font-size: 14.5px;
  transition: background 0.15s ease;
}
.lp-login:hover { background: var(--c-surface); }

@media (min-width: 760px) {
  .lp-nav { display: flex; }
  .lp-login { display: inline-flex; }
}

/* ── Hero ── */
.lp-hero { position: relative; overflow: hidden; }
.lp-hero-glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(720px 460px at 82% -6%, color-mix(in srgb, var(--c-trade) 26%, transparent), transparent 70%),
    radial-gradient(560px 360px at 4% 6%, color-mix(in srgb, var(--c-accent) 15%, transparent), transparent 72%);
}
.lp-hero-inner {
  position: relative;
  max-width: 1200px;
  margin: 0 auto;
  padding: clamp(38px, 6vw, 76px) clamp(18px, 4vw, 40px) clamp(40px, 6vw, 72px);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: clamp(32px, 4vw, 56px);
}
.lp-hero-copy { flex: 1 1 380px; min-width: 280px; max-width: 560px; }

.lp-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 13px;
  border-radius: 999px;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  color: var(--c-accent);
  font-weight: 700;
  font-size: 12.5px;
  letter-spacing: 0.3px;
  text-transform: uppercase;
}
.lp-eyebrow-authed { color: var(--c-mutual); }
.lp-eyebrow-trade { background: var(--c-bg); color: var(--c-trade); }
.lp-eyebrow-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--c-mutual); }

.lp-h1 {
  font-weight: 700;
  letter-spacing: -1.6px;
  line-height: 1.03;
  font-size: clamp(38px, 6vw, 62px);
  margin: 18px 0 0;
  text-wrap: balance;
}
.lp-h1 :deep(span) { color: var(--c-accent); }

.lp-subhead {
  margin: 20px 0 0;
  font-size: clamp(16px, 1.6vw, 19px);
  line-height: 1.55;
  color: var(--c-muted);
  max-width: 520px;
  text-wrap: pretty;
}

.lp-cta-row { display: flex; flex-wrap: wrap; gap: 13px; margin-top: 30px; }
.lp-cta-row .lp-btn-accent { box-shadow: var(--c-shadow, 0 18px 44px -16px rgba(104, 48, 168, 0.28)); }

.lp-bullets { list-style: none; display: flex; flex-wrap: wrap; gap: 8px 10px; margin: 28px 0 0; padding: 0; }
.lp-bullets li { display: inline-flex; align-items: center; gap: 7px; font-size: 13.5px; font-weight: 600; color: var(--c-muted); }
.lp-bullet-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--c-mutual); }

/* Hero visual + 3D tilt (flattened < 760px so it can't clip/overflow on mobile) */
.lp-hero-visual { flex: 1 1 420px; min-width: 280px; display: flex; justify-content: center; perspective: 1700px; }
.lp-tilt { position: relative; width: 100%; max-width: 560px; transform-style: preserve-3d; }
@media (min-width: 760px) {
  .lp-tilt { transform: rotateY(-12deg) rotateX(5deg); }
}

.lp-window {
  border-radius: 18px;
  background: var(--c-bg);
  border: 1px solid var(--c-border);
  box-shadow: var(--c-shadow, 0 18px 44px -16px rgba(104, 48, 168, 0.28));
  overflow: hidden;
}
.lp-window-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--c-border) 60%, transparent);
  background: var(--c-surface);
}
.lp-dots { display: flex; gap: 6px; }
.lp-dot { width: 11px; height: 11px; border-radius: 50%; }
.lp-url {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 26px;
  padding: 0 12px;
  border-radius: 7px;
  background: var(--c-bg);
  border: 1px solid var(--c-border);
  color: var(--c-muted);
  font-size: 12.5px;
  font-weight: 600;
}
.lp-window-body { padding: 16px; }
.lp-search-field {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 40px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid var(--c-accent);
  background: var(--c-input-bg);
  box-shadow: 0 0 0 3px var(--c-ring);
}
.lp-search-term { color: var(--c-text); font-weight: 600; font-size: 14px; }
.lp-caret { width: 1.5px; height: 17px; background: var(--c-accent); display: inline-block; }
.lp-results { margin-left: auto; font-size: 12px; font-weight: 700; color: var(--c-muted); }

.lp-chips { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; }
.lp-chip {
  padding: 5px 11px;
  border-radius: 999px;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  color: var(--c-muted);
  font-size: 11.5px;
  font-weight: 700;
}
.lp-chip-active { background: var(--c-accent); color: var(--c-on-accent); border-color: transparent; }

.lp-hero-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 11px; margin-top: 14px; }
.lp-hero-cell { display: flex; flex-direction: column; gap: 6px; }
.lp-thumb {
  aspect-ratio: 0.686;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--c-border);
  background: linear-gradient(140deg, var(--c-trade), var(--c-accent));
}
.lp-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.lp-thumb-name {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--c-text);
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Floating mutual-match card */
.lp-match-card {
  position: absolute;
  right: -6px;
  bottom: -22px;
  width: min(258px, 72%);
  background: var(--c-surface);
  border: 1px solid var(--c-mutual);
  border-radius: 14px;
  padding: 13px 14px;
  box-shadow: var(--c-shadow, 0 18px 44px -16px rgba(104, 48, 168, 0.28));
  transform: translateZ(60px);
}
.lp-match-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.lp-match-title { font-family: "Space Grotesk", sans-serif; font-weight: 700; font-size: 12.5px; color: var(--c-text); }
.lp-match-found {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--c-mutual) 16%, transparent);
  color: var(--c-mutual);
  font-weight: 700;
  font-size: 10.5px;
  animation: ofo-ring 2.6s ease-out infinite;
}
.lp-match-found-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--c-mutual); animation: ofo-pulse 2s ease-in-out infinite; }
.lp-match-body { display: flex; align-items: center; gap: 9px; }
.lp-match-side { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.lp-match-label { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
.lp-match-label-give { color: var(--c-muted); }
.lp-match-label-get { color: var(--c-accent); text-align: right; }
.lp-thumb-give { aspect-ratio: 0.686; border-radius: 7px; background: linear-gradient(140deg, var(--c-trade), var(--c-accent)); border: none; }
.lp-thumb-get { aspect-ratio: 0.686; border-radius: 7px; background: linear-gradient(140deg, var(--c-accent), var(--c-mutual)); border: none; }
.lp-swap-circle {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--c-bg);
  border: 1px solid var(--c-border);
  color: var(--c-mutual);
  flex: none;
}

/* Marquee */
.lp-marquee {
  position: relative;
  margin-top: 18px;
  padding: 14px 0;
  border-top: 1px solid color-mix(in srgb, var(--c-border) 45%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--c-border) 45%, transparent);
  background: var(--c-surface);
  overflow: hidden;
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
  mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
}
.lp-marquee-track { display: flex; gap: 14px; width: max-content; animation: ofo-marquee 38s linear infinite; }
.lp-marquee-cell {
  width: 108px;
  aspect-ratio: 1.45;
  border-radius: 8px;
  overflow: hidden;
  background: var(--c-input-bg);
  border: 1px solid var(--c-border);
  flex: none;
}
.lp-marquee-cell img { width: 100%; height: 100%; object-fit: cover; object-position: center 26%; display: block; }

/* ── Section scaffolding ── */
.lp-section { max-width: 1200px; margin: 0 auto; }
.lp-how { padding: clamp(48px, 7vw, 84px) clamp(18px, 4vw, 40px) clamp(20px, 3vw, 30px); }
.lp-features { padding: clamp(40px, 6vw, 72px) clamp(18px, 4vw, 40px) clamp(20px, 3vw, 28px); }
.lp-showcase { padding: clamp(40px, 6vw, 72px) clamp(18px, 4vw, 40px) clamp(56px, 8vw, 96px); }

.lp-h2 { font-weight: 700; letter-spacing: -1px; font-size: clamp(26px, 3.6vw, 38px); line-height: 1.1; margin: 0; }
.lp-h3 { font-weight: 700; font-size: 17.5px; margin: 0; letter-spacing: -0.3px; }
.lp-section-sub { margin: 12px 0 clamp(28px, 4vw, 40px); font-size: 16.5px; line-height: 1.55; color: var(--c-muted); max-width: 560px; }

/* How it works */
.lp-how-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(232px, 1fr)); gap: clamp(14px, 1.6vw, 20px); }
.lp-step-card { display: flex; flex-direction: column; gap: 12px; padding: 24px; border-radius: 16px; background: var(--c-surface); border: 1px solid var(--c-border); }
.lp-step-num { font-family: "Space Grotesk", sans-serif; font-weight: 700; font-size: 14px; }
.lp-step-num-0 { color: var(--c-accent); }
.lp-step-num-1 { color: var(--c-trade); }
.lp-step-num-2 { color: var(--c-mutual); }
.lp-step-num-3 { color: var(--c-accent); }
.lp-step-body { margin: 0; font-size: 14px; line-height: 1.5; color: var(--c-muted); }

/* Features */
.lp-features-head { max-width: 620px; margin-bottom: clamp(26px, 4vw, 42px); }
.lp-features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(284px, 1fr)); gap: clamp(14px, 1.6vw, 20px); }
.lp-feature {
  position: relative;
  display: flex;
  flex-direction: column;
  border-radius: 18px;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  text-decoration: none;
  color: var(--c-text);
  box-shadow: var(--c-shadow-card, 0 1px 2px rgba(28, 8, 82, 0.05));
  overflow: hidden;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}
.lp-feature:hover { transform: translateY(-4px); box-shadow: var(--c-shadow, 0 18px 44px -16px rgba(104, 48, 168, 0.28)); }
.lp-feature-accent:hover { border-color: var(--c-accent); }
.lp-feature-trade:hover { border-color: var(--c-trade); }
.lp-feature-mutual:hover { border-color: var(--c-mutual); }
.lp-feature-core {
  background: linear-gradient(165deg, color-mix(in srgb, var(--c-accent) 13%, var(--c-surface)), var(--c-surface));
  border-color: var(--c-accent);
}

.lp-feature-illu { padding: 14px 16px 0; }
.lp-illu-row { display: flex; gap: 8px; }
.lp-illu-thumb { flex: 1; aspect-ratio: 0.686; border-radius: 7px; }
.lp-illu-stack { display: flex; }
.lp-illu-deck { width: 30%; aspect-ratio: 0.686; border-radius: 7px; box-shadow: var(--c-shadow-card, 0 1px 2px rgba(28, 8, 82, 0.05)); }
.lp-illu-coll { padding: 16px 18px 4px; }
.lp-coll-meter { display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 700; color: var(--c-muted); margin-bottom: 7px; }
.lp-coll-pct { color: var(--c-mutual); }
.lp-coll-bar { height: 8px; border-radius: 999px; background: var(--c-input-bg); border: 1px solid var(--c-border); overflow: hidden; }
.lp-coll-fill { display: block; height: 100%; background: linear-gradient(90deg, var(--c-mutual), var(--c-trade)); }
.lp-coll-row { margin-top: 11px; }
.lp-illu-coll-thumb { flex: 1; aspect-ratio: 0.686; border-radius: 6px; background: var(--c-input-bg); position: relative; }
.lp-illu-pair { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 18px 18px 0; }
.lp-illu-pair-card { width: 30%; aspect-ratio: 0.686; border-radius: 8px; box-shadow: var(--c-shadow-card, 0 1px 2px rgba(28, 8, 82, 0.05)); }
.lp-illu-pair-get { background: linear-gradient(140deg, var(--c-accent), var(--c-mutual)); border-color: var(--c-accent); box-shadow: 0 8px 20px -10px var(--c-ring); }

.lp-feature-body { padding: 18px 22px 24px; display: flex; flex-direction: column; gap: 11px; }
.lp-feature-icon { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; }
.lp-icon-accent { background: color-mix(in srgb, var(--c-accent) 14%, transparent); color: var(--c-accent); }
.lp-icon-trade { background: color-mix(in srgb, var(--c-trade) 16%, transparent); color: var(--c-trade); }
.lp-icon-mutual { background: color-mix(in srgb, var(--c-mutual) 16%, transparent); color: var(--c-mutual); }
.lp-icon-core { background: var(--c-accent); color: var(--c-on-accent); }
.lp-feature-title { font-size: 19px; }
.lp-feature-text { margin: 0; font-size: 14.5px; line-height: 1.5; color: var(--c-muted); }
.lp-feature-cta { display: inline-flex; align-items: center; gap: 7px; font-weight: 700; font-size: 14px; }
.lp-cta-accent { color: var(--c-accent); }
.lp-cta-trade { color: var(--c-trade); }
.lp-cta-mutual { color: var(--c-mutual); }

.lp-core-badge {
  position: absolute;
  top: 16px;
  right: 16px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--c-accent);
  color: var(--c-on-accent);
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  z-index: 2;
}

/* Trade showcase */
.lp-showcase-panel {
  border-radius: 24px;
  border: 1px solid var(--c-border);
  background: var(--c-surface);
  box-shadow: var(--c-shadow-card, 0 1px 2px rgba(28, 8, 82, 0.05));
  overflow: hidden;
  display: flex;
  flex-wrap: wrap;
}
.lp-showcase-copy { flex: 1 1 320px; min-width: 280px; padding: clamp(28px, 4vw, 48px); }
.lp-showcase-h2 { margin: 16px 0 0; }
.lp-showcase-body { margin: 14px 0 0; font-size: 16px; line-height: 1.55; color: var(--c-muted); max-width: 440px; }
.lp-showcase-visual {
  flex: 1 1 320px;
  min-width: 280px;
  padding: clamp(24px, 3vw, 40px);
  background: linear-gradient(160deg, color-mix(in srgb, var(--c-trade) 12%, var(--c-surface)), var(--c-surface));
  display: flex;
  align-items: center;
  justify-content: center;
  border-left: 1px solid color-mix(in srgb, var(--c-border) 50%, transparent);
}
.lp-showcase-pair { display: flex; align-items: center; gap: clamp(10px, 2vw, 22px); }
.lp-showcase-side { display: flex; flex-direction: column; align-items: center; gap: 9px; }
.lp-showcase-card { width: clamp(96px, 17vw, 128px); aspect-ratio: 0.686; border-radius: 11px; box-shadow: var(--c-shadow, 0 18px 44px -16px rgba(104, 48, 168, 0.28)); }
.lp-showcase-side .lp-match-label { text-align: center; }
.lp-showcase-name { font-size: 12px; font-weight: 700; color: var(--c-text); }
.lp-showcase-match { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.lp-swap-ring { width: 46px; height: 46px; border-color: var(--c-mutual); animation: ofo-ring 2.8s ease-out infinite; }
.lp-match-tag { font-size: 10.5px; font-weight: 700; color: var(--c-mutual); }

/* ── Footer ── */
.lp-footer { border-top: 1px solid color-mix(in srgb, var(--c-border) 55%, transparent); background: var(--c-surface); }
.lp-footer-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: clamp(36px, 5vw, 56px) clamp(18px, 4vw, 40px);
  display: flex;
  flex-wrap: wrap;
  gap: 36px 56px;
  justify-content: space-between;
}
.lp-footer-brand { max-width: 300px; }
.lp-footer-brand-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.lp-footer-blurb { margin: 0; font-size: 14px; line-height: 1.55; color: var(--c-muted); }
.lp-footer-col { display: flex; flex-direction: column; gap: 11px; }
.lp-footer-col-title { font-weight: 700; font-size: 13px; letter-spacing: 0.4px; text-transform: uppercase; color: var(--c-text); margin-bottom: 2px; }
.lp-footer-link { font-size: 14px; color: var(--c-muted); text-decoration: none; font-weight: 600; transition: color 0.15s ease; }
.lp-footer-link:hover { color: var(--c-accent); }
.lp-footer-sub { border-top: 1px solid color-mix(in srgb, var(--c-border) 45%, transparent); }
.lp-footer-sub-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 18px clamp(18px, 4vw, 40px);
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}
.lp-copyright { font-size: 13px; color: var(--c-muted); }

/* ── Keyframes (scoped is fine — referenced only here) ── */
@keyframes ofo-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.12); opacity: 0.8; }
}
@keyframes ofo-ring {
  0% { box-shadow: 0 0 0 0 var(--c-ring); }
  70% { box-shadow: 0 0 0 13px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}
@keyframes ofo-marquee {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}

@media (prefers-reduced-motion: reduce) {
  .lp-marquee-track,
  .lp-match-found,
  .lp-match-found-dot,
  .lp-swap-ring { animation: none; }
  .lp-feature,
  .lp-btn { transition: none; }
}
</style>
