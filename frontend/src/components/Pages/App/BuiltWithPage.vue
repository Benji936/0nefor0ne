<script setup>
// "Built with & partners" colophon. A logo wall of the services that run the
// site and the marketplaces we partner with. Some links are referral links
// (disclosed up top) — every outbound link carries rel="sponsored" so search
// engines treat them correctly.
//
// SSR-safe: no top-level window/document access. Logos are inline brand SVGs
// (Railway, eBay from Simple Icons; TCGplayer is a styled wordmark since it is
// not in the icon set), so the page renders server-side with zero extra
// network requests.
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useTheme } from "vuetify";
import { BUILT_WITH_TOOLS } from "@/lib/builtWithTools";

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

// Groups in display order; only render a group that has tools.
const GROUPS = computed(() =>
  ["marketplace", "stack"]
    .map((id) => ({ id, items: BUILT_WITH_TOOLS.filter((t) => t.group === id) }))
    .filter((g) => g.items.length > 0),
);
</script>

<template>
  <div class="max-w-3xl mx-auto py-10 md:py-16 flex flex-col gap-8">
    <div class="flex flex-col gap-2">
      <router-link
        :to="`/${locale}/`"
        class="text-xs no-underline flex items-center gap-1 mb-2 transition-opacity hover:opacity-70 w-fit"
        style="color: var(--c-muted)"
      >
        <v-icon icon="mdi-arrow-left" size="14" />
        {{ $t("builtWith.back") }}
      </router-link>
      <h1 class="text-2xl md:text-3xl font-black" style="color: var(--c-text)">
        {{ $t("builtWith.heading") }}
      </h1>
      <p class="text-sm leading-relaxed" style="color: var(--c-muted)">
        {{ $t("builtWith.intro") }}
      </p>
    </div>

    <!-- Direct-support panel (Ko-fi) -->
    <div class="bw-support">
      <div class="bw-support-copy">
        <h2 class="bw-support-title">{{ $t("builtWith.support.title") }}</h2>
        <p class="bw-support-body">{{ $t("builtWith.support.body") }}</p>
      </div>
      <a :href="KOFI_URL" target="_blank" rel="noopener noreferrer" class="bw-kofi">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path :d="KOFI_PATH" /></svg>
        {{ $t("builtWith.support.cta") }}
      </a>
    </div>

    <!-- Referral disclosure -->
    <p class="bw-disclosure">{{ $t("builtWith.disclosure") }}</p>

    <section v-for="group in GROUPS" :key="group.id" class="flex flex-col gap-4">
      <h2 class="text-base font-bold" style="color: var(--c-text)">
        {{ $t(`builtWith.groups.${group.id}`) }}
      </h2>
      <div class="bw-grid">
        <a
          v-for="tool in group.items"
          :key="tool.key"
          :href="tool.href"
          target="_blank"
          rel="sponsored noopener noreferrer"
          class="bw-card"
          :aria-label="$t('builtWith.visit', { name: tool.name })"
        >
          <span class="bw-logo">
            <img
              v-if="tool.img"
              :src="isDark ? tool.img.dark : tool.img.light"
              :alt="tool.name"
              class="bw-logo-img"
            />
            <svg v-else-if="tool.path" :viewBox="tool.viewBox" fill="currentColor" aria-hidden="true">
              <path :d="tool.path" />
            </svg>
            <span v-else class="bw-wordmark">{{ tool.name }}</span>
          </span>
          <span class="bw-name">{{ tool.name }}</span>
          <span class="bw-blurb">{{ $t(`builtWith.tools.${tool.key}`) }}</span>
        </a>
      </div>
    </section>
  </div>
</template>

<style scoped>
.bw-support {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 18px 24px;
  padding: 22px 24px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, #72a4f2 42%, var(--c-border));
  background: linear-gradient(150deg, color-mix(in srgb, #72a4f2 13%, var(--c-surface)), var(--c-surface) 72%);
}
.bw-support-copy { flex: 1 1 300px; min-width: 240px; }
.bw-support-title { margin: 0; font-size: 17px; font-weight: 800; color: var(--c-text); }
.bw-support-body { margin: 6px 0 0; font-size: 13.5px; line-height: 1.5; color: var(--c-muted); max-width: 460px; }
.bw-kofi {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 12px 20px;
  border-radius: 11px;
  background: #72a4f2;
  color: #fff;
  font-weight: 700;
  font-size: 15px;
  text-decoration: none;
  box-shadow: 0 12px 26px -12px rgba(114, 164, 242, 0.7);
  transition: filter 0.15s ease, transform 0.15s ease;
}
.bw-kofi:hover { filter: brightness(1.07); transform: translateY(-1px); }
.bw-kofi svg { width: 22px; height: 22px; }

.bw-disclosure {
  margin: 0;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--c-border);
  background: var(--c-surface);
  color: var(--c-muted);
  font-size: 13px;
  line-height: 1.5;
}

@media (prefers-reduced-motion: reduce) {
  .bw-kofi:hover { transform: none; }
}

.bw-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}

.bw-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 22px 20px;
  border-radius: 16px;
  border: 1px solid var(--c-border);
  background: var(--c-surface);
  text-decoration: none;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}
.bw-card:hover {
  transform: translateY(-3px);
  border-color: var(--c-accent);
  box-shadow: var(--c-shadow, 0 18px 44px -16px rgba(104, 48, 168, 0.28));
}

.bw-logo {
  display: flex;
  align-items: center;
  height: 30px;
  color: var(--c-muted);
  transition: color 0.18s ease;
}
.bw-card:hover .bw-logo { color: var(--c-text); }
.bw-logo svg { height: 26px; width: auto; display: block; }
.bw-logo-img { height: 26px; width: auto; max-width: 150px; object-fit: contain; display: block; }
.bw-wordmark {
  font-family: "Space Grotesk", "Manrope", system-ui, sans-serif;
  font-weight: 700;
  font-size: 21px;
  letter-spacing: -0.5px;
}

.bw-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--c-text);
}
.bw-blurb {
  font-size: 13px;
  line-height: 1.5;
  color: var(--c-muted);
}

@media (prefers-reduced-motion: reduce) {
  .bw-card { transition: none; }
  .bw-card:hover { transform: none; }
}
</style>
