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
    <p class="hm-eyebrow">
      <v-icon icon="mdi-account-group" size="14" />{{ t("people.sectionTitle") }}
      <span class="hm-eyebrow__sep">·</span>{{ t("people.sectionHint") }}
    </p>

    <!-- Skeleton: two columns of three, the shape the real thing arrives in. -->
    <div v-if="loading" class="st-cols">
      <div v-for="c in 2" :key="c" class="st-panel">
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
      <div class="st-panel">
        <p class="st-col-title">{{ t("people.pilesTitle") }}</p>
        <!-- No rank numbers. Pile sizes tie constantly (224, 6, 6), so numbering
             them states an order the data does not have — and the count on each
             row is the fact, which implies the order anyway. -->
        <a v-for="p in topPiles" :key="p.id" :href="traderHref(p.id)" class="st-person">
          <span class="st-avatar">
            <img v-if="p.avatar_url" :src="p.avatar_url" alt="" loading="lazy" />
            <span v-else>{{ traderInitial(p.name) }}</span>
          </span>
          <span class="st-name">{{ p.name }}</span>
          <span class="st-count">{{ t("people.pileCount", { count: p.pile_size }, p.pile_size) }}</span>
        </a>
      </div>

      <div class="st-panel">
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

  </section>
</template>

<style scoped>
.st-cols {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}
@media (min-width: 900px) {
  .st-cols { grid-template-columns: 1fr 1fr; }
}

/* The landing page's panel: one tonal step under the page, a hairline that is a
   fraction of the border token, and a 1px top highlight instead of a shadow. */
.st-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 18px;
  background: var(--hm-panel);
  border: 1px solid var(--hm-line-soft);
  border-radius: 18px;
  box-shadow: var(--hm-lit);
}

.st-col-title {
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--c-muted);
  margin-bottom: 6px;
}

.st-person {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 9px;
  margin: 0 -9px;
  border-radius: 10px;
  text-decoration: none;
  color: var(--c-text);
  transition: background 200ms cubic-bezier(0.22, 1, 0.36, 1);
}
.st-person:hover { background: color-mix(in srgb, var(--c-surface) 80%, transparent); }

.st-avatar {
  flex: none;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--c-surface);
  border: 1px solid var(--hm-line);
  font-weight: 700;
  font-size: 14px;
  color: var(--c-accent);
}
.st-avatar img { width: 100%; height: 100%; object-fit: cover; }

.st-person:focus-visible { outline: 2px solid var(--c-accent); outline-offset: -2px; }

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
