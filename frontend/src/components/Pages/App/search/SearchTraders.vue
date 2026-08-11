<script setup>
/**
 * Who else is here, on the app home.
 *
 * The same two lists the landing page shows, but doing a different job. There
 * they are proof that the place is not empty; here the visitor is already
 * convinced and wants somebody to trade with, so every row is a link to a
 * trader page and the deepest piles come first — those are the people most
 * likely to have what you are missing.
 *
 * Sits alongside SearchTrending / SearchLatestReleases and follows their shape:
 * icon-and-label heading, skeleton while loading, hairline rule at the bottom.
 */
import { computed, ref, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import {
  MIN_TO_SHOW,
  decorateRecent,
  fetchRecentTraders,
  fetchTopTradepiles,
  traderInitial,
} from "@/lib/people";

const { t } = useI18n();
const route = useRoute();

const recentTraders = ref([]);
const topPiles = ref([]);
const loading = ref(true);

const recentPeople = computed(() => decorateRecent(recentTraders.value));

// Both lists or neither, matching the landing page. Half a section is worse
// than none: it reads as something that failed to load rather than as a place
// with few people in it yet.
const enough = computed(
  () => recentPeople.value.length >= MIN_TO_SHOW && topPiles.value.length >= MIN_TO_SHOW
);

const traderHref = (id) => `/${route.params.locale || "en"}/trader/${id}`;

onMounted(async () => {
  try {
    const [recent, piles] = await Promise.all([fetchRecentTraders(3), fetchTopTradepiles(3)]);
    recentTraders.value = recent;
    topPiles.value = piles;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section v-if="loading || enough" class="flex flex-col gap-4">
    <div class="flex items-center gap-3">
      <v-icon icon="mdi-account-group" size="18" style="color: var(--c-accent)" />
      <p class="text-xl uppercase font-semibold tracking-wide" style="color: var(--c-text)">
        {{ t("people.sectionTitle") }}
      </p>
      <span class="text-xs px-2 py-1 rounded border" style="color: var(--c-muted); border-color: var(--c-border)">
        {{ t("people.sectionHint") }}
      </span>
    </div>

    <!-- Skeleton: two columns of three, the shape the real thing arrives in. -->
    <div v-if="loading" class="st-cols">
      <div v-for="c in 2" :key="c" class="flex flex-col gap-2">
        <div
          v-for="j in 3"
          :key="j"
          class="rounded-lg animate-pulse"
          :style="{ height: '58px', backgroundColor: 'var(--c-skeleton)', animationDelay: `${(c * 3 + j) * 50}ms` }"
        />
      </div>
    </div>

    <div v-else class="st-cols">
      <!-- Deepest piles first: on this page the useful question is who to trade
           with, and that is answered by who has the most up for trade. -->
      <div class="flex flex-col gap-1">
        <p class="st-col-title">{{ t("people.pilesTitle") }}</p>
        <a v-for="(p, i) in topPiles" :key="p.id" :href="traderHref(p.id)" class="st-person">
          <span class="st-rank" aria-hidden="true">{{ i + 1 }}</span>
          <span class="st-avatar">
            <img v-if="p.avatar_url" :src="p.avatar_url" alt="" loading="lazy" />
            <span v-else>{{ traderInitial(p.name) }}</span>
          </span>
          <span class="st-name">{{ p.name }}</span>
          <span class="st-count">{{ t("people.pileCount", { count: p.pile_size }, p.pile_size) }}</span>
        </a>
      </div>

      <div class="flex flex-col gap-1">
        <p class="st-col-title">{{ t("people.newestTitle") }}</p>
        <a v-for="p in recentPeople" :key="p.id" :href="traderHref(p.id)" class="st-person">
          <span class="st-avatar">
            <img v-if="p.avatar_url" :src="p.avatar_url" alt="" loading="lazy" />
            <span v-else>{{ p.initial }}</span>
          </span>
          <span class="st-text">
            <span class="st-name">{{ p.Name }}</span>
            <span v-if="p.place" class="st-meta">{{ p.place }}</span>
          </span>
          <span v-if="p.agoKey" class="st-when">{{ t(p.agoKey, { n: p.agoCount }, p.agoCount) }}</span>
        </a>
      </div>
    </div>

    <div class="h-px w-full" style="background-color: var(--c-border)" />
  </section>
</template>

<style scoped>
.st-cols {
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
}
@media (min-width: 900px) {
  .st-cols { grid-template-columns: 1fr 1fr; gap: 40px; }
}

.st-col-title {
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--c-muted);
  margin-bottom: 4px;
}

.st-person {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  margin: 0 -10px;
  border-radius: 10px;
  text-decoration: none;
  color: var(--c-text);
  transition: background 200ms cubic-bezier(0.22, 1, 0.36, 1);
}
.st-person:hover { background: var(--c-surface); }

.st-rank {
  flex: none;
  width: 14px;
  font-size: 13px;
  font-weight: 700;
  color: color-mix(in srgb, var(--c-muted) 70%, transparent);
  font-variant-numeric: tabular-nums;
}

.st-avatar {
  flex: none;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  font-weight: 700;
  font-size: 14px;
  color: var(--c-accent);
}
.st-avatar img { width: 100%; height: 100%; object-fit: cover; }

/* min-width: 0 so a long name truncates rather than pushing the count off. */
.st-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
.st-name {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.st-text .st-name { flex: none; }
.st-meta { font-size: 11.5px; color: var(--c-muted); }
.st-when { flex: none; font-size: 11.5px; color: var(--c-muted); }
.st-count {
  flex: none;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--c-trade);
  font-variant-numeric: tabular-nums;
}
</style>
