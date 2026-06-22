<script setup>
// ─────────────────────────────────────────────────────────────────────────────
// CardsPage.vue — dedicated /cards search/browse surface (cardcluster-style).
//
//   • CSS-grid shell (sticky left sidebar + results area), pure CSS (KD-8).
//   • Instantiates useCardSearch() — the SOLE async writer of the card list (KD-1).
//   • Mobile filters via a `v-dialog fullscreen`, opened by a Filters button that
//     is gated on `isMounted` so it never renders during SSG (KD-8).
//   • Deterministic EMPTY-FIRST render: no card data and no numeric count baked
//     into the prerendered HTML; init() fetches client-side in onMounted (KD-5).
//   • useHead resolving meta.cards.* (aligned with App.vue's pattern).
//   • STEP 4b: results grid (CardYugi tiles + SEO anchors), results header
//     (count gated behind isMounted + active-filter chips), sort control,
//     density toggle, loading skeletons, zero-results state, "Load more".
// ─────────────────────────────────────────────────────────────────────────────
import { ref, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { useHead } from "@unhead/vue";
import { useCardSearch } from "@/composables/useCardSearch";
import CardYugi from "@/components/CardYugi.vue";
import SearchFiltersPanel from "./search/SearchFiltersPanel.vue";

const { t } = useI18n();
const route = useRoute();

// Forward CardYugi's overlay events up to App.vue's RouterView handlers
// (same contract as Search.vue) so add-to-pile / wishlist auth flow works.
defineEmits(["TradeCenter", "requireAuth"]);

// ── Single source of truth + single async writer (instantiated EXACTLY once).
// The navbar deliberately does NOT instantiate this (KD-1, KD-2).
const {
  searchQuery,
  activeFilters,
  cards,
  totalRows,
  loading,
  sort,
  density,
  isFiltersActive,
  activeCount,
  activeChips,
  hasMore,
  setSort,
  setDensity,
  loadMore,
  init,
} = useCardSearch();

// ── SSG hydration guard (KD-5/KD-8) ──
// `isMounted` is false during SSR and on the very first client render, so any
// markup gated behind it (the mobile Filters button, the v-dialog, the dynamic
// count) is absent from the prerendered HTML and the first client render alike —
// no hydration mismatch. It flips true only after mount.
const isMounted = ref(false);

// Mobile filter dialog open-state (only ever toggled client-side).
const filtersDialogOpen = ref(false);

// True when the page has neither a query nor an active filter → neutral empty
// state. NOTE: searchQuery/activeFilters are empty defaults during SSR and on
// first client render (init() hydrates them in onMounted), so this is
// deterministically `true` for the prerendered shell — empty-first render.
const isEmptyInitial = computed(
  () => !searchQuery.value?.trim() && !isFiltersActive.value
);

// Localized label for the mobile Filters button (count appended when active).
const filtersButtonLabel = computed(() =>
  activeCount.value > 0
    ? t("cards.filters.buttonWithCount", { count: activeCount.value })
    : t("cards.filters.button")
);

// ── Sort control (KD-3) ──
// Fields map straight to the composable's sort ref → setSort() → server-side
// `sort=` (descending fields reversed client-side). Labels carry the
// "high → low" wording for atk/def/level via the i18n bundle.
const SORT_OPTIONS = ["name", "level", "atk", "def", "new"];
const sortOptions = computed(() =>
  SORT_OPTIONS.map((value) => ({ value, label: t(`cards.sort.${value}`) }))
);

// ── Results count (KD-5) ──
// Prefer the API-reported total (meta.total_rows surfaced as totalRows); fall
// back to the loaded-so-far length. Rendered ONLY behind `isMounted` so the
// prerendered/0 value never mismatches the client. AC-8 / AC-14.
const resultCount = computed(() =>
  totalRows.value > 0 ? totalRows.value : cards.value.length
);
const resultCountLabel = computed(() =>
  t("cards.results.count", resultCount.value, { count: resultCount.value })
);

// True once a query/filter has run and yielded zero rows — distinct from the
// neutral empty-initial state (AC-14 vs AC-16). Only meaningful client-side.
const isNoResults = computed(
  () => !isEmptyInitial.value && !loading.value && cards.value.length === 0
);

// ── Localized active-filter chips ──
// The composable's chips carry RAW values + a clear() (it has no i18n). We
// localize each label here. Kind/category/spell/trap/race map to existing
// search.* dictionaries; numeric comparators read as "≥ 8" / "= 4" / "≤ 2";
// attributes/link-arrows fall back to their (already human) raw token.
const CMP_SYMBOL = { gte: "≥", eq: "=", lte: "≤" };
const chipLabel = (chip) => {
  const raw = chip.label;
  switch (chip.id) {
    case "kind":
      return t(`search.kind.${raw}`, raw);
    case "cat":
      return t(`search.category.${raw}`, raw);
    case "sp":
      return t(`search.spellType.${raw}`, raw);
    case "tr":
      return t(`search.trapType.${raw}`, raw);
    case "race":
      return t(`search.race.${raw}`, raw);
    default: {
      // Comparator chips arrive as "gte 8" / "eq 4" / "lte 2".
      const m = /^(gte|eq|lte)\s+(.+)$/.exec(raw);
      if (m) return `${CMP_SYMBOL[m[1]]} ${m[2]}`;
      return raw; // attribute / link-arrow tokens are already display-ready
    }
  }
};

// Fixed-count skeleton placeholders shown while loading (CLS-safe 59:86).
const SKELETONS = Array.from({ length: 12 }, (_, i) => i);

// ── SEO head (runs during SSR — resolves meta.cards.* by route.name) ──
// App.vue's global useHead already auto-resolves meta.<route.name>.* for the
// canonical/og/hreflang block; this page-level useHead keeps the title/desc
// self-sufficient and aligned, using the same locale-aware t() pattern.
useHead(
  computed(() => {
    const loc = route.params?.locale || "en";
    const title = t("meta.cards.title", {}, { locale: loc });
    const desc = t("meta.cards.desc", {}, { locale: loc });
    return {
      title,
      meta: [
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
      ],
    };
  })
);

// ── Client-only bootstrap (KD-5) ──
// init() hydrates state from route.query and fetches ONLY when a query or an
// active filter is present. A bare /cards triggers zero network calls (AC-16).
onMounted(() => {
  isMounted.value = true;
  init();
});
</script>

<template>
  <div class="cards-page">
    <!-- Page heading — present in the prerendered HTML (static, indexable). -->
    <header class="cards-page__head">
      <h1 class="cards-page__title">{{ t("cards.title") }}</h1>
    </header>

    <!-- CSS-grid shell: sidebar + results. Pure CSS — collapses to one column
         below 960px (see <style>). No Vuetify layout component (KD-8). -->
    <div class="cards-layout">
      <!-- ── Desktop sticky sidebar ── -->
      <aside class="cards-sidebar" :aria-label="t('cards.filters.button')">
        <SearchFiltersPanel
          layout="sidebar"
          :filters="activeFilters"
          @update:filters="activeFilters = $event"
        />
      </aside>

      <!-- ── Results area ── -->
      <main class="cards-results">
        <!-- Results toolbar: mobile Filters trigger + (S4b) count / sort /
             density. The Filters button is gated on `isMounted` so it is absent
             from the prerendered HTML and the first client render (KD-8). -->
        <div class="cards-toolbar">
          <button
            v-if="isMounted"
            type="button"
            class="cards-filters-btn"
            @click="filtersDialogOpen = true"
          >
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
            >
              <path d="M3 5h18l-7 8v6l-4-2v-4z" />
            </svg>
            {{ filtersButtonLabel }}
          </button>

          <!-- Result count — gated on `isMounted` so the prerendered/0 value
               never disagrees with the client (KD-5). Hidden in the neutral
               empty-initial state (no query/filter). -->
          <span
            v-if="isMounted && !isEmptyInitial"
            class="cards-count"
            aria-live="polite"
          >
            {{ resultCountLabel }}
          </span>

          <!-- Push sort + density to the trailing edge. -->
          <div class="cards-toolbar__controls">
            <!-- Sort control (KD-3). Native <select> = keyboard-operable with a
                 visible focus ring; descending fields are labeled "high → low". -->
            <label class="cards-select">
              <span class="cards-select__label">{{ t("cards.sort.label") }}</span>
              <select
                class="cards-select__field"
                :value="sort"
                @change="setSort($event.target.value)"
              >
                <option
                  v-for="opt in sortOptions"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </option>
              </select>
            </label>

            <!-- Density toggle (AC-9): comfortable (grid) vs compact. Reflected
                 in the URL by the composable (`vw`); no refetch. -->
            <div
              class="cards-density"
              role="group"
              :aria-label="t('cards.density.label')"
            >
              <button
                type="button"
                class="cards-density__btn"
                :class="{ 'is-active': density === 'grid' }"
                :aria-pressed="density === 'grid'"
                @click="setDensity('grid')"
              >
                <svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
                >
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
                {{ t("cards.density.comfortable") }}
              </button>
              <button
                type="button"
                class="cards-density__btn"
                :class="{ 'is-active': density === 'compact' }"
                :aria-pressed="density === 'compact'"
                @click="setDensity('compact')"
              >
                <svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
                >
                  <rect x="3" y="3" width="4" height="4" rx="0.5" />
                  <rect x="10" y="3" width="4" height="4" rx="0.5" />
                  <rect x="17" y="3" width="4" height="4" rx="0.5" />
                  <rect x="3" y="10" width="4" height="4" rx="0.5" />
                  <rect x="10" y="10" width="4" height="4" rx="0.5" />
                  <rect x="17" y="10" width="4" height="4" rx="0.5" />
                  <rect x="3" y="17" width="4" height="4" rx="0.5" />
                  <rect x="10" y="17" width="4" height="4" rx="0.5" />
                  <rect x="17" y="17" width="4" height="4" rx="0.5" />
                </svg>
                {{ t("cards.density.compact") }}
              </button>
            </div>
          </div>
        </div>

        <!-- Active-filter summary — removable chips built from the composable's
             activeChips (raw values + clear()); localized here via chipLabel().
             Gated on `isMounted` since filters hydrate client-side (AC-8). -->
        <div
          v-if="isMounted && activeChips.length"
          class="cards-chips"
          :aria-label="t('cards.filters.activeLabel')"
        >
          <span
            v-for="chip in activeChips"
            :key="chip.id"
            class="cards-chip"
          >
            {{ chipLabel(chip) }}
            <button
              type="button"
              class="cards-chip__x"
              :aria-label="`✕ ${chipLabel(chip)}`"
              @click="chip.clear()"
            >
              <svg
                width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2.5"
                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </span>
        </div>

        <!-- Neutral empty-initial state: no query and no filters. No skeletons,
             no count — deterministic in the prerendered shell (KD-5/AC-16). -->
        <section
          v-if="isEmptyInitial"
          class="cards-empty"
          aria-live="polite"
        >
          <svg
            class="cards-empty__icon"
            width="40" height="40" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="1.5"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <p class="cards-empty__text">{{ t("cards.emptyState") }}</p>
        </section>

        <!-- ── Zero-results state (AC-14) ──
             A query/filter ran and matched nothing. Distinct from the neutral
             empty-initial state above. -->
        <section
          v-if="isMounted && isNoResults"
          class="cards-empty"
          aria-live="polite"
        >
          <svg
            class="cards-empty__icon"
            width="40" height="40" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="1.5"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
            <path d="M8 11h6" />
          </svg>
          <p class="cards-empty__text">{{ t("cards.results.noResults") }}</p>
        </section>

        <!-- ── Results grid ──
             CardYugi tiles + the SEO anchor pattern (copied from Search.vue):
             an absolutely-positioned, pointer-events-none <a> gives crawlers a
             followable link to the card permalink without intercepting the
             clicks that open CardYugi's overlay. The grid density follows the
             `density` ref (comfortable vs compact = tile size / column count).
             Hidden while the initial load shows skeletons. -->
        <section
          v-if="cards.length"
          class="cards-grid"
          :class="`cards-grid--${density}`"
        >
          <div v-for="card in cards" :key="card.id" class="cards-grid__cell">
            <a
              :href="`/${route.params.locale || 'en'}/card/${card.id}`"
              :aria-label="card.name"
              class="absolute inset-0 z-0 pointer-events-none"
              tabindex="-1"
            />
            <CardYugi
              :componentCard="card"
              @showTraders="$emit('TradeCenter', $event)"
              @requireAuth="$emit('requireAuth')"
            />
          </div>
        </section>

        <!-- ── Loading skeletons (CLS-safe 59:86) ──
             Shown while a request is in flight. On an append (Load more) the
             existing grid stays mounted above and these sit beneath it. -->
        <section
          v-if="isMounted && loading"
          class="cards-grid"
          :class="`cards-grid--${density}`"
          aria-hidden="true"
        >
          <div
            v-for="n in SKELETONS"
            :key="`sk-${n}`"
            class="cards-skeleton"
          />
        </section>

        <!-- ── Load more (KD-4 / AC-7 / AC-17) ──
             Appends the next page via the composable; disappears once the full
             result set is loaded (cards.length >= totalRows). Disabled while a
             request is in flight to prevent duplicate/phantom loads. -->
        <div v-if="isMounted && hasMore" class="cards-loadmore">
          <button
            type="button"
            class="cards-loadmore__btn"
            :disabled="loading"
            @click="loadMore()"
          >
            {{ t("cards.loadMore") }}
          </button>
        </div>
      </main>
    </div>

    <!-- ── Mobile filters dialog (KD-8) ──
         v-dialog teleports to <body> and only renders its contents once opened,
         so it is always client-side — no window.innerWidth read on mount, no
         hydration mismatch. Hosts the SAME SearchFiltersPanel as the sidebar. -->
    <v-dialog
      v-if="isMounted"
      v-model="filtersDialogOpen"
      fullscreen
      transition="dialog-bottom-transition"
    >
      <div class="cards-dialog">
        <div class="cards-dialog__bar">
          <span class="cards-dialog__title">{{ filtersButtonLabel }}</span>
          <button
            type="button"
            class="cards-dialog__close"
            :aria-label="t('cards.filters.button')"
            @click="filtersDialogOpen = false"
          >
            <svg
              width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="cards-dialog__body">
          <SearchFiltersPanel
            layout="sidebar"
            :filters="activeFilters"
            @update:filters="activeFilters = $event"
          />
        </div>
      </div>
    </v-dialog>
  </div>
</template>

<style scoped>
/* Selection accent = amethyst (brand primary). Hot-pink stays reserved for
   wishlist, lime for mutual matches — this page never borrows those roles. */
.cards-page {
  --sel: var(--c-trade);
  --sel-line: color-mix(in oklch, var(--c-trade) 48%, transparent);

  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px 16px 64px;
  color: var(--c-text);
}

/* Heading -------------------------------------------------------------------*/
.cards-page__head {
  margin-bottom: 20px;
}
.cards-page__title {
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--c-text);
}

/* Grid shell ----------------------------------------------------------------*/
/* Desktop: fixed sidebar column + fluid results. Collapses to one column on
   narrow viewports. Pure CSS — renders identically under SSG (KD-8). */
.cards-layout {
  display: grid;
  grid-template-columns: 272px 1fr;
  gap: 28px;
  align-items: start;
}

.cards-sidebar {
  position: sticky;
  top: 72px;             /* clears the sticky navbar */
  align-self: start;
  /* The sidebar can grow tall; let it scroll independently of the page. */
  max-height: calc(100vh - 96px);
  overflow-y: auto;
}

/* Below ~960px the sidebar collapses; filters move into the mobile dialog. */
@media (max-width: 960px) {
  .cards-layout {
    grid-template-columns: 1fr;
  }
  .cards-sidebar {
    display: none;
  }
}

/* Results area --------------------------------------------------------------*/
.cards-results {
  min-width: 0;          /* allow the grid track to shrink (prevents overflow) */
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.cards-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  min-height: 40px;      /* reserve space so the toolbar doesn't shift on mount */
}

/* Result count -------------------------------------------------------------*/
.cards-count {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--c-text);
  font-variant-numeric: tabular-nums;
}

/* Sort + density cluster pinned to the trailing edge. */
.cards-toolbar__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}

/* Sort <select> ------------------------------------------------------------*/
.cards-select {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.cards-select__label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--c-muted);
}
.cards-select__field {
  appearance: none;
  -webkit-appearance: none;
  padding: 8px 30px 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--c-border);
  background-color: var(--c-surface);
  /* Chevron drawn with a tinted SVG so it follows the muted token. */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 9px center;
  color: var(--c-text);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.16s ease-out;
}
.cards-select__field:hover {
  border-color: var(--sel);
}
.cards-select__field:focus-visible {
  outline: 2px solid var(--sel-line);
  outline-offset: 2px;
  border-color: var(--sel);
}

/* Density toggle (segmented) -----------------------------------------------*/
.cards-density {
  display: inline-flex;
  border-radius: 10px;
  border: 1px solid var(--c-border);
  background: var(--c-surface);
  overflow: hidden;
}
.cards-density__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--c-muted);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.16s ease-out, color 0.16s ease-out;
}
.cards-density__btn + .cards-density__btn {
  border-left: 1px solid var(--c-border);
}
.cards-density__btn:hover {
  color: var(--c-text);
}
.cards-density__btn.is-active {
  /* Amethyst selection (brand primary) — never hot-pink/lime here. */
  background: color-mix(in oklch, var(--sel) 18%, transparent);
  color: var(--c-text);
}
.cards-density__btn:focus-visible {
  outline: 2px solid var(--sel-line);
  outline-offset: -2px;
}

/* Active-filter chips ------------------------------------------------------*/
.cards-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.cards-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 6px 5px 12px;
  border-radius: 9999px;
  border: 1px solid var(--sel-line);
  background: color-mix(in oklch, var(--sel) 12%, transparent);
  color: var(--c-text);
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.2;
}
.cards-chip__x {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 9999px;
  border: none;
  background: transparent;
  color: var(--c-muted);
  cursor: pointer;
  transition: background-color 0.16s ease-out, color 0.16s ease-out;
}
.cards-chip__x:hover {
  background: color-mix(in oklch, var(--sel) 22%, transparent);
  color: var(--c-text);
}
.cards-chip__x:focus-visible {
  outline: 2px solid var(--sel-line);
  outline-offset: 1px;
}

/* Results grid -------------------------------------------------------------*/
/* Auto-fill keeps the column count responsive; the min track width is the
   only thing that changes between densities (tile size → effective columns). */
.cards-grid {
  display: grid;
  gap: 18px;
}
.cards-grid--grid {
  grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
}
.cards-grid--compact {
  grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
  gap: 12px;
}
.cards-grid__cell {
  position: relative;
}
/* CardYugi renders a fixed-height thumbnail (Tailwind `h-48` ≈ 132px wide via the
   59:86 aspect). Left as-is it overflows the comfortable column (min 128px) and
   gets clipped, and density can't resize it. Make the thumbnail fill the cell so
   it scales with the chosen density; the inline `aspect-ratio: 59/86` keeps the
   card proportions (no cropping). The overlay image is teleported to <body>, so
   this only targets the in-grid thumbnail. */
.cards-grid__cell :deep(.w-fit) {
  width: 100%;
}
.cards-grid__cell :deep(img) {
  width: 100%;
  height: auto;
  display: block;
}

/* Loading skeleton (fixed 59:86 so the grid reserves space — CLS-safe) -----*/
.cards-skeleton {
  aspect-ratio: 59 / 86;
  border-radius: 6px;
  background: var(--c-surface-2);
  animation: cards-skeleton-pulse 1.4s ease-in-out infinite;
}
@keyframes cards-skeleton-pulse {
  0%, 100% { opacity: 0.55; }
  50%      { opacity: 0.9; }
}

/* Load more ----------------------------------------------------------------*/
.cards-loadmore {
  display: flex;
  justify-content: center;
  padding-top: 8px;
}
.cards-loadmore__btn {
  padding: 11px 28px;
  border-radius: 9999px;
  border: 1px solid var(--c-border);
  background: var(--c-surface);
  color: var(--c-text);
  font: inherit;
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.16s ease-out, border-color 0.16s ease-out;
}
.cards-loadmore__btn:hover:not(:disabled) {
  background: var(--c-surface-2);
  border-color: var(--sel);
}
.cards-loadmore__btn:focus-visible {
  outline: 2px solid var(--sel-line);
  outline-offset: 2px;
}
.cards-loadmore__btn:disabled {
  opacity: 0.55;
  cursor: default;
}

/* Mobile Filters button (only rendered when isMounted; hidden ≥ 960px) ------*/
.cards-filters-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  border-radius: 9999px;
  border: 1px solid var(--c-border);
  background: var(--c-surface);
  color: var(--c-text);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.16s ease-out, border-color 0.16s ease-out;
}
.cards-filters-btn:hover {
  background: var(--c-surface-2);
  border-color: var(--sel);
}
.cards-filters-btn:focus-visible {
  outline: 2px solid var(--sel-line);
  outline-offset: 2px;
}
@media (min-width: 961px) {
  /* On desktop the sidebar is always visible, so the dialog trigger is hidden. */
  .cards-filters-btn {
    display: none;
  }
}

/* Empty-initial state -------------------------------------------------------*/
.cards-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 64px 24px;
  text-align: center;
}
.cards-empty__icon {
  color: var(--c-muted);
  opacity: 0.7;
}
.cards-empty__text {
  max-width: 36ch;
  font-size: 0.9375rem;
  line-height: 1.55;
  color: var(--c-muted);
}

/* Mobile filters dialog -----------------------------------------------------*/
.cards-dialog {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--c-bg);
  color: var(--c-text);
}
.cards-dialog__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--c-border);
  position: sticky;
  top: 0;
  background: var(--c-bg);
  z-index: 1;
}
.cards-dialog__title {
  font-size: 0.9375rem;
  font-weight: 700;
  letter-spacing: 0.01em;
}
.cards-dialog__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 9999px;
  border: none;
  background: transparent;
  color: var(--c-muted);
  cursor: pointer;
  transition: background-color 0.16s ease-out, color 0.16s ease-out;
}
.cards-dialog__close:hover {
  background: var(--c-surface-2);
  color: var(--c-text);
}
.cards-dialog__close:focus-visible {
  outline: 2px solid var(--sel-line);
  outline-offset: 2px;
}
.cards-dialog__body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

/* Respect reduced-motion: kill the non-essential transitions above. ---------*/
@media (prefers-reduced-motion: reduce) {
  .cards-filters-btn,
  .cards-dialog__close,
  .cards-select__field,
  .cards-density__btn,
  .cards-chip__x,
  .cards-loadmore__btn {
    transition: none;
  }
  .cards-skeleton {
    animation: none;
  }
}
</style>
