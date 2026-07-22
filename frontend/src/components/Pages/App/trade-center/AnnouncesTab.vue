<script setup>
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import AnnounceCard from "@/components/trade/AnnounceCard.vue";
import { ANNOUNCE_KIND } from "@/lib/announceKind";

const props = defineProps({
  login:     { type: Object,  default: null },
  loading:   { type: Boolean, default: false },
  announces: { type: Array,   default: () => [] },
});

const emit = defineEmits(["openCreate", "openDetail"]);
const { t } = useI18n();

// In-tab kind filter. "all" shows both kinds; the other two options narrow
// to a single `announce.kind`. Replaces the old separate Looking For tab.
const FILTER_ALL = "all";

const searchQuery = ref("");
const kindFilter  = ref(FILTER_ALL);

const currentUserId = computed(() => props.login?.user?.id ?? null);

const filterOptions = computed(() => [
  { value: FILTER_ALL,                label: t("announces.filterAll") },
  { value: ANNOUNCE_KIND.SELL,        label: t("announces.filterSelling") },
  { value: ANNOUNCE_KIND.LOOKING_FOR, label: t("announces.filterLookingFor") },
]);

// The announces matching the active filter. Applies to the WHOLE tab: both
// the "My Announces" row and the all/others grid below draw from this.
// Rows written before the kind column existed default to 'sell' in the
// database, so `?? SELL` here is just belt-and-braces for optimistic local
// inserts.
const kindAnnounces = computed(() => {
  if (kindFilter.value === FILTER_ALL) return props.announces;
  return props.announces.filter(a => (a.kind ?? ANNOUNCE_KIND.SELL) === kindFilter.value);
});

// Drives the per-kind empty-state copy and the create button's default
// kind. Only true when the Looking For filter is explicitly selected, not
// for All, so "All" and "Selling" both fall back to the generic empty state.
const isLf = computed(() => kindFilter.value === ANNOUNCE_KIND.LOOKING_FOR);

// Split by ownership
const myAnnounces    = computed(() => kindAnnounces.value.filter(a => a.seller === currentUserId.value));
const otherAnnounces = computed(() => kindAnnounces.value.filter(a => a.seller !== currentUserId.value));

const filteredOthers = computed(() => {
  if (!searchQuery.value.trim()) return otherAnnounces.value;
  const q = searchQuery.value.trim().toLowerCase();
  return otherAnnounces.value.filter(a =>
    a.title.toLowerCase().includes(q) ||
    (a.description  || "").toLowerCase().includes(q) ||
    (a.archetype    || "").toLowerCase().includes(q) ||
    (a.want_detail  || "").toLowerCase().includes(q)
  );
});

// The create button defaults to the active filter's kind (Looking For when
// that filter is active, Selling otherwise, including for "All"). The
// dialog's own kind toggle still lets the user switch afterwards.
function openCreate() {
  emit("openCreate", isLf.value ? ANNOUNCE_KIND.LOOKING_FOR : ANNOUNCE_KIND.SELL);
}
</script>

<template>
  <div class="announces-page">

    <!-- ── Not logged in ───────────────────────────────────── -->
    <div v-if="!login?.user" class="state-center">
      <div class="state-icon">
        <v-icon icon="mdi-lock-outline" size="40" style="color: var(--c-muted)" />
      </div>
      <p class="state-title">{{ t("announces.loginRequired") }}</p>
    </div>

    <!-- ── Loading skeleton ────────────────────────────────── -->
    <div v-else-if="loading" class="content-area">
      <div class="section-grid">
        <div v-for="i in 8" :key="i" class="skeleton-card" />
      </div>
    </div>

    <!-- ── Content ─────────────────────────────────────────── -->
    <template v-else>

      <!-- Sticky toolbar -->
      <div class="toolbar">
        <div class="search-wrap">
          <v-icon icon="mdi-magnify" size="17" class="search-icon" />
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="t('announces.search')"
            class="search-input"
          />
        </div>

        <div class="filter-group" role="group">
          <button
            v-for="opt in filterOptions"
            :key="opt.value"
            type="button"
            class="filter-btn"
            :class="{
              'filter-btn--active': kindFilter === opt.value,
              'filter-btn--lf': opt.value === ANNOUNCE_KIND.LOOKING_FOR,
            }"
            :aria-pressed="kindFilter === opt.value"
            @click="kindFilter = opt.value"
          >{{ opt.label }}</button>
        </div>

        <button class="btn-new" @click="openCreate">
          <v-icon icon="mdi-plus" size="18" />
          {{ isLf ? t("announces.newLookingFor") : t("announces.newAnnounce") }}
        </button>
      </div>

      <div class="content-area">

        <!-- ── My Announces section ──────────────────────── -->
        <section v-if="myAnnounces.length > 0" class="my-section">
          <div class="section-header">
            <div class="section-header__left">
              <span class="section-dot section-dot--own" />
              <span class="section-label">{{ t("announces.myAnnounces") }}</span>
              <span class="section-count">{{ myAnnounces.length }}</span>
            </div>
          </div>

          <!-- Horizontal scroll row for own announces -->
          <div class="my-scroll">
            <AnnounceCard
              v-for="announce in myAnnounces"
              :key="announce.id"
              :announce="announce"
              :current-user-id="currentUserId"
              class="my-card-item"
              @click="emit('openDetail', announce)"
            />
          </div>
        </section>

        <!-- Divider between sections -->
        <div v-if="myAnnounces.length > 0 && otherAnnounces.length > 0" class="section-divider" />

        <!-- ── All / Other announces section ─────────────── -->
        <section class="all-section">
          <div v-if="otherAnnounces.length > 0" class="section-header">
            <div class="section-header__left">
              <span class="section-dot section-dot--all" />
              <span class="section-label">{{ t("announces.allAnnounces") }}</span>
              <span class="section-count">{{ otherAnnounces.length }}</span>
            </div>
          </div>

          <!-- Empty state: no announces of this kind at all -->
          <div v-if="kindAnnounces.length === 0" class="state-center">
            <div class="state-icon">
              <v-icon icon="mdi-storefront-outline" size="44" style="color: var(--c-muted)" />
            </div>
            <p class="state-title">{{ isLf ? t("announces.noLookingForTitle") : t("announces.noAnnouncesTitle") }}</p>
            <p class="state-sub">{{ isLf ? t("announces.noLookingForDesc") : t("announces.noAnnouncesDesc") }}</p>
            <button class="btn-new" @click="openCreate">
              <v-icon icon="mdi-plus" size="18" />
              {{ isLf ? t("announces.newLookingFor") : t("announces.newAnnounce") }}
            </button>
          </div>

          <!-- No search results -->
          <div v-else-if="otherAnnounces.length > 0 && filteredOthers.length === 0" class="state-center state-center--sm">
            <v-icon icon="mdi-text-search" size="32" style="color: var(--c-muted)" />
            <p class="state-sub">{{ t("announces.noSearchResults") }}</p>
          </div>

          <!-- Only own announcements, no others -->
          <div v-else-if="otherAnnounces.length === 0 && myAnnounces.length > 0" class="state-center state-center--sm">
            <p class="state-sub" style="color: var(--c-muted)">{{ t("announces.onlyYours") }}</p>
          </div>

          <!-- Grid -->
          <div v-else class="section-grid">
            <AnnounceCard
              v-for="announce in filteredOthers"
              :key="announce.id"
              :announce="announce"
              :current-user-id="currentUserId"
              @click="emit('openDetail', announce)"
            />
          </div>
        </section>

      </div>
    </template>
  </div>
</template>

<style scoped>
/* ── Page shell ───────────────────────────────────── */
.announces-page {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}

/* ── Toolbar ──────────────────────────────────────── */
.toolbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  background: color-mix(in srgb, var(--c-bg) 85%, transparent);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--c-border);
  flex-wrap: wrap;
}

/* Search */
.search-wrap {
  position: relative;
  flex: 1;
  min-width: 180px;
  max-width: 360px;
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

/* Kind filter — segmented control (All / Selling / Looking For) */
.filter-group {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-radius: 14px;
  background: var(--c-surface-2);
  flex-shrink: 0;
}
.filter-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  padding: 0 14px;
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
.filter-btn--active.filter-btn--lf { background: var(--c-mutual); color: #13031A; }
.filter-btn--active:hover { color: #fff; }
.filter-btn--active.filter-btn--lf:hover { color: #13031A; }

/* New button */
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

.btn-new-sm {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 11px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--c-trade) 15%, transparent);
  color: var(--c-trade);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s ease;
  white-space: nowrap;
}
.btn-new-sm:hover { background: color-mix(in srgb, var(--c-trade) 25%, transparent); }

/* ── Content area ─────────────────────────────────── */
.content-area {
  padding: 24px 20px 40px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

/* ── Section headers ──────────────────────────────── */
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.section-header__left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.section-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.section-dot--own { background: var(--c-trade); }
.section-dot--all { background: var(--c-accent); }

.section-label {
  font-size: 13px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--c-text);
}
.section-count {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 99px;
  background: var(--c-surface-2);
  color: var(--c-muted);
}

/* ── My section: horizontal scroll row ───────────── */
.my-section {
  display: flex;
  flex-direction: column;
}
.my-scroll {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 8px;
  scrollbar-width: thin;
  scrollbar-color: var(--c-border) transparent;
}
.my-scroll::-webkit-scrollbar { height: 4px; }
.my-scroll::-webkit-scrollbar-thumb { background: var(--c-border); border-radius: 99px; }

.my-card-item {
  flex-shrink: 0;
  width: 220px;
}

/* ── Divider ──────────────────────────────────────── */
.section-divider {
  height: 1px;
  background: var(--c-border);
  margin: 0 -4px;
  opacity: 0.6;
}

/* ── Main grid ────────────────────────────────────── */
.section-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

/* ── Skeleton ─────────────────────────────────────── */
.skeleton-card {
  aspect-ratio: 3 / 4;
  border-radius: 16px;
  background: var(--c-skeleton);
  animation: pulse 1.6s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.45; }
}

/* ── States ───────────────────────────────────────── */
.state-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 20px;
  text-align: center;
}
.state-center--sm { padding: 32px 20px; }
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
  font-size: 17px;
  font-weight: 700;
  color: var(--c-text);
  margin: 0;
}
.state-sub {
  font-size: 13px;
  color: var(--c-muted);
  max-width: 280px;
  margin: 0;
  line-height: 1.5;
}
</style>
