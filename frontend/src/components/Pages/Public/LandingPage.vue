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
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { useTheme } from "vuetify";
import { BUILT_WITH_TOOLS as builtWithTools } from "@/lib/builtWithTools";
import { communityPricing, formatPrice } from "@/lib/communityPricing";
import {
  MIN_TO_SHOW,
  decorateRecent,
  fetchRecentTraders,
  fetchTopTradepiles,
  traderInitial,
} from "@/lib/people";

const props = defineProps({
  // Session | null, forwarded by App.vue's RouterView. Drives the auth-aware CTAs.
  login: { type: [Object, null], default: null },
});

const emit = defineEmits(["requireAuth"]);

const route = useRoute();
// Locale-aware path prefix, mirroring App.vue:291 (the privacy footer link).
const locale = computed(() => route.params.locale || "en");

const isAuthed = computed(() => !!props.login);

// Theme tracking for brand-image logos (TCGplayer) in the footer strip.
const theme = useTheme();
const isDark = computed(() => theme.global.name.value !== "neonDuskLight");

// Community Discord invite (mirrors SideNav.vue's discordUrl).
const DISCORD_URL = "https://discord.gg/MeaQcR29Fa";

// Direct donation link (Ko-fi), mirroring BuiltWithPage.vue's KOFI_URL/KOFI_PATH.
const KOFI_URL = "https://ko-fi.com/T5S0233R1W";
const KOFI_PATH = "M11.351 2.715c-2.7 0-4.986.025-6.83.26C2.078 3.285 0 5.154 0 8.61c0 3.506.182 6.13 1.585 8.493 1.584 2.701 4.233 4.182 7.662 4.182h.83c4.209 0 6.494-2.234 7.637-4a9.5 9.5 0 0 0 1.091-2.338C21.792 14.688 24 12.22 24 9.208v-.415c0-3.247-2.13-5.507-5.792-5.87-1.558-.156-2.65-.208-6.857-.208m0 1.947c4.208 0 5.09.052 6.571.182 2.624.311 4.13 1.584 4.13 4v.39c0 2.156-1.792 3.844-3.87 3.844h-.935l-.156.649c-.208 1.013-.597 1.818-1.039 2.546-.909 1.428-2.545 3.064-5.922 3.064h-.805c-2.571 0-4.831-.883-6.078-3.195-1.09-2-1.298-4.155-1.298-7.506 0-2.181.857-3.402 3.012-3.714 1.533-.233 3.559-.26 6.39-.26m6.547 2.287c-.416 0-.65.234-.65.546v2.935c0 .311.234.545.65.545 1.324 0 2.051-.754 2.051-2s-.727-2.026-2.052-2.026m-10.39.182c-1.818 0-3.013 1.48-3.013 3.142 0 1.533.858 2.857 1.949 3.897.727.701 1.87 1.429 2.649 1.896a1.47 1.47 0 0 0 1.507 0c.78-.467 1.922-1.195 2.623-1.896 1.117-1.039 1.974-2.364 1.974-3.897 0-1.662-1.247-3.142-3.039-3.142-1.065 0-1.792.545-2.338 1.298-.493-.753-1.246-1.298-2.312-1.298";

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

// Feature-card mini illustrations.
const previewSearch = ["89631139", "46986414", "38033121", "14558127"].map((id) => ({ id, src: thumb(id) }));
const previewDeck = ["89631139", "74677422", "70781052", "23995346", "53129443"].map((id, i) => ({
  id,
  src: thumb(id),
  ml: i === 0 ? "0" : "-22px",
}));
// The library holds two piles and nothing else: cards you will trade away,
// and cards you are hunting. Drawn as two labelled stacks in the same amethyst
// and pink the rest of the page uses for giving and wanting.
const pileStack = (ids) => ids.map((id, i) => ({ id, src: thumb(id), ml: i === 0 ? "0" : "-24px" }));
const previewPile = pileStack(["89631139", "23995346", "70781052"]);
const previewWish = pileStack(["74677422", "33396948", "14558127"]);

// Broken card art fades out, leaving the gradient tile behind it. Runs only in
// the browser on a real <img> error — never at module/setup level (SSR-safe).
function onImgError(e) {
  if (e?.currentTarget) e.currentTarget.style.opacity = "0";
}

// ── People section: who joined lately, and who has the deepest pile. ────────
//
// Fetched in onMounted rather than at setup, because this page is SSG-
// pre-rendered: at build time there is no browser, and a snapshot of "recent"
// baked into the HTML would be stale the moment somebody signed up. Empty
// arrays are what the pre-rendered HTML ships with, and the section is hidden
// until they fill — so the page never flashes an empty shell.
const recentTraders = ref([]);
const topPiles = ref([]);

// Both, or neither. Three names and one pile reads as an empty room; showing
// nothing at all is the more honest version of the same fact.
const showPeople = computed(
  () => recentTraders.value.length >= MIN_TO_SHOW && topPiles.value.length >= MIN_TO_SHOW
);

// Join date, place and initial worked out once per row rather than three times
// per render from inside the template. Shared with the app home's version of
// the same list.
const recentPeople = computed(() => decorateRecent(recentTraders.value));

onMounted(async () => {
  const [recent, piles] = await Promise.all([fetchRecentTraders(3), fetchTopTradepiles(3)]);
  recentTraders.value = recent;
  topPiles.value = piles;
});

// ── Community plan: what a shop or server owner pays. ───────────────────────
//
// The authoritative currency comes from the community's own country at checkout
// (communityPricing). Here there is neither a community nor a session, so the
// page locale is the only signal there is. It is a guess, and a safe one: the
// yearly figure is the same round number in every currency except GBP, and GBP
// is the cheaper one, so a British reader is never quoted less than they pay.
//
// Read through communityPricing rather than written out, so the landing page
// cannot quote a price the checkout has since moved away from.
const PRICING_COUNTRY = { fr: "FR", de: "DE", it: "IT" }; // en falls through to USD
const planPrice = computed(() => communityPricing(null, PRICING_COUNTRY[locale.value] ?? null));
const planYear = computed(() => formatPrice(planPrice.value.year.amount, planPrice.value.currency, locale.value));
const planMonth = computed(() => formatPrice(planPrice.value.month.amount, planPrice.value.currency, locale.value));

// ── Scroll reveal ──────────────────────────────────────────────────────────
//
// One motion idiom for the whole page: a block fades up as it enters. Wired in
// onMounted rather than at setup because this page is SSG-pre-rendered and
// IntersectionObserver does not exist at build time.
//
// The hidden state is applied by JS, never by the stylesheet, so the
// pre-rendered HTML ships fully visible: a reader with JS disabled — or one
// whose bundle failed — gets the whole page rather than a blank column of
// opacity-0 sections. Readers who asked for reduced motion are left alone.
function setupReveal() {
  if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const nodes = Array.from(document.querySelectorAll(".landing [data-reveal]"));
  if (!nodes.length) return;
  nodes.forEach((n) => n.classList.add("lp-reveal"));

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("lp-in");
        io.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.06 }
  );
  nodes.forEach((n) => io.observe(n));
}

onMounted(setupReveal);
</script>

<template>
  <div class="landing">
    <!-- ===== Header: a floating pill over the hero, not a bar across it ===== -->
    <header class="lp-header">
      <div class="lp-header-bar">
        <router-link :to="`/${locale}/`" class="lp-brand" :aria-label="$t('landing.hero.productName')">
          <img src="/logo.png" alt="" class="lp-badge" />
          <span class="lp-wordmark">{{ $t("landing.hero.productName") }}</span>
        </router-link>

        <!-- Only the destinations a signed-out reader can actually reach. Decks,
             Collection and Trade all need a session, so from here they were four
             links to the same login prompt. Same guest set the side rail shows. -->
        <nav class="lp-nav" aria-label="Primary">
          <router-link :to="`/${locale}/cards`" class="lp-nav-link">{{ $t("landing.nav.search") }}</router-link>
          <router-link :to="`/${locale}/dashboard`" class="lp-nav-link">{{ $t("nav.home") }}</router-link>
          <router-link :to="`/${locale}/trade/announces`" class="lp-nav-link">{{ $t("tradeCenter.announces") }}</router-link>
          <router-link :to="{ name: 'community', params: { locale } }" class="lp-nav-link">{{ $t("community.home") }}</router-link>
        </nav>

        <div class="lp-header-cta">
          <router-link v-if="isAuthed" :to="`/${locale}/cards`" class="lp-btn lp-btn-trade lp-btn-sm">
            {{ $t("landing.hero.ctaGoToApp") }}
            <span class="lp-btn-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
          </router-link>
          <template v-else>
            <button type="button" class="lp-login" @click="emit('requireAuth')">{{ $t("landing.nav.login") }}</button>
            <button type="button" class="lp-btn lp-btn-trade lp-btn-sm" @click="emit('requireAuth')">
              {{ $t("landing.hero.ctaGetStartedShort") }}
              <span class="lp-btn-badge" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </span>
            </button>
          </template>
        </div>
      </div>
    </header>

    <!-- ===== Hero ===== -->
    <section class="lp-hero">
      <div class="lp-hero-glow" aria-hidden="true" />

      <div class="lp-shell lp-hero-copy">
        <span v-if="isAuthed" class="lp-eyebrow">{{ $t("landing.hero.eyebrowAuthed") }}</span>
        <span v-else class="lp-eyebrow">
          <span class="lp-eyebrow-dot" />{{ $t("landing.hero.eyebrow") }}
        </span>

        <!-- Single H1 — the copy carries its own line break with an accent span. -->
        <h1 class="lp-h1" v-html="$t('landing.hero.headline')" />

        <p class="lp-lede">{{ $t("landing.hero.subheadline") }}</p>

        <div class="lp-cta-row">
          <!-- Primary CTA: anonymous opens the shared AuthDialog (App.vue),
               logged-in routes straight into the app. -->
          <router-link v-if="isAuthed" :to="`/${locale}/cards`" class="lp-btn lp-btn-trade lp-btn-lg">
            {{ $t("landing.hero.ctaGoToApp") }}
            <span class="lp-btn-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
          </router-link>
          <button v-else type="button" class="lp-btn lp-btn-trade lp-btn-lg" @click="emit('requireAuth')">
            {{ $t("landing.hero.ctaGetStarted") }}
            <span class="lp-btn-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
          </button>

          <router-link :to="`/${locale}/cards`" class="lp-btn lp-btn-ghost lp-btn-lg">
            {{ $t("landing.hero.ctaBrowse") }}
            <span class="lp-btn-badge lp-btn-badge-ghost" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
            </span>
          </router-link>
        </div>

        <!-- The four promises, as chips on the same line the logo strip occupies
             in most SaaS heroes. Here the row states terms rather than borrowing
             credibility from other companies' logos. -->
        <ul class="lp-promises">
          <li v-for="k in ['noFees', 'noAuctions', 'directP2P', 'mutualMatches']" :key="k" class="lp-promise">
            <span class="lp-promise-dot" aria-hidden="true" />{{ $t(`landing.hero.bullets.${k}`) }}
          </li>
        </ul>
      </div>

      <!-- Stage: the app itself, with the mutual match floating clear of it. -->
      <div class="lp-shell lp-stage">
        <div class="lp-window" role="img" :aria-label="$t('landing.features.search.body')">
          <div class="lp-window-bar">
            <span class="lp-dots">
              <span class="lp-dot" style="background: #ef6a7e" />
              <span class="lp-dot" style="background: #f3c34e" />
              <span class="lp-dot" style="background: #5ec98a" />
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
            <div class="lp-result-grid">
              <div v-for="card in heroGrid" :key="card.id" class="lp-result">
                <div class="lp-thumb" :style="{ background: card.grad }">
                  <img :src="thumb(card.id)" :alt="card.name" loading="eager" @error="onImgError" />
                </div>
                <span class="lp-result-name">{{ card.name }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- The signature at its smallest scale: give, seam, get. -->
        <div class="lp-match">
          <div class="lp-match-head">
            <span class="lp-match-title">{{ $t("landing.tradeShowcase.heading") }}</span>
            <span class="lp-match-found">
              <span class="lp-match-found-dot" />{{ $t("landing.tradeShowcase.labelMatch") }}
            </span>
          </div>
          <div class="lp-match-body">
            <div class="lp-match-side">
              <span class="lp-axis-label lp-axis-label-give">{{ $t("landing.tradeShowcase.labelPile") }}</span>
              <div class="lp-thumb lp-thumb-give">
                <img :src="thumb('46986414')" alt="Dark Magician" @error="onImgError" />
              </div>
            </div>
            <span class="lp-match-seam" aria-hidden="true" />
            <div class="lp-swap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 8h12l-3-3M17 16H5l3 3" /></svg>
            </div>
            <div class="lp-match-side">
              <span class="lp-axis-label lp-axis-label-get">{{ $t("landing.tradeShowcase.labelWishlist") }}</span>
              <div class="lp-thumb lp-thumb-get">
                <img :src="thumb('89631139')" alt="Blue-Eyes White Dragon" @error="onImgError" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Card-art marquee, bleeding off both edges. -->
      <div class="lp-marquee" :aria-label="$t('landing.marquee.ariaLabel')" aria-hidden="true">
        <div class="lp-marquee-track">
          <div v-for="(src, i) in marquee" :key="i" class="lp-marquee-cell">
            <img :src="src" alt="" loading="lazy" @error="onImgError" />
          </div>
        </div>
      </div>
    </section>

    <!-- ===== How it works ===== -->
    <!-- The only numbered section on the page, because this is the only content
         that is genuinely a sequence: each step is unreachable until the one
         before it is done. -->
    <section class="lp-section" aria-labelledby="lp-how-heading">
      <div class="lp-shell">
        <div class="lp-head" data-reveal>
          <span class="lp-eyebrow lp-eyebrow-plain">01 &mdash; 04</span>
          <h2 id="lp-how-heading" class="lp-h2">{{ $t("landing.howItWorks.heading") }}</h2>
          <p class="lp-sub">{{ $t("landing.howItWorks.subheading") }}</p>
        </div>

        <ol class="lp-steps" data-reveal>
          <li v-for="step in ['01', '02', '03', '04']" :key="step" class="lp-step">
            <span class="lp-step-num">{{ step }}</span>
            <h3 class="lp-h3">{{ $t(`landing.howItWorks.steps.${step}.title`) }}</h3>
            <p class="lp-step-body">{{ $t(`landing.howItWorks.steps.${step}.body`) }}</p>
          </li>
        </ol>
      </div>
    </section>

    <!-- ===== Features ===== -->
    <section class="lp-section" aria-labelledby="lp-features-heading">
      <div class="lp-shell">
        <div class="lp-head" data-reveal>
          <h2 id="lp-features-heading" class="lp-h2">{{ $t("landing.features.heading") }}</h2>
          <p class="lp-sub">{{ $t("landing.features.subheading") }}</p>
        </div>

        <div class="lp-features" data-reveal>
          <!-- Search -->
          <router-link :to="`/${locale}/cards`" class="lp-card lp-card-accent">
            <div class="lp-card-visual">
              <div class="lp-illu-row">
                <div v-for="c in previewSearch" :key="c.id" class="lp-thumb lp-illu-thumb">
                  <img :src="c.src" :alt="$t('landing.features.search.title')" loading="lazy" @error="onImgError" />
                </div>
              </div>
            </div>
            <div class="lp-card-text">
              <span class="lp-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.4-3.4" /></svg>
              </span>
              <h3 class="lp-h3">{{ $t("landing.features.search.title") }}</h3>
              <p class="lp-card-body">{{ $t("landing.features.search.body") }}</p>
              <span class="lp-card-cta">
                {{ $t("landing.features.search.cta") }}
                <svg class="lp-ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </span>
            </div>
          </router-link>

          <!-- Decks -->
          <router-link :to="`/${locale}/decks`" class="lp-card lp-card-trade">
            <div class="lp-card-visual">
              <div class="lp-illu-stack">
                <div v-for="c in previewDeck" :key="c.id" class="lp-thumb lp-illu-deck" :style="{ marginLeft: c.ml }">
                  <img :src="c.src" :alt="$t('landing.features.decks.title')" loading="lazy" @error="onImgError" />
                </div>
              </div>
            </div>
            <div class="lp-card-text">
              <span class="lp-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 3 8l9 5 9-5-9-5Z" /><path d="m3 13 9 5 9-5" /></svg>
              </span>
              <h3 class="lp-h3">{{ $t("landing.features.decks.title") }}</h3>
              <p class="lp-card-body">{{ $t("landing.features.decks.body") }}</p>
              <span class="lp-card-cta">
                {{ $t("landing.features.decks.cta") }}
                <svg class="lp-ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </span>
            </div>
          </router-link>

          <!-- Collection -->
          <router-link :to="`/${locale}/library`" class="lp-card lp-card-accent">
            <div class="lp-card-visual">
              <div class="lp-piles">
                <div class="lp-pile">
                  <span class="lp-axis-label lp-axis-label-give">{{ $t("library.tradePile") }}</span>
                  <div class="lp-illu-stack">
                    <div v-for="c in previewPile" :key="c.id" class="lp-thumb lp-illu-pile" :style="{ marginLeft: c.ml }">
                      <img :src="c.src" :alt="$t('library.tradePile')" loading="lazy" @error="onImgError" />
                    </div>
                  </div>
                </div>
                <div class="lp-pile">
                  <span class="lp-axis-label lp-axis-label-get">{{ $t("library.wishlist") }}</span>
                  <div class="lp-illu-stack">
                    <div v-for="c in previewWish" :key="c.id" class="lp-thumb lp-illu-pile" :style="{ marginLeft: c.ml }">
                      <img :src="c.src" :alt="$t('library.wishlist')" loading="lazy" @error="onImgError" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="lp-card-text">
              <span class="lp-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h7v7H3zM14 5h7v4h-7zM14 13h7v6h-7zM3 16h7v3H3z" /><path d="m15.5 6.5 1.3 1.3 2.7-2.7" /></svg>
              </span>
              <h3 class="lp-h3">{{ $t("landing.features.piles.title") }}</h3>
              <p class="lp-card-body">{{ $t("landing.features.piles.body") }}</p>
              <span class="lp-card-cta">
                {{ $t("landing.features.piles.cta") }}
                <svg class="lp-ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </span>
            </div>
          </router-link>

          <!-- Trade. The one card that carries the axis, and the one marked CORE. -->
          <router-link :to="`/${locale}/trade`" class="lp-card lp-card-core">
            <span class="lp-core-badge">{{ $t("landing.features.coreBadge") }}</span>
            <div class="lp-card-visual">
              <div class="lp-illu-pair">
                <div class="lp-thumb lp-thumb-give lp-illu-pair-card">
                  <img :src="thumb('74677422')" alt="Red-Eyes Black Dragon" loading="lazy" @error="onImgError" />
                </div>
                <span class="lp-match-seam" aria-hidden="true" />
                <div class="lp-swap">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 8h12l-3-3M17 16H5l3 3" /></svg>
                </div>
                <div class="lp-thumb lp-thumb-get lp-illu-pair-card">
                  <img :src="thumb('89631139')" alt="Blue-Eyes White Dragon" loading="lazy" @error="onImgError" />
                </div>
              </div>
            </div>
            <div class="lp-card-text">
              <span class="lp-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7h11l-3-3M17 17H6l3 3" /></svg>
              </span>
              <h3 class="lp-h3">{{ $t("landing.features.trade.title") }}</h3>
              <p class="lp-card-body">{{ $t("landing.features.trade.body") }}</p>
              <span class="lp-card-cta">
                {{ $t("landing.features.trade.cta") }}
                <svg class="lp-ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </span>
            </div>
          </router-link>
        </div>
      </div>
    </section>

    <!-- ===== The axis, full size: the page's one loud moment ===== -->
    <section class="lp-section" aria-labelledby="lp-trade-heading">
      <div class="lp-shell">
        <div class="lp-panel lp-panel-axis" data-reveal>
          <div class="lp-head lp-head-tight">
            <span class="lp-eyebrow lp-eyebrow-mutual">
              <span class="lp-eyebrow-dot" />{{ $t("landing.tradeShowcase.eyebrow") }}
            </span>
            <h2 id="lp-trade-heading" class="lp-h2">{{ $t("landing.tradeShowcase.heading") }}</h2>
            <p class="lp-sub">{{ $t("landing.tradeShowcase.body") }}</p>
          </div>

          <!-- Two cards leaning into one teal line. Teal is licensed here and
               nowhere else on the page: this is the agreement itself, not a
               decoration borrowing the colour of one. -->
          <div class="lp-axis">
            <span class="lp-axis-seam" aria-hidden="true" />
            <div class="lp-axis-row">
              <figure class="lp-axis-side">
                <span class="lp-axis-label lp-axis-label-give">{{ $t("landing.tradeShowcase.labelPile") }}</span>
                <div class="lp-thumb lp-thumb-give lp-axis-card lp-axis-card-give">
                  <img :src="thumb('46986414')" alt="Dark Magician" loading="lazy" @error="onImgError" />
                </div>
                <figcaption class="lp-axis-name">Dark Magician</figcaption>
              </figure>

              <div class="lp-axis-mark">
                <span class="lp-axis-disc">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 8h12l-3-3M17 16H5l3 3" /></svg>
                </span>
                <span class="lp-axis-tag">{{ $t("landing.tradeShowcase.labelMatch") }}</span>
              </div>

              <figure class="lp-axis-side">
                <span class="lp-axis-label lp-axis-label-get">{{ $t("landing.tradeShowcase.labelWishlist") }}</span>
                <div class="lp-thumb lp-thumb-get lp-axis-card lp-axis-card-get">
                  <img :src="thumb('89631139')" alt="Blue-Eyes White Dragon" loading="lazy" @error="onImgError" />
                </div>
                <figcaption class="lp-axis-name">Blue-Eyes W. Dragon</figcaption>
              </figure>
            </div>
          </div>

          <router-link :to="`/${locale}/trade`" class="lp-btn lp-btn-mutual lp-btn-lg">
            {{ $t("landing.tradeShowcase.cta") }}
            <span class="lp-btn-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
          </router-link>
        </div>
      </div>
    </section>

    <!-- ===== People: who is already here ===== -->
    <!-- Hidden entirely until there are enough real rows to fill it; see
         showPeople. Client-fetched, so it is absent from the pre-rendered HTML
         and appears once the data lands — which is also why it carries no
         data-reveal: its arrival is already its entrance. -->
    <section v-if="showPeople" class="lp-section" aria-labelledby="lp-people-heading">
      <div class="lp-shell">
        <div class="lp-head">
          <span class="lp-eyebrow">
            <span class="lp-eyebrow-dot" />{{ $t("landing.people.eyebrow") }}
          </span>
          <h2 id="lp-people-heading" class="lp-h2">{{ $t("landing.people.heading") }}</h2>
          <p class="lp-sub">{{ $t("landing.people.subheading") }}</p>
        </div>

        <div class="lp-people">
          <!-- Newest members -->
          <div class="lp-people-col">
            <h3 class="lp-people-title">{{ $t("people.newestTitle") }}</h3>
            <ul class="lp-people-list">
              <li v-for="t in recentPeople" :key="t.id">
                <router-link :to="`/${locale}/trader/${t.id}`" class="lp-person">
                  <span class="lp-person-avatar">
                    <img v-if="t.avatar_url" :src="t.avatar_url" alt="" loading="lazy" @error="onImgError" />
                    <span v-else>{{ t.initial }}</span>
                  </span>
                  <span class="lp-person-text">
                    <span class="lp-person-name">{{ t.Name }}</span>
                    <span v-if="t.place" class="lp-person-meta">{{ t.place }}</span>
                  </span>
                  <span v-if="t.agoKey" class="lp-person-when">
                    {{ $t(t.agoKey, { n: t.agoCount }, t.agoCount) }}
                  </span>
                </router-link>
              </li>
            </ul>
          </div>

          <!-- Deepest trade piles -->
          <div class="lp-people-col">
            <h3 class="lp-people-title">{{ $t("people.pilesTitle") }}</h3>
            <ul class="lp-people-list">
              <li v-for="(t, i) in topPiles" :key="t.id">
                <router-link :to="`/${locale}/trader/${t.id}`" class="lp-person">
                  <span class="lp-person-rank" aria-hidden="true">{{ i + 1 }}</span>
                  <span class="lp-person-avatar">
                    <img v-if="t.avatar_url" :src="t.avatar_url" alt="" loading="lazy" @error="onImgError" />
                    <span v-else>{{ traderInitial(t.name) }}</span>
                  </span>
                  <span class="lp-person-text">
                    <span class="lp-person-name">{{ t.name }}</span>
                  </span>
                  <span class="lp-person-count">
                    {{ $t("people.pileCount", { count: t.pile_size }, t.pile_size) }}
                  </span>
                </router-link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== Community plan: the offer to shop and server owners ===== -->
    <!-- Deliberately not a third copy of the Discord/Donate panel. Those two are
         the same block with one hex swapped, and a third would close the page
         with a stack of interchangeable slabs. This one speaks to a different
         reader (an owner, not a collector) and shows what verification buys
         instead of only listing it.

         Amethyst, not teal, despite the badge it is selling: teal belongs to the
         agreement chain (DESIGN.md, The Agreement Rule) and an offer is not an
         agreement. The one teal mark here is inside the mock, where it is
         reproducing what the directory actually renders. -->
    <section class="lp-section" aria-labelledby="lp-plan-heading">
      <div class="lp-shell">
        <div class="lp-head" data-reveal>
          <span class="lp-eyebrow lp-eyebrow-trade">
            <span class="lp-eyebrow-dot" />{{ $t("landing.plan.eyebrow") }}
          </span>
          <h2 id="lp-plan-heading" class="lp-h2">{{ $t("landing.plan.heading") }}</h2>
          <p class="lp-sub">{{ $t("landing.plan.body") }}</p>
        </div>

        <div class="lp-plan" data-reveal>
          <article class="lp-price">
            <!-- Price and CTA sit on their own inner panel, the list below on the
                 card itself: what it costs is one decision, what you get is the
                 supporting detail. -->
            <div class="lp-price-head">
              <strong class="lp-price-free">{{ $t("landing.plan.freeYear") }}</strong>
              <span class="lp-price-then">{{ $t("landing.plan.thenYear", { year: planYear }) }}</span>
              <span class="lp-price-alt">{{ $t("landing.plan.monthly", { month: planMonth }) }}</span>
              <router-link :to="{ name: 'community', params: { locale } }" class="lp-btn lp-btn-trade lp-btn-block">
                {{ $t("landing.plan.cta") }}
                <span class="lp-btn-badge" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </span>
              </router-link>
            </div>

            <!-- The same four promises the verify page makes, read from the same
                 keys. One list, so the pitch cannot outgrow what is delivered. -->
            <ul class="lp-price-list">
              <li v-for="k in ['unlockNear', 'unlockEvents', 'unlockBadge', 'unlockRanking']" :key="k">
                <span class="lp-check" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </span>
                {{ $t(`communityVerify.${k}`) }}
              </li>
            </ul>
          </article>

          <!-- Your listing carrying the badge, above the ones without it: the mark
               and the ranking, shown rather than described twice. Every claim it
               makes is already in the list beside it, so the whole mock is
               decorative and hidden from assistive tech. -->
          <div class="lp-plan-mock" aria-hidden="true">
            <span class="lp-mock-label">{{ $t("community.home") }}</span>

            <div class="lp-mock-card">
              <div class="lp-mock-banner"></div>
              <span class="lp-mock-avatar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h16l-1.2-4.2A1 1 0 0 0 17.8 4H6.2a1 1 0 0 0-.96.73L4 9Z" /><path d="M4 9v10h16V9" /><path d="M9.5 19v-5.5h5V19" /></svg>
              </span>
              <div class="lp-mock-body">
                <span class="lp-mock-top">
                  <span class="lp-mock-name">{{ $t("landing.plan.mockName") }}</span>
                  <!-- The directory's verified mark, reproduced: a teal disc with
                       the on-accent check that every brand colour carries. -->
                  <span class="lp-mock-check">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  </span>
                </span>
                <span class="lp-mock-meta">{{ $t("community.typeStore") }}</span>
              </div>
            </div>

            <div v-for="n in 2" :key="n" class="lp-mock-ghost">
              <span class="lp-mock-ghost-mark" />
              <span class="lp-mock-ghost-lines">
                <span class="lp-mock-bar" />
                <span class="lp-mock-bar lp-mock-bar-short" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== Discord + Donate: the two asks, side by side ===== -->
    <!-- Paired rather than stacked. They were two full-width slabs with one hex
         swapped between them; as a pair they read as one row of two invitations
         and stop competing for the same vertical space. -->
    <!-- No aria-labelledby: the region holds two independent invitations, and
         naming it with both headings at once produces one run-on region name. -->
    <section class="lp-section">
      <div class="lp-shell">
        <div class="lp-asks" data-reveal>
          <div class="lp-panel lp-panel-ask">
            <span class="lp-ask-glyph lp-ask-glyph-discord" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.198.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" /></svg>
            </span>
            <span class="lp-eyebrow lp-eyebrow-plain">{{ $t("landing.discord.eyebrow") }}</span>
            <h2 id="lp-discord-heading" class="lp-h3 lp-ask-h">{{ $t("landing.discord.heading") }}</h2>
            <p class="lp-ask-body">{{ $t("landing.discord.body") }}</p>
            <ul class="lp-ask-list">
              <li v-for="k in ['sync', 'chat', 'alerts']" :key="k">
                <span class="lp-check lp-check-plain" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </span>
                {{ $t(`landing.discord.bullets.${k}`) }}
              </li>
            </ul>
            <a :href="DISCORD_URL" target="_blank" rel="noopener noreferrer" class="lp-btn lp-btn-ghost lp-btn-block">
              {{ $t("landing.discord.cta") }}
              <span class="lp-btn-badge lp-btn-badge-ghost" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </span>
            </a>
          </div>

          <div class="lp-panel lp-panel-ask">
            <span class="lp-ask-glyph lp-ask-glyph-kofi" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="currentColor"><path :d="KOFI_PATH" /></svg>
            </span>
            <span class="lp-eyebrow lp-eyebrow-plain">{{ $t("landing.donate.eyebrow") }}</span>
            <h2 id="lp-donate-heading" class="lp-h3 lp-ask-h">{{ $t("landing.donate.heading") }}</h2>
            <p class="lp-ask-body">{{ $t("landing.donate.body") }}</p>
            <ul class="lp-ask-list">
              <li v-for="k in ['servers', 'free', 'solo']" :key="k">
                <span class="lp-check lp-check-plain" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </span>
                {{ $t(`landing.donate.bullets.${k}`) }}
              </li>
            </ul>
            <a :href="KOFI_URL" target="_blank" rel="noopener noreferrer" class="lp-btn lp-btn-ghost lp-btn-block">
              {{ $t("landing.donate.cta") }}
              <span class="lp-btn-badge lp-btn-badge-ghost" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </span>
            </a>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== Footer ===== -->
    <footer class="lp-footer">
      <!-- Built-with / partners logo strip → links to the /built-with page (which
           carries the referral disclosure). -->
      <div class="lp-shell">
        <router-link :to="`/${locale}/built-with`" class="lp-builtwith" :aria-label="$t('landing.footer.builtWithStripTitle')">
          <span class="lp-builtwith-title">{{ $t("landing.footer.builtWithStripTitle") }}</span>
          <span class="lp-builtwith-logos">
            <span v-for="tool in builtWithTools" :key="tool.key" class="lp-builtwith-logo">
              <img v-if="tool.img" :src="isDark ? tool.img.dark : tool.img.light" :alt="tool.name" class="lp-builtwith-img" />
              <svg v-else-if="tool.path" :viewBox="tool.viewBox" fill="currentColor" :aria-label="tool.name" role="img">
                <path :d="tool.path" />
              </svg>
              <span v-else class="lp-builtwith-wordmark">{{ tool.name }}</span>
            </span>
          </span>
        </router-link>

        <div class="lp-footer-grid">
          <div class="lp-footer-brand">
            <div class="lp-footer-brand-row">
              <img src="/logo.png" alt="" class="lp-badge lp-badge-sm" />
              <span class="lp-wordmark">{{ $t("landing.hero.productName") }}</span>
            </div>
            <p class="lp-footer-blurb">{{ $t("landing.footer.blurb") }}</p>
          </div>

          <nav class="lp-footer-col" :aria-label="$t('landing.footer.colProduct')">
            <span class="lp-footer-col-title">{{ $t("landing.footer.colProduct") }}</span>
            <router-link :to="`/${locale}/cards`" class="lp-footer-link">{{ $t("landing.footer.search") }}</router-link>
            <router-link :to="`/${locale}/decks`" class="lp-footer-link">{{ $t("landing.footer.decks") }}</router-link>
            <router-link :to="`/${locale}/library`" class="lp-footer-link">{{ $t("landing.footer.piles") }}</router-link>
            <router-link :to="`/${locale}/trade`" class="lp-footer-link">{{ $t("landing.footer.trade") }}</router-link>
            <router-link :to="{ name: 'community', params: { locale } }" class="lp-footer-link">{{ $t("community.home") }}</router-link>
          </nav>

          <nav class="lp-footer-col" :aria-label="$t('landing.footer.colMore')">
            <span class="lp-footer-col-title">{{ $t("landing.footer.colMore") }}</span>
            <router-link :to="`/${locale}/privacy`" class="lp-footer-link">{{ $t("landing.footer.about") }}</router-link>
            <router-link :to="`/${locale}/built-with`" class="lp-footer-link">{{ $t("landing.footer.builtWith") }}</router-link>
            <router-link :to="`/${locale}/privacy`" class="lp-footer-link">{{ $t("landing.footer.privacy") }}</router-link>
            <router-link :to="`/${locale}/terms`" class="lp-footer-link">{{ $t("landing.footer.terms") }}</router-link>
            <a href="mailto:hello@0nefor.one" class="lp-footer-link">{{ $t("landing.footer.contact") }}</a>
          </nav>
        </div>
      </div>

      <div class="lp-footer-sub">
        <div class="lp-shell lp-footer-sub-inner">
          <span class="lp-copyright">{{ $t("landing.footer.copyright") }}</span>
          <router-link :to="`/${locale}/terms`" class="lp-footer-link">{{ $t("landing.footer.termsOfService") }}</router-link>
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
  /* One container width for every section, so nothing on the page is aligned
     by eye. */
  --lp-w: clamp(18rem, 92vw, 1160px);
  --lp-r: 24px;
  --lp-r-card: 18px;
  --lp-r-sm: 12px;
  /* Panel and card grounds sit one tonal step above the page, per the three-
     surface stack (DESIGN.md §4) — depth by tone, not by drop shadow. */
  --lp-panel: color-mix(in srgb, var(--c-surface) 94%, var(--c-bg));
  --lp-line: color-mix(in srgb, var(--c-border) 60%, transparent);
  --lp-line-soft: color-mix(in srgb, var(--c-border) 34%, transparent);
  /* A 1px top highlight instead of an outer shadow: the reference's cards read
     as lit from above, and this gets that without breaking The Flat-By-Default
     Rule. */
  --lp-lit: inset 0 1px 0 color-mix(in srgb, var(--c-text) 8%, transparent);

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

.lp-shell {
  width: var(--lp-w);
  margin-inline: auto;
}

/* ── Type ──────────────────────────────────────────────────────────────────
   The display face is pushed much harder than the body face: big, tightly
   tracked, near-solid leading. The size and tracking contrast is what carries
   the personality, which is why no third webfont was added to get it. */
.landing :where(h1, h2, h3) {
  font-family: "Space Grotesk", "Manrope", system-ui, sans-serif;
  font-weight: 700;
}

.lp-h1 {
  font-size: clamp(2.4rem, 6vw, 4.5rem);
  line-height: 1.02;
  letter-spacing: -0.035em;
  margin: 0;
  text-wrap: balance;
}
.lp-h1 :deep(span),
.lp-h1 :deep(em) {
  color: var(--c-accent);
  font-style: normal;
}

.lp-h2 {
  font-size: clamp(1.85rem, 3.5vw, 2.9rem);
  line-height: 1.06;
  letter-spacing: -0.03em;
  margin: 0;
  text-wrap: balance;
}

.lp-h3 {
  font-size: clamp(1.02rem, 1.4vw, 1.22rem);
  line-height: 1.25;
  letter-spacing: -0.012em;
  margin: 0;
}

.lp-lede {
  font-size: clamp(0.98rem, 1.3vw, 1.14rem);
  line-height: 1.6;
  color: var(--c-muted);
  margin: 0;
  max-width: 60ch;
}

.lp-sub {
  font-size: clamp(0.92rem, 1.1vw, 1.02rem);
  line-height: 1.6;
  color: var(--c-muted);
  margin: 0;
  max-width: 62ch;
}

/* The third voice: monospace, uppercase, widely tracked. Set codes and binder
   labels are already read this way in the app (DESIGN.md, The Mono Identifier
   Rule), so section labels borrow the collector's own register rather than the
   soft rounded chip the reference uses. */
.lp-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--c-accent);
  background: color-mix(in srgb, var(--c-accent) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--c-accent) 26%, transparent);
  border-radius: 999px;
  padding: 6px 14px;
  width: fit-content;
}
.lp-eyebrow-trade {
  color: var(--c-trade);
  background: color-mix(in srgb, var(--c-trade) 12%, transparent);
  border-color: color-mix(in srgb, var(--c-trade) 26%, transparent);
}
.lp-eyebrow-mutual {
  color: var(--c-mutual);
  background: color-mix(in srgb, var(--c-mutual) 12%, transparent);
  border-color: color-mix(in srgb, var(--c-mutual) 28%, transparent);
}
.lp-eyebrow-plain {
  color: var(--c-muted);
  background: color-mix(in srgb, var(--c-muted) 9%, transparent);
  border-color: var(--lp-line-soft);
}

.lp-eyebrow-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentColor;
  flex: none;
}

.lp-ico-sm {
  width: 15px;
  height: 15px;
  flex: none;
}

/* ── Buttons ───────────────────────────────────────────────────────────────
   Pill, with the label and a circular icon badge — the reference's one idiom
   worth taking wholesale. These are landing-only `lp-btn` elements, not the
   app's 8px-radius v-btn (DESIGN.md §5), so the two vocabularies stay apart. */
.lp-btn {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  cursor: pointer;
  text-decoration: none;
  font-family: inherit;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  transition: filter 0.16s ease, background-color 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}
.lp-btn-sm { padding: 8px 8px 8px 18px; font-size: 0.875rem; }
.lp-btn-lg { padding: 9px 9px 9px 24px; font-size: 1rem; }
/* Block buttons are used without a size class, so they carry their own
   padding rather than inheriting none. */
.lp-btn-block {
  width: 100%;
  justify-content: space-between;
  padding: 9px 9px 9px 22px;
  font-size: 0.94rem;
}

.lp-btn-badge {
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--c-on-accent) 20%, transparent);
  flex: none;
}
.lp-btn-lg .lp-btn-badge { width: 30px; height: 30px; }
.lp-btn-badge svg { width: 14px; height: 14px; }
.lp-btn-badge-ghost { background: color-mix(in srgb, var(--c-text) 12%, transparent); }

.lp-btn-trade { background: var(--c-trade); color: var(--c-on-accent); }
.lp-btn-trade:hover { filter: brightness(1.08); }
.lp-btn-mutual { background: var(--c-mutual); color: var(--c-on-accent); }
.lp-btn-mutual:hover { filter: brightness(1.08); }
.lp-btn-ghost {
  background: color-mix(in srgb, var(--c-surface) 70%, transparent);
  color: var(--c-text);
  border-color: var(--lp-line);
}
.lp-btn-ghost:hover { background: var(--c-surface-2); border-color: var(--c-trade); }

.lp-login {
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--c-muted);
  padding: 8px 4px;
  transition: color 0.16s ease;
}
.lp-login:hover { color: var(--c-text); }

/* ── Header: a floating pill, clear of the page edge ── */
.lp-header {
  position: sticky;
  top: 14px;
  z-index: 40;
  padding: 14px 0 0;
}
.lp-header-bar {
  width: var(--lp-w);
  margin-inline: auto;
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 10px 10px 10px 20px;
  border-radius: 999px;
  border: 1px solid var(--lp-line);
  background: color-mix(in srgb, var(--c-surface) 78%, transparent);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: var(--lp-lit);
}

.lp-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--c-text);
  flex: none;
}
.lp-badge { width: 30px; height: 30px; border-radius: 8px; object-fit: contain; }
.lp-badge-sm { width: 26px; height: 26px; }
.lp-wordmark {
  font-family: "Space Grotesk", "Manrope", system-ui, sans-serif;
  font-weight: 700;
  font-size: 1.02rem;
  letter-spacing: -0.02em;
}

.lp-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-inline: auto;
}
.lp-nav-link {
  text-decoration: none;
  color: var(--c-muted);
  font-size: 0.875rem;
  font-weight: 600;
  padding: 8px 14px;
  border-radius: 999px;
  transition: color 0.16s ease, background-color 0.16s ease;
}
.lp-nav-link:hover { color: var(--c-text); background: var(--c-surface-2); }

.lp-header-cta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}

@media (max-width: 900px) {
  .lp-nav { display: none; }
  .lp-header-bar { justify-content: space-between; }
}
@media (max-width: 460px) {
  .lp-wordmark { display: none; }
}

/* ── Hero ── */
.lp-hero {
  position: relative;
  padding-top: clamp(56px, 8vw, 104px);
  isolation: isolate;
}
/* Ambient light behind the hero. Two brand hues at low strength, never a
   rainbow — the page reads as lit, not as painted. */
.lp-hero-glow {
  position: absolute;
  inset: -180px 0 auto;
  height: 720px;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(58% 46% at 50% 8%, color-mix(in srgb, var(--c-trade) 26%, transparent), transparent 70%),
    radial-gradient(42% 38% at 78% 30%, color-mix(in srgb, var(--c-accent) 16%, transparent), transparent 72%);
  filter: blur(18px);
  opacity: 0.75;
}

.lp-hero-copy {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 22px;
}
.lp-hero-copy .lp-lede { max-width: 52ch; }

.lp-cta-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin-top: 2px;
}

/* Terms, where a SaaS hero usually puts other companies' logos. */
.lp-promises {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
}
.lp-promise {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--c-muted);
  background: color-mix(in srgb, var(--c-surface) 66%, transparent);
  border: 1px solid var(--lp-line-soft);
  border-radius: 999px;
  padding: 7px 14px;
}
.lp-promise-dot {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--c-trade);
  flex: none;
}

/* ── Stage: the app window, with the match floating off its corner ── */
.lp-stage {
  position: relative;
  margin-top: clamp(38px, 5vw, 66px);
}

.lp-window {
  border: 1px solid var(--lp-line);
  border-radius: var(--lp-r);
  background: var(--lp-panel);
  box-shadow: var(--lp-lit);
  overflow: hidden;
}
.lp-window-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--lp-line-soft);
  background: color-mix(in srgb, var(--c-surface-2) 55%, transparent);
}
.lp-dots { display: inline-flex; gap: 6px; flex: none; }
.lp-dot { width: 10px; height: 10px; border-radius: 999px; display: block; }
.lp-url {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.72rem;
  color: var(--c-muted);
  background: color-mix(in srgb, var(--c-bg) 55%, transparent);
  border-radius: 999px;
  padding: 5px 14px;
  margin-inline: auto;
}

.lp-window-body { padding: clamp(14px, 2vw, 22px); display: flex; flex-direction: column; gap: 14px; }

.lp-search-field {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--lp-line);
  border-radius: var(--lp-r-sm);
  background: var(--c-input-bg, var(--c-surface-2));
  padding: 11px 14px;
}
.lp-search-term { font-size: 0.9rem; font-weight: 600; }
.lp-caret {
  width: 1.5px;
  height: 15px;
  background: var(--c-accent);
  animation: lp-blink 1.1s steps(2, start) infinite;
}
@keyframes lp-blink { 50% { opacity: 0; } }
.lp-results {
  margin-left: auto;
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.7rem;
  color: var(--c-muted);
}

.lp-chips { display: flex; flex-wrap: wrap; gap: 7px; }
.lp-chip {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--c-muted);
  border: 1px solid var(--lp-line-soft);
  border-radius: 999px;
  padding: 5px 12px;
}
.lp-chip-active {
  color: var(--c-on-accent);
  background: var(--c-accent);
  border-color: transparent;
}

.lp-result-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
}
.lp-result { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.lp-result-name {
  font-size: 0.66rem;
  color: var(--c-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Every card image in the page shares one frame: the 59:86 card ratio, so
   nothing shifts when art loads (DESIGN.md §6). */
.lp-thumb {
  position: relative;
  aspect-ratio: 59 / 86;
  border-radius: 9px;
  overflow: hidden;
  background: var(--c-skeleton);
}
.lp-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: opacity 0.2s ease;
}
.lp-thumb-give { box-shadow: 0 0 0 1.5px var(--c-trade); }
.lp-thumb-get { box-shadow: 0 0 0 1.5px var(--c-accent); }

/* ── The match card: the signature at its smallest ── */
.lp-match {
  border: 1px solid var(--lp-line);
  border-radius: var(--lp-r-card);
  background: var(--lp-panel);
  box-shadow: var(--lp-lit);
  padding: 14px;
  width: 262px;
}
@media (min-width: 900px) {
  .lp-match {
    position: absolute;
    right: -24px;
    bottom: -46px;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    background: color-mix(in srgb, var(--c-surface) 88%, transparent);
  }
}
@media (max-width: 899px) {
  .lp-match { margin: 18px auto 0; }
}
.lp-match-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}
.lp-match-title {
  font-family: "Space Grotesk", "Manrope", system-ui, sans-serif;
  font-weight: 700;
  font-size: 0.82rem;
  letter-spacing: -0.01em;
}
.lp-match-found {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--c-mutual);
  background: color-mix(in srgb, var(--c-mutual) 14%, transparent);
  border-radius: 999px;
  padding: 4px 9px;
}
.lp-match-found-dot { width: 5px; height: 5px; border-radius: 999px; background: currentColor; }
.lp-match-body {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 10px;
}
.lp-match-side { display: flex; flex-direction: column; gap: 6px; min-width: 0; }

/* The seam, small: a teal thread the swap disc sits on. */
.lp-match-seam {
  position: absolute;
  left: 8%;
  right: 8%;
  top: 62%;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--c-mutual), transparent);
  opacity: 0.5;
}
.lp-swap {
  position: relative;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  background: var(--c-mutual);
  color: var(--c-on-accent);
  flex: none;
}
.lp-swap svg { width: 15px; height: 15px; }

.lp-axis-label {
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.lp-axis-label-give { color: var(--c-trade); }
.lp-axis-label-get { color: var(--c-accent); }

/* ── Marquee ── */
.lp-marquee {
  margin-top: clamp(56px, 7vw, 92px);
  overflow: hidden;
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
  mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
}
.lp-marquee-track {
  display: flex;
  gap: 12px;
  width: max-content;
  animation: lp-marquee 46s linear infinite;
}
.lp-marquee-cell {
  width: 190px;
  aspect-ratio: 16 / 9;
  border-radius: var(--lp-r-sm);
  overflow: hidden;
  border: 1px solid var(--lp-line-soft);
  flex: none;
}
.lp-marquee-cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
@keyframes lp-marquee {
  to { transform: translateX(-50%); }
}

/* ── Sections ── */
.lp-section { padding: clamp(64px, 9vw, 118px) 0 0; }

.lp-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 16px;
  margin-bottom: clamp(32px, 4vw, 52px);
}
.lp-head-tight { margin-bottom: clamp(26px, 3vw, 38px); }

/* ── How it works ── */
.lp-steps {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  list-style: none;
  margin: 0;
  padding: 0;
  counter-reset: none;
}
.lp-step {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 24px 22px 26px;
  border: 1px solid var(--lp-line-soft);
  border-radius: var(--lp-r-card);
  background: var(--lp-panel);
  box-shadow: var(--lp-lit);
}
/* The numeral is the ornament, so it is allowed to be large and quiet. */
.lp-step-num {
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 1.55rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--c-trade);
  opacity: 0.55;
  line-height: 1;
}
.lp-step-body { font-size: 0.88rem; line-height: 1.55; color: var(--c-muted); margin: 0; }

/* ── Feature cards: visual on top, words underneath ── */
.lp-features {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.lp-card {
  position: relative;
  display: flex;
  flex-direction: column;
  text-decoration: none;
  color: inherit;
  border: 1px solid var(--lp-line-soft);
  border-radius: var(--lp-r);
  background: var(--lp-panel);
  box-shadow: var(--lp-lit);
  overflow: hidden;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}
.lp-card:hover { transform: translateY(-3px); }
.lp-card-accent:hover {
  border-color: color-mix(in srgb, var(--c-accent) 50%, transparent);
  box-shadow: var(--lp-lit), 0 14px 40px color-mix(in srgb, var(--c-accent) 22%, transparent);
}
.lp-card-trade:hover,
.lp-card-core:hover {
  border-color: color-mix(in srgb, var(--c-trade) 50%, transparent);
  box-shadow: var(--lp-lit), 0 14px 40px color-mix(in srgb, var(--c-trade) 22%, transparent);
}

/* The visual half. Card art is the product, so it gets the top of every card
   and is cropped by the frame rather than shrunk to fit inside it. */
.lp-card-visual {
  position: relative;
  height: 208px;
  padding: 20px 22px 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  overflow: hidden;
  background:
    radial-gradient(80% 100% at 50% 100%, color-mix(in srgb, var(--c-surface-2) 80%, transparent), transparent 70%);
}
.lp-card-visual::after {
  content: "";
  position: absolute;
  inset: auto 0 0;
  height: 46px;
  background: linear-gradient(transparent, var(--lp-panel));
  pointer-events: none;
}

.lp-illu-row { display: flex; gap: 8px; width: 100%; justify-content: center; }
.lp-illu-thumb { width: 104px; flex: none; }
.lp-illu-stack { display: flex; }
.lp-illu-deck { width: 112px; flex: none; }
.lp-illu-pair {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  width: 100%;
}
.lp-illu-pair-card { width: 112px; flex: none; }
.lp-illu-pair .lp-match-seam { top: 50%; left: 12%; right: 12%; opacity: 0.6; }
.lp-illu-pair .lp-swap { align-self: center; }

/* The two piles, side by side and labelled, so the card shows the same two
   lists the library page opens on. */
.lp-piles {
  display: flex;
  gap: clamp(14px, 3vw, 30px);
  width: 100%;
  justify-content: center;
  align-items: flex-end;
}
.lp-pile { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.lp-illu-pile { width: 88px; flex: none; }

.lp-card-text {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 22px 24px 26px;
}
.lp-card-icon {
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--c-surface-2);
  color: var(--c-trade);
  margin-bottom: 3px;
}
.lp-card-accent .lp-card-icon { color: var(--c-accent); }
.lp-card-icon svg { width: 18px; height: 18px; }
.lp-card-body { font-size: 0.88rem; line-height: 1.55; color: var(--c-muted); margin: 0; }
.lp-card-cta {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-top: 4px;
  font-size: 0.83rem;
  font-weight: 700;
  color: var(--c-trade);
}
.lp-card-accent .lp-card-cta { color: var(--c-accent); }

.lp-core-badge {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 2;
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--c-on-accent);
  background: var(--c-trade);
  border-radius: 999px;
  padding: 4px 10px;
}

/* ── Panels ── */
.lp-panel {
  border: 1px solid var(--lp-line);
  border-radius: var(--lp-r);
  background: var(--lp-panel);
  box-shadow: var(--lp-lit);
  padding: clamp(28px, 4vw, 52px);
}

/* ── The axis, full size ──────────────────────────────────────────────────
   The page's one loud moment: two cards leaning into a single teal line. Teal
   is spent here and nowhere else (DESIGN.md, The Agreement Rule) — this is the
   agreement itself, not decoration borrowing its colour. */
.lp-panel-axis {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  position: relative;
  overflow: hidden;
}
.lp-panel-axis::before {
  content: "";
  position: absolute;
  inset: auto 0 -60% 0;
  height: 320px;
  background: radial-gradient(50% 60% at 50% 100%, color-mix(in srgb, var(--c-mutual) 15%, transparent), transparent 70%);
  pointer-events: none;
}

.lp-axis {
  position: relative;
  width: 100%;
  max-width: 620px;
  margin: clamp(26px, 3vw, 40px) 0 clamp(30px, 3.5vw, 44px);
}
.lp-axis-seam {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--c-mutual) 22%, var(--c-mutual) 78%, transparent);
  opacity: 0.55;
}
.lp-axis-row {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: clamp(14px, 3vw, 34px);
}
.lp-axis-side {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin: 0;
}
.lp-axis-card {
  width: clamp(96px, 15vw, 138px);
  transition: transform 0.25s ease;
}
/* Leaning in — the whole point of the name. */
.lp-axis-card-give { transform: rotate(-6deg); }
.lp-axis-card-get { transform: rotate(6deg); }
.lp-panel-axis:hover .lp-axis-card-give { transform: rotate(-3deg) translateX(5px); }
.lp-panel-axis:hover .lp-axis-card-get { transform: rotate(3deg) translateX(-5px); }
.lp-axis-name { font-size: 0.76rem; color: var(--c-muted); margin: 0; }

.lp-axis-mark { display: flex; flex-direction: column; align-items: center; gap: 9px; }
.lp-axis-disc {
  display: grid;
  place-items: center;
  width: clamp(40px, 5vw, 52px);
  height: clamp(40px, 5vw, 52px);
  border-radius: 999px;
  background: var(--c-mutual);
  color: var(--c-on-accent);
  /* The one glow on the page, and it is on the one thing worth glowing. */
  box-shadow: 0 0 0 7px color-mix(in srgb, var(--c-mutual) 14%, transparent);
}
.lp-axis-disc svg { width: 22px; height: 22px; }
.lp-axis-tag {
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--c-mutual);
}

/* ── People ── */
.lp-people {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.lp-people-col {
  border: 1px solid var(--lp-line-soft);
  border-radius: var(--lp-r-card);
  background: var(--lp-panel);
  box-shadow: var(--lp-lit);
  padding: 22px;
}
.lp-people-title {
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--c-muted);
  margin: 0 0 14px;
}
.lp-people-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.lp-person {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 9px 10px;
  border-radius: var(--lp-r-sm);
  text-decoration: none;
  color: inherit;
  transition: background-color 0.16s ease;
}
.lp-person:hover { background: var(--c-surface-2); }
.lp-person-rank {
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--c-muted);
  width: 12px;
  flex: none;
}
.lp-person-avatar {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  overflow: hidden;
  flex: none;
  background: color-mix(in srgb, var(--c-trade) 22%, transparent);
  color: var(--c-trade);
  font-weight: 700;
  font-size: 0.82rem;
}
.lp-person-avatar img { width: 100%; height: 100%; object-fit: cover; }
.lp-person-text { display: flex; flex-direction: column; min-width: 0; }
.lp-person-name { font-size: 0.86rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lp-person-meta { font-size: 0.72rem; color: var(--c-muted); }
.lp-person-when,
.lp-person-count {
  margin-left: auto;
  font-size: 0.7rem;
  color: var(--c-muted);
  flex: none;
}

/* ── Community plan, as a price card ── */
.lp-plan {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.85fr);
  gap: 16px;
  align-items: start;
}
.lp-price {
  border: 1px solid var(--lp-line);
  border-radius: var(--lp-r);
  background: var(--lp-panel);
  box-shadow: var(--lp-lit);
  padding: 14px;
}
/* Price and CTA on their own inner panel, the list on the card itself: what it
   costs is one decision, what you get is the supporting detail. */
.lp-price-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 24px 22px;
  border-radius: calc(var(--lp-r) - 10px);
  background: linear-gradient(
    160deg,
    color-mix(in srgb, var(--c-trade) 20%, var(--c-surface-2)),
    var(--c-surface-2)
  );
}
.lp-price-free {
  font-family: "Space Grotesk", "Manrope", system-ui, sans-serif;
  font-size: clamp(1.5rem, 2.4vw, 2.1rem);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.1;
}
.lp-price-then { font-size: 0.92rem; font-weight: 600; color: var(--c-text); }
.lp-price-alt { font-size: 0.82rem; color: var(--c-muted); margin-bottom: 14px; }

.lp-price-list {
  list-style: none;
  margin: 0;
  padding: 22px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.lp-price-list li,
.lp-ask-list li {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  font-size: 0.88rem;
  line-height: 1.45;
  color: var(--c-muted);
}
.lp-check {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  flex: none;
  margin-top: 1px;
  background: color-mix(in srgb, var(--c-trade) 20%, transparent);
  color: var(--c-trade);
}
.lp-check-plain { background: color-mix(in srgb, var(--c-muted) 16%, transparent); color: var(--c-muted); }
.lp-check svg { width: 11px; height: 11px; }

/* The directory row this buys, shown rather than described twice. */
.lp-plan-mock {
  border: 1px solid var(--lp-line-soft);
  border-radius: var(--lp-r);
  background: color-mix(in srgb, var(--c-surface) 60%, transparent);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.lp-mock-label {
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--c-muted);
  margin-bottom: 4px;
}
.lp-mock-card {
  position: relative;
  border: 1px solid color-mix(in srgb, var(--c-mutual) 34%, transparent);
  border-radius: var(--lp-r-card);
  background: var(--c-surface);
  overflow: hidden;
  padding-bottom: 14px;
}
.lp-mock-banner {
  height: 42px;
  background: linear-gradient(120deg, var(--c-trade), var(--c-accent));
  opacity: 0.5;
}
.lp-mock-avatar {
  position: absolute;
  top: 22px;
  left: 16px;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--c-surface-2);
  border: 2px solid var(--c-surface);
  color: var(--c-muted);
}
.lp-mock-avatar svg { width: 20px; height: 20px; }
.lp-mock-body { padding: 12px 16px 0 64px; display: flex; flex-direction: column; gap: 3px; }
.lp-mock-top { display: flex; align-items: center; gap: 7px; }
.lp-mock-name { font-weight: 700; font-size: 0.9rem; }
.lp-mock-check {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: var(--c-mutual);
  color: var(--c-on-accent);
  flex: none;
}
.lp-mock-check svg { width: 9px; height: 9px; }
.lp-mock-meta { font-size: 0.74rem; color: var(--c-muted); }

.lp-mock-ghost {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--lp-line-soft);
  border-radius: var(--lp-r-card);
  padding: 14px;
  opacity: 0.45;
}
.lp-mock-ghost-mark { width: 34px; height: 34px; border-radius: 10px; background: var(--c-skeleton); flex: none; }
.lp-mock-ghost-lines { display: flex; flex-direction: column; gap: 6px; flex: 1; }
.lp-mock-bar { height: 7px; border-radius: 999px; background: var(--c-skeleton); width: 62%; }
.lp-mock-bar-short { width: 38%; }

/* ── The two asks, side by side ── */
.lp-asks {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.lp-panel-ask {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: clamp(24px, 3vw, 34px);
}
.lp-ask-glyph {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: var(--c-surface-2);
  margin-bottom: 2px;
}
.lp-ask-glyph svg { width: 22px; height: 22px; }
.lp-ask-glyph-discord { color: #5865f2; }
.lp-ask-glyph-kofi { color: #ff5e5b; }
.lp-ask-h { font-size: clamp(1.15rem, 1.8vw, 1.5rem); letter-spacing: -0.02em; }
.lp-ask-body { font-size: 0.88rem; line-height: 1.55; color: var(--c-muted); margin: 0; }
.lp-ask-list { list-style: none; margin: 2px 0 auto; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.lp-panel-ask .lp-btn { margin-top: 16px; }

/* ── Footer ── */
.lp-footer { margin-top: clamp(64px, 9vw, 118px); }

.lp-builtwith {
  display: flex;
  align-items: center;
  gap: clamp(16px, 3vw, 40px);
  flex-wrap: wrap;
  justify-content: center;
  padding: 22px 24px;
  border: 1px solid var(--lp-line-soft);
  border-radius: var(--lp-r);
  background: var(--lp-panel);
  text-decoration: none;
  transition: border-color 0.18s ease;
}
.lp-builtwith:hover { border-color: var(--lp-line); }
.lp-builtwith-title {
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--c-muted);
}
.lp-builtwith-logos {
  display: flex;
  align-items: center;
  gap: clamp(16px, 2.6vw, 34px);
  flex-wrap: wrap;
  justify-content: center;
}
.lp-builtwith-logo {
  display: inline-flex;
  align-items: center;
  color: var(--c-muted);
  opacity: 0.72;
  transition: opacity 0.18s ease;
}
.lp-builtwith:hover .lp-builtwith-logo { opacity: 1; }
.lp-builtwith-logo svg { height: 19px; width: auto; }
.lp-builtwith-img { height: 19px; width: auto; object-fit: contain; display: block; }
.lp-builtwith-wordmark { font-weight: 700; font-size: 0.88rem; letter-spacing: -0.01em; }

.lp-footer-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr);
  gap: clamp(24px, 4vw, 56px);
  padding: clamp(40px, 5vw, 66px) 0 clamp(32px, 4vw, 48px);
}
.lp-footer-brand { display: flex; flex-direction: column; gap: 12px; }
.lp-footer-brand-row { display: flex; align-items: center; gap: 10px; }
.lp-footer-blurb { font-size: 0.86rem; line-height: 1.6; color: var(--c-muted); margin: 0; max-width: 40ch; }
.lp-footer-col { display: flex; flex-direction: column; gap: 10px; }
.lp-footer-col-title {
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--c-muted);
  margin-bottom: 2px;
}
.lp-footer-link {
  text-decoration: none;
  color: var(--c-muted);
  font-size: 0.86rem;
  transition: color 0.16s ease;
}
.lp-footer-link:hover { color: var(--c-text); }

.lp-footer-sub { border-top: 1px solid var(--lp-line-soft); padding: 20px 0 26px; }
.lp-footer-sub-inner { display: flex; flex-wrap: wrap; align-items: center; gap: 18px; }
.lp-copyright { font-size: 0.8rem; color: var(--c-muted); margin-right: auto; }

/* ── Reveal ────────────────────────────────────────────────────────────────
   `.lp-reveal` is applied by JS, never here, so the pre-rendered HTML ships
   visible and a reader without JS never meets an opacity-0 page. */
.lp-reveal {
  opacity: 0;
  transform: translateY(14px);
}
.lp-reveal.lp-in {
  opacity: 1;
  transform: none;
  transition: opacity 0.55s ease, transform 0.55s cubic-bezier(0.22, 1, 0.36, 1);
}

@media (prefers-reduced-motion: reduce) {
  .lp-marquee-track { animation: none; }
  .lp-caret { animation: none; }
  .lp-card:hover { transform: none; }
  .lp-panel-axis:hover .lp-axis-card-give,
  .lp-panel-axis:hover .lp-axis-card-get { transform: none; }
  .lp-reveal,
  .lp-reveal.lp-in { opacity: 1; transform: none; transition: none; }
}

/* Keyboard focus stays visible on every interactive element, including the
   ones that are links dressed as cards. */
.landing :where(a, button):focus-visible {
  outline: 2px solid var(--c-accent);
  outline-offset: 3px;
  border-radius: var(--lp-r-sm);
}

/* ── Responsive ── */
@media (max-width: 1000px) {
  .lp-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .lp-plan { grid-template-columns: minmax(0, 1fr); }
  .lp-result-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 760px) {
  .lp-features,
  .lp-people,
  .lp-asks { grid-template-columns: minmax(0, 1fr); }
  .lp-footer-grid { grid-template-columns: minmax(0, 1fr); }
  .lp-card-visual { height: 176px; }
  .lp-marquee-cell { width: 148px; }
  .lp-btn-lg { padding: 8px 8px 8px 20px; font-size: 0.94rem; }
}
@media (max-width: 520px) {
  .lp-steps { grid-template-columns: minmax(0, 1fr); }
  .lp-result-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .lp-cta-row { width: 100%; flex-direction: column; }
  .lp-cta-row .lp-btn { justify-content: space-between; width: 100%; }
  .lp-match { width: 100%; max-width: 300px; }
}
</style>
