<script setup>
// ─────────────────────────────────────────────────────────────────────────────
// CardsPage.vue — the /cards search surface.
//
// The page has two states and the layout says which one you are in:
//
//   RESTING  no query, no filters, panel closed. The search bar is centred in
//            the viewport with worked examples under it — the page's only job
//            at that point is to take a card name, so the field IS the page.
//   ACTIVE   a search has run (or the filters panel is open). The bar rises to
//            the top, the result controls appear beneath it, and the grid fills
//            the room the hero gave up.
//
//   • Instantiates useCardSearch() — the SOLE async writer of the card list (KD-1).
//   • Filters live in ONE surface at every width: a panel under the bar, opened
//     by the Filters button that sits inside the bar's trailing edge.
//   • Deterministic EMPTY-FIRST render: no card data and no numeric count baked
//     into the prerendered HTML; init() fetches client-side in onMounted (KD-5).
//     RESTING is also the prerendered state, so the shell hydrates unchanged.
//   • useHead resolving meta.cards.* (aligned with App.vue's pattern).
// ─────────────────────────────────────────────────────────────────────────────
import { ref, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { useHead } from "@unhead/vue";
import { useCardSearch } from "@/composables/useCardSearch";
import CardYugi from "@/components/ui/card/CardYugi.vue";
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
  hasMore,
  setSort,
  setDensity,
  clearFilters,
  loadMore,
  update,
  init,
} = useCardSearch();

// ── SSG hydration guard (KD-5/KD-8) ──
// `isMounted` is false during SSR and on the very first client render, so any
// markup gated behind it (the result controls, the count, the skeletons) is
// absent from the prerendered HTML and the first client render alike — no
// hydration mismatch. It flips true only after mount.
const isMounted = ref(false);

// Filters panel open-state. One panel serves every width — there is no separate
// mobile surface — so this is also what the Filters button reflects.
const filtersOpen = ref(false);
const filtersBtn = ref(null);
const searchField = ref(null);

function closeFilters() {
  filtersOpen.value = false;
  // Escape returns the caret to the control that opened the panel rather than
  // dropping focus at the top of the document.
  filtersBtn.value?.focus();
}

// True when the page has neither a query nor an active filter → neutral empty
// state. NOTE: searchQuery/activeFilters are empty defaults during SSR and on
// first client render (init() hydrates them in onMounted), so this is
// deterministically `true` for the prerendered shell — empty-first render.
const isEmptyInitial = computed(
  () => !searchQuery.value?.trim() && !isFiltersActive.value
);

// The hero claims the viewport only while there is genuinely nothing else to
// show. Opening the filters panel counts as engaging with the page, so the bar
// lifts then too — otherwise a 600px panel would unfold under a bar sitting in
// the middle of the screen. Deterministically `true` for the prerendered shell.
const isResting = computed(() => isEmptyInitial.value && !filtersOpen.value);

// Worked examples for the resting state. The placeholder promises two syntaxes
// (a name or a set code); these demonstrate both. Literal values, not i18n
// keys — the card API matches English names in every locale (`fname`), so a
// translated example would return nothing.
const EXAMPLES = ["Dark Magician", "Blue-Eyes", "LOB-001"];

function applyExample(value) {
  searchQuery.value = value;
  update();
  // An example is a starting point, not a destination — leave the caret in the
  // field so it can be edited straight away.
  searchField.value?.focus();
}

// Localized label for the Filters button (count appended when active). Used as
// the accessible name — the visible button shows the count as a badge instead.
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

// Empty card outlines that stand in for the results grid while the page is
// resting — see the .cards-ghosts CSS for why they exist. 32 is what it takes
// to cover the widest breakpoint (8 columns x 4 rows at the 1280px page cap);
// narrower viewports simply clip the overflow.
const GHOSTS = Array.from({ length: 32 }, (_, i) => i);

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
  <div class="cards-page" :class="{ 'cards-page--resting': isResting }">
    <!-- Page heading — present in the prerendered HTML (static, indexable), but
         visually hidden: the search bar below already says what the page is for,
         and a heading repeating it would be a label on a label. -->
    <header class="cards-page__head">
      <h1 class="cards-page__title">{{ t("cards.title") }}</h1>
    </header>

    <!-- ── Search hero ──────────────────────────────────────────────────────
         Resting, this box is as tall as the viewport and centres the bar in it;
         active, its min-height collapses to nothing and the bar glides to the
         top. One transitioning property carries the whole move, which is why
         `justify-content: center` stays on in both states — flipping the
         alignment instead would teleport the bar rather than lift it. -->
    <div class="cards-hero">
      <!-- ── The grid, waiting ──
           The same geometry the results use — same columns, same 59:86 cells,
           same gap — drawn as empty outlines. It is not wallpaper: when a search
           runs these cells are exactly where the cards land, so the field reads
           as filling rather than as one thing being swapped for another. Purely
           decorative to a screen reader, and it never takes a click. -->
      <Transition name="ghosts">
        <div v-if="isResting" class="cards-ghosts" aria-hidden="true">
          <span v-for="n in GHOSTS" :key="`gh-${n}`" class="cards-ghosts__cell" />
        </div>
      </Transition>

      <!-- The search bar. It lives on this page rather than in the app chrome
           because this is the page that owns the search state: the input writes
           straight to the composable's `searchQuery`, so there is no second copy
           of the query to keep in step and no navigation hop between typing and
           seeing results. Safe to prerender — `searchQuery` is '' until init(),
           so the field renders empty on the server and on first hydration alike. -->
      <div class="cards-bar">
        <svg
          class="cards-bar__icon"
          width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" />
        </svg>
        <input
          ref="searchField"
          v-model="searchQuery"
          class="cards-bar__field"
          type="search"
          name="q"
          inputmode="search"
          autocomplete="off"
          :aria-label="t('cards.searchPlaceholder')"
          :placeholder="t('cards.searchPlaceholder')"
          @input="update"
        />

        <!-- Filter trigger, on the bar's trailing edge: both halves of "what am
             I looking for" belong to one control. Unlike the rest of the
             client-only chrome this IS prerendered — its label is static, and
             the count badge is gated on `activeCount`, which is 0 on the server
             and on first client render alike. -->
        <span class="cards-bar__rule" aria-hidden="true" />
        <button
          ref="filtersBtn"
          type="button"
          class="cards-bar__filters"
          :class="{ 'is-open': filtersOpen }"
          :aria-expanded="filtersOpen"
          aria-controls="cards-filter-panel"
          :aria-label="filtersButtonLabel"
          @click="filtersOpen = !filtersOpen"
          @keydown.esc="closeFilters"
        >
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
          >
            <path d="M3 5h18l-7 8v6l-4-2v-4z" />
          </svg>
          <span class="cards-bar__filters-label">{{ t("cards.filters.button") }}</span>
          <span v-if="activeCount > 0" class="cards-bar__count" aria-hidden="true">
            {{ activeCount }}
          </span>
        </button>
      </div>

      <!-- Resting hint. The placeholder promises two syntaxes; these examples
           demonstrate both, and clicking one runs it. -->
      <div v-if="isResting" class="cards-hint">
        <span>{{ t("cards.emptyState") }}</span>
        <span class="cards-hint__examples">
          <button
            v-for="example in EXAMPLES"
            :key="example"
            type="button"
            class="cards-hint__chip"
            @click="applyExample(example)"
          >
            {{ example }}
          </button>
        </span>
      </div>

      <!-- ── Filters panel ──
           One surface at every width, in flow directly under the bar so it
           reads as an extension of it. Capped at part of the viewport with its
           own scroll, which keeps the button that closes it on screen.
           Escape is handled here AND on the button, because after opening the
           panel focus is still on the button and that is the likeliest moment
           to press it. Clicking away deliberately does not close it: this is a
           section of the page, not a popup over it. -->
      <Transition name="panel">
        <div
          v-if="filtersOpen"
          id="cards-filter-panel"
          class="cards-panel"
          @keydown.esc="closeFilters"
        >
          <SearchFiltersPanel
            layout="sidebar"
            :filters="activeFilters"
            @update:filters="activeFilters = $event"
          />
        </div>
      </Transition>
    </div>

    <!-- ── Result controls ──
         Only once a search has been done: before that there is nothing to
         count, sort or lay out, and an empty toolbar is just furniture. -->
    <div v-if="isMounted && !isEmptyInitial" class="cards-toolbar">
      <span class="cards-count" aria-live="polite">{{ resultCountLabel }}</span>

      <div class="cards-toolbar__controls">
        <!-- Clear-all filters; shown only when a filter is set. -->
        <button
          v-if="isFiltersActive"
          type="button"
          class="cards-clear"
          @click="clearFilters"
        >
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2.4"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
          {{ t("search.filters.clear") }}
        </button>

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

    <!-- ── Zero-results state (AC-14) ──
         A query/filter ran and matched nothing. Distinct from the resting hero
         above, which is what "you haven't asked yet" looks like. -->
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
         `density` ref (comfortable vs compact = tile size / column count). -->
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
  </div>
</template>

<style scoped>
/* Selection accent = amethyst (brand primary). Hot-pink stays reserved for
   wishlist, lime for mutual matches — this page never borrows those roles. */
.cards-page {
  --sel: var(--c-trade);
  --sel-line: color-mix(in oklch, var(--c-trade) 48%, transparent);
  --sel-soft: color-mix(in oklch, var(--c-trade) 15%, transparent);
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px 16px 64px;
  color: var(--c-text);
}

/* Heading -------------------------------------------------------------------*/
/* Kept in the DOM for SEO/indexability, but visually hidden — the search bar
   is the page's own title (sr-only pattern). */
.cards-page__head {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Hero ----------------------------------------------------------------------*/
/* min-height is the ONLY property that changes between states: the box shrinks
   from viewport-tall to content-tall and the centred bar rides it upward. */
.cards-hero {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 0;
  transition: min-height 420ms cubic-bezier(0.22, 1, 0.36, 1);
}
/* The bar, the hint and the panel all sit above the ghost grid. */
.cards-hero > *:not(.cards-ghosts) {
  position: relative;
  z-index: 1;
}
/* 88px is this page's own vertical padding; the extra 24 lifts the group a
   touch above true centre, which is where the eye expects to find it. */
.cards-page--resting .cards-hero {
  min-height: calc(100vh - 112px);
}
@media (max-width: 639.98px) {
  /* Phones get a sticky navbar above the page, and it holds its place in flow —
     so the room left for the hero is that much shorter. */
  .cards-page--resting .cards-hero {
    min-height: calc(100vh - 240px);
  }
}

/* The grid, waiting ---------------------------------------------------------*/
/* Column track, cell shape and gap are copied from .cards-grid--grid on purpose:
   the outlines have to sit exactly where the results will. Overflow clips the
   surplus cells, so one fixed count covers every breakpoint. The mask dissolves
   the field towards the middle — the outlines belong at the edges of the eye,
   not behind the thing you are typing into. */
.cards-ghosts {
  position: absolute;
  inset: 0;
  z-index: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
  grid-auto-rows: min-content;
  gap: 18px;
  overflow: hidden;
  pointer-events: none;
  -webkit-mask-image: radial-gradient(
    ellipse 62% 46% at 50% 50%,
    transparent 0%,
    transparent 46%,
    #000 100%
  );
  mask-image: radial-gradient(
    ellipse 62% 46% at 50% 50%,
    transparent 0%,
    transparent 46%,
    #000 100%
  );
}
/* Second pass where it is supported: also dissolve the top and bottom edges,
   so the field never meets the edge of the viewport as a hard row of boxes.
   Without mask-composite the radial above still does the important half. */
@supports (mask-composite: intersect) {
  .cards-ghosts {
    mask-image:
      radial-gradient(
        ellipse 62% 46% at 50% 50%,
        transparent 0%,
        transparent 46%,
        #000 100%
      ),
      linear-gradient(to bottom, transparent 0%, #000 24%, #000 76%, transparent 100%);
    mask-composite: intersect;
  }
}
/* Mixed towards the page ground rather than dimmed with opacity, so the line
   lands at the same distance from the background in both themes — an opacity
   that reads as texture on white would vanish on the dark grape. */
.cards-ghosts__cell {
  aspect-ratio: 59 / 86;
  border: 1px solid color-mix(in oklch, var(--c-border) 42%, var(--c-bg));
  border-radius: 6px;
}
/* The outlines are the only thing on the page that fades rather than moves:
   the hero is collapsing underneath them at the same time, so a fade is all
   that is needed to hand the space over to the real cards. */
.ghosts-enter-active,
.ghosts-leave-active {
  transition: opacity 260ms ease-out;
}
.ghosts-enter-from,
.ghosts-leave-to {
  opacity: 0;
}

/* Phones sit this out. The results grid is two columns wide there, so the
   ghosts would be two enormous outlines rather than a field of cards — and a
   narrow screen was never the one that felt empty: the bar and its examples
   already fill most of it. */
@media (max-width: 639.98px) {
  .cards-ghosts { display: none; }
}

/* Search bar ---------------------------------------------------------------*/
.cards-bar {
  display: flex;
  align-items: center;
  width: 100%;
  max-width: 720px;
  padding: 0 8px 0 20px;
  border-radius: 18px;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  transition: border-color 0.16s ease-out, box-shadow 0.16s ease-out;
}
.cards-bar:focus-within {
  border-color: var(--sel);
  box-shadow: 0 0 0 4px var(--sel-soft);
}
.cards-bar__icon {
  color: var(--c-muted);
  flex: none;
}
.cards-bar__field {
  flex: 1 1 auto;
  min-width: 0;
  padding: 19px 14px;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--c-text);
  font-size: 1.125rem;
  font-weight: 500;
  letter-spacing: 0.01em;
}
.cards-bar__field::placeholder { color: var(--c-muted); }
/* The type=search clear affordance ships with its own look per engine; the
   field already has a visible border and icon, so drop it. */
.cards-bar__field::-webkit-search-cancel-button { -webkit-appearance: none; }

.cards-bar__rule {
  flex: none;
  width: 1px;
  height: 26px;
  margin-right: 8px;
  background: var(--c-border);
}
.cards-bar__filters {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: none;
  height: 44px;
  padding: 0 16px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--c-muted);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: background-color 0.16s ease-out, color 0.16s ease-out;
}
.cards-bar__filters:hover {
  background: var(--c-surface-2);
  color: var(--c-text);
}
.cards-bar__filters.is-open {
  background: var(--sel-soft);
  color: var(--c-text);
}
.cards-bar__filters:focus-visible {
  outline: 2px solid var(--sel-line);
  outline-offset: 2px;
}
.cards-bar__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 9999px;
  background: var(--sel);
  color: var(--c-on-accent);
  font-size: 0.6875rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
@media (max-width: 559.98px) {
  /* Below this the label costs the field more room than it earns; the button
     keeps its accessible name either way. Every horizontal padding tightens
     with it — at 375px the placeholder needs all of the width it can get. */
  .cards-bar__filters-label { display: none; }
  .cards-bar__filters { padding: 0 10px; }
  .cards-bar { padding: 0 6px 0 12px; }
  .cards-bar__rule { margin-right: 6px; }
  .cards-bar__field { padding: 16px 8px 16px 10px; font-size: 1rem; }
}

/* Resting hint + worked examples --------------------------------------------*/
.cards-hint {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 10px 12px;
  max-width: 720px;
  margin-top: 20px;
  font-size: 0.875rem;
  color: var(--c-muted);
  text-align: center;
}
.cards-hint__examples {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
.cards-hint__chip {
  padding: 5px 13px;
  border-radius: 9999px;
  border: 1px solid var(--c-border);
  background: transparent;
  color: var(--c-muted);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.16s ease-out, color 0.16s ease-out, background-color 0.16s ease-out;
}
.cards-hint__chip:hover {
  border-color: var(--sel);
  background: var(--sel-soft);
  color: var(--c-text);
}
.cards-hint__chip:focus-visible {
  outline: 2px solid var(--sel-line);
  outline-offset: 2px;
}

/* Filters panel -------------------------------------------------------------*/
.cards-panel {
  width: 100%;
  max-width: 720px;
  margin-top: 12px;
  border-radius: 18px;
  border: 1px solid var(--c-border);
  background: var(--c-surface);
  max-height: min(62vh, 620px);
  overflow-y: auto;
  overscroll-behavior: contain;
}
/* The panel component was drawn for a 272px sidebar — one long column. Given
   the bar's full width it reads better as two, which also halves how far the
   results are pushed down. Multi-column rather than grid: the filter groups
   are wildly different heights, and grid rows would align them and leave holes.
   `break-inside: avoid` keeps a group whole; the rule between sections spans
   both columns. Falls back to one column under 640px on its own. */
.cards-panel :deep(.body) {
  display: block;
  columns: 2;
  column-gap: 32px;
}
.cards-panel :deep(.group) {
  break-inside: avoid;
  margin-bottom: 18px;
}
.cards-panel :deep(.divider) {
  column-span: all;
  margin-bottom: 18px;
}
@media (max-width: 639.98px) {
  .cards-panel :deep(.body) { columns: 1; }
}
.panel-enter-active,
.panel-leave-active {
  transition: opacity 0.16s ease-out, transform 0.16s ease-out;
}
.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* Result controls -----------------------------------------------------------*/
.cards-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 28px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--c-border);
}
.cards-count {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--c-text);
  font-variant-numeric: tabular-nums;
}
.cards-toolbar__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}

/* Clear-filters button -----------------------------------------------------*/
.cards-clear {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid var(--c-border);
  background-color: var(--c-surface);
  color: var(--c-muted);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.16s ease-out, color 0.16s ease-out, background-color 0.16s ease-out;
}
.cards-clear:hover {
  border-color: var(--sel);
  color: var(--c-text);
  background-color: color-mix(in oklch, var(--sel) 12%, var(--c-surface));
}
.cards-clear:focus-visible {
  outline: 2px solid var(--sel-line);
  outline-offset: 2px;
  border-color: var(--sel);
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

/* Results grid -------------------------------------------------------------*/
/* Auto-fill keeps the column count responsive; the min track width is the
   only thing that changes between densities (tile size → effective columns). */
.cards-grid {
  display: grid;
  gap: 18px;
  margin-top: 24px;
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
  padding-top: 28px;
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

/* Zero-results state --------------------------------------------------------*/
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

/* Respect reduced-motion: the hero lift and the panel reveal are the two
   deliberate motions here; both become instant state changes. -------------*/
@media (prefers-reduced-motion: reduce) {
  .cards-hero,
  .cards-bar,
  .ghosts-enter-active,
  .ghosts-leave-active,
  .cards-bar__filters,
  .cards-hint__chip,
  .cards-clear,
  .cards-select__field,
  .cards-density__btn,
  .cards-loadmore__btn,
  .panel-enter-active,
  .panel-leave-active {
    transition: none;
  }
  .cards-skeleton {
    animation: none;
  }
}
</style>
