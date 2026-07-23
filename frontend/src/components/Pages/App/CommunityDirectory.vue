<script setup>
// Community directory: stores, Discord servers and groups. Filter state is
// kept in the URL (kind/country/remote/search) so a shared link reproduces
// the same view; `page` is tracked separately from the rest of the filters
// so paging never gets caught by the "any filter changed -> reset to page 0"
// logic below.
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useHead } from "@unhead/vue";
import { fetchDirectory } from "@/lib/community";
import { toQueryParams, fromQueryParams } from "@/lib/communityFilters";
import { COUNTRIES } from "@/lib/countries";
import CommunityCard from "@/components/community/CommunityCard.vue";

const PAGE_SIZE = 24;

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const initial = fromQueryParams(route.query);
const filters = reactive({
  kind: initial.kind,
  country: initial.country,
  region: initial.region,
  remoteDuel: initial.remoteDuel,
  q: initial.q,
});
const page = ref(Math.max(0, initial.page));

// Local draft for the search box so typing doesn't fire a request per
// keystroke; committed into `filters.q` after a short pause.
const searchDraft = ref(initial.q);

const rows = ref([]);
const count = ref(0);
const loading = ref(true);

const totalPages = computed(() => Math.max(1, Math.ceil(count.value / PAGE_SIZE)));

const KIND_OPTIONS = computed(() => [
  { value: "",        label: t("community.kindAll") },
  { value: "store",   label: t("community.kindStore") },
  { value: "discord", label: t("community.kindDiscord") },
  { value: "group",   label: t("community.kindGroup") },
]);

// Bumped on every load(); a response only commits if it's still the most
// recent request, so a slow earlier fetch can never clobber a later one.
let requestId = 0;

async function load() {
  const myRequest = ++requestId;
  loading.value = true;
  try {
    const { rows: r, count: c } = await fetchDirectory({ ...filters, page: page.value, pageSize: PAGE_SIZE });
    if (myRequest !== requestId) return;
    rows.value = r;
    count.value = c;

    // If the requested page is past the last valid page (e.g. a filter
    // change shrank the result set, or a stale/tampered URL), snap back to
    // the last valid page and refetch once. After snapping, page.value ===
    // lastPage, so this condition is false on the next run and the
    // recursion terminates.
    const lastPage = c > 0 ? Math.ceil(c / PAGE_SIZE) - 1 : 0;
    if (page.value > lastPage) {
      page.value = lastPage;
      syncUrl();
      return load();
    }
  } catch (e) {
    if (myRequest !== requestId) return;
    console.error("CommunityDirectory: fetchDirectory failed", e);
    rows.value = [];
    count.value = 0;
  } finally {
    if (myRequest === requestId) loading.value = false;
  }
}

function syncUrl() {
  router.replace({ query: toQueryParams({ ...filters, page: page.value }) });
}

// Any real filter change resets to page 0. This only fires for kind/country/
// region/remoteDuel/q since `page` is a separate ref below.
watch(filters, () => {
  page.value = 0;
  syncUrl();
  load();
}, { deep: true });

watch(page, () => {
  syncUrl();
  load();
});

let searchTimer = null;
watch(searchDraft, (v) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { filters.q = v.trim(); }, 350);
});
onBeforeUnmount(() => clearTimeout(searchTimer));

function toggleRemote() {
  filters.remoteDuel = !filters.remoteDuel;
}

function goToPage(p) {
  if (p < 0 || p >= totalPages.value) return;
  page.value = p;
}

// Task 9 wires the real create dialog (CommunityEditDialog, create mode).
// Placeholder no-op for now so the button has something to call.
function openCreate() {}

useHead(computed(() => {
  const loc = route.params?.locale || "en";
  const title = t("community.directoryTitle", {}, { locale: loc });
  const desc = t("community.directorySubtitle", {}, { locale: loc });
  return { title, meta: [{ name: "description", content: desc }] };
}));

onMounted(load);
</script>

<template>
  <div class="cd-page">

    <!-- Header -->
    <div class="cd-header">
      <div class="cd-header__text">
        <h1 class="cd-title">{{ t('community.directoryTitle') }}</h1>
        <p class="cd-subtitle">{{ t('community.directorySubtitle') }}</p>
      </div>
      <button type="button" class="btn-new" @click="openCreate">
        <v-icon icon="mdi-plus" size="18" />
        {{ t('community.addYours') }}
      </button>
    </div>

    <!-- Filter bar -->
    <div class="toolbar">
      <div class="search-wrap">
        <v-icon icon="mdi-magnify" size="17" class="search-icon" />
        <input
          v-model="searchDraft"
          type="text"
          :placeholder="t('community.searchPlaceholder')"
          class="search-input"
        />
      </div>

      <div class="filter-group" role="group">
        <button
          v-for="opt in KIND_OPTIONS"
          :key="opt.value"
          type="button"
          class="filter-btn"
          :class="{ 'filter-btn--active': filters.kind === opt.value }"
          :aria-pressed="filters.kind === opt.value"
          @click="filters.kind = opt.value"
        >{{ opt.label }}</button>
      </div>

      <label class="cd-select">
        <span class="cd-select__label">{{ t('community.filterCountry') }}</span>
        <select v-model="filters.country" class="cd-select__field">
          <option value="">{{ t('community.kindAll') }}</option>
          <option v-for="c in COUNTRIES" :key="c.code" :value="c.name">{{ c.flag }} {{ c.name }}</option>
        </select>
      </label>

      <button
        type="button"
        class="remote-toggle"
        :class="{ 'remote-toggle--active': filters.remoteDuel }"
        :aria-pressed="filters.remoteDuel"
        @click="toggleRemote"
      >
        <v-icon icon="mdi-web" size="15" />
        {{ t('community.remoteDuel') }}
      </button>
    </div>

    <!-- Loading skeleton -->
    <div v-if="loading" class="cd-grid">
      <div v-for="i in 8" :key="i" class="skeleton-card" />
    </div>

    <!-- Empty -->
    <div v-else-if="rows.length === 0" class="state-center">
      <div class="state-icon">
        <v-icon icon="mdi-storefront-outline" size="44" style="color: var(--c-muted)" />
      </div>
      <p class="state-title">{{ t('community.empty') }}</p>
      <button type="button" class="btn-new" @click="openCreate">
        <v-icon icon="mdi-plus" size="18" />
        {{ t('community.addYours') }}
      </button>
    </div>

    <!-- Grid -->
    <div v-else class="cd-grid">
      <CommunityCard v-for="c in rows" :key="c.id" :community="c" />
    </div>

    <!-- Pagination -->
    <div v-if="!loading && rows.length > 0 && totalPages > 1" class="cd-pagination">
      <button type="button" class="page-btn" :disabled="page <= 0" @click="goToPage(page - 1)">
        <v-icon icon="mdi-chevron-left" size="20" />
      </button>
      <span class="page-indicator">{{ page + 1 }} / {{ totalPages }}</span>
      <button type="button" class="page-btn" :disabled="page >= totalPages - 1" @click="goToPage(page + 1)">
        <v-icon icon="mdi-chevron-right" size="20" />
      </button>
    </div>

  </div>
</template>

<style scoped>
.cd-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px 20px 48px;
  max-width: 1180px;
  margin: 0 auto;
}

/* ── Header ───────────────────────────────────────── */
.cd-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.cd-header__text { min-width: 0; }
.cd-title {
  font-size: 1.375rem;
  font-weight: 800;
  color: var(--c-text);
  margin: 0 0 4px;
  letter-spacing: -0.01em;
}
.cd-subtitle {
  font-size: 13px;
  color: var(--c-muted);
  margin: 0;
}

.btn-new {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 12px;
  background: var(--c-trade);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.15s ease;
  white-space: nowrap;
  flex-shrink: 0;
}
.btn-new:hover { opacity: 0.88; transform: translateY(-1px); }

/* ── Toolbar ──────────────────────────────────────── */
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.search-wrap {
  position: relative;
  flex: 1;
  min-width: 180px;
  max-width: 320px;
}
.search-icon {
  position: absolute;
  left: 11px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: var(--c-muted);
}
.search-input {
  width: 100%;
  background: var(--c-surface);
  border: 1.5px solid var(--c-border);
  border-radius: 12px;
  padding: 8px 12px 8px 34px;
  font-size: 13px;
  color: var(--c-text);
  outline: none;
  transition: border-color 0.15s ease;
}
.search-input:focus { border-color: var(--c-trade); }
.search-input::placeholder { color: var(--c-muted); opacity: 0.6; }

/* Kind filter — segmented pill row */
.filter-group {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-radius: 14px;
  background: var(--c-surface-2);
  flex-shrink: 0;
  flex-wrap: wrap;
}
.filter-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 13px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  color: var(--c-muted);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease, color 0.15s ease;
}
.filter-btn:hover { color: var(--c-text); }
.filter-btn--active { background: var(--c-trade); color: #fff; }
.filter-btn--active:hover { color: #fff; }

/* Country select */
.cd-select {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.cd-select__label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--c-muted);
}
.cd-select__field {
  appearance: none;
  -webkit-appearance: none;
  max-width: 160px;
  padding: 8px 28px 8px 12px;
  border-radius: 10px;
  border: 1.5px solid var(--c-border);
  background-color: var(--c-surface);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 9px center;
  color: var(--c-text);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s ease;
}
.cd-select__field:hover,
.cd-select__field:focus { border-color: var(--c-trade); }

/* Remote-duel toggle */
.remote-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 13px;
  border-radius: 10px;
  border: 1.5px solid var(--c-border);
  background: var(--c-surface);
  color: var(--c-muted);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  flex-shrink: 0;
}
.remote-toggle:hover { color: var(--c-text); }
.remote-toggle--active {
  background: color-mix(in srgb, var(--c-mutual) 15%, transparent);
  border-color: var(--c-mutual);
  color: var(--c-mutual);
}

/* ── Grid ─────────────────────────────────────────── */
.cd-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}

.skeleton-card {
  height: 76px;
  border-radius: 14px;
  background: var(--c-skeleton);
  animation: cd-pulse 1.6s ease-in-out infinite;
}
@keyframes cd-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.45; }
}

/* ── Empty state ──────────────────────────────────── */
.state-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 20px;
  text-align: center;
}
.state-icon {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--c-surface-2);
  display: flex;
  align-items: center;
  justify-content: center;
}
.state-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--c-text);
  margin: 0;
}

/* ── Pagination ───────────────────────────────────── */
.cd-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 8px;
}
.page-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1.5px solid var(--c-border);
  background: var(--c-surface);
  color: var(--c-text);
  cursor: pointer;
  transition: background 0.15s ease, opacity 0.15s ease;
}
.page-btn:hover:not(:disabled) { background: var(--c-surface-2); }
.page-btn:disabled { opacity: 0.4; cursor: default; }
.page-indicator {
  font-size: 13px;
  font-weight: 700;
  color: var(--c-muted);
  min-width: 48px;
  text-align: center;
}
</style>
