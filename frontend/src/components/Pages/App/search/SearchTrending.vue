<script setup>
/**
 * What the market is doing, at the top of the app home.
 *
 * Cards are always here; what changes between visits is people and prices. So
 * the home page opens on the card that turned up in the most trades this month,
 * at the size it deserves, with the rest of the ranked list beside it rather
 * than behind a horizontal scroll.
 *
 * No rank numbers: the counts tie constantly (three cards at 3 trades each), and
 * numbering ties states an order the data does not have. The count is the fact,
 * so the count is what each row carries.
 */
import { ref, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { fetchTrendingCards } from "@/lib/matches";
import { cardImage } from "@/lib/cardImage";

const { t } = useI18n();
const route = useRoute();

const cards = ref([]);
const loading = ref(true);

const hero = computed(() => cards.value[0] ?? null);
const rest = computed(() => cards.value.slice(1, 7));

const cardHref = (c) => `/${route.params.locale || "en"}/card/${c.image_id}`;

onMounted(async () => {
  try {
    cards.value = await fetchTrendingCards(7);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section v-if="loading || cards.length" class="hm-trend" aria-labelledby="hm-trend-h">
    <p id="hm-trend-h" class="hm-eyebrow">
      <v-icon icon="mdi-fire" size="14" />{{ t('search.trending') }}
      <span class="hm-eyebrow__sep">·</span>{{ t('search.last30days') }}
    </p>

    <div v-if="loading" class="hm-trend__body">
      <div class="hm-hero__art hm-sk animate-pulse motion-reduce:animate-none" />
      <div class="hm-trend__side">
        <div class="hm-sk animate-pulse motion-reduce:animate-none" style="height: 34px; width: 62%; border-radius: 8px" />
        <div v-for="i in 4" :key="i" class="hm-sk animate-pulse motion-reduce:animate-none" style="height: 46px; border-radius: 10px" />
      </div>
    </div>

    <div v-else-if="hero" class="hm-trend__body">
      <a :href="cardHref(hero)" class="hm-hero__art" :aria-label="hero.name">
        <img :src="cardImage(hero.image_id)" :alt="hero.name" />
      </a>

      <div class="hm-trend__side">
        <div class="hm-hero__text">
          <a :href="cardHref(hero)" class="hm-hero__name">{{ hero.name }}</a>
          <p class="hm-hero__meta">
            <span v-if="hero.extension" class="hm-code">{{ hero.extension }}</span>
            <span class="hm-hero__count">{{ t('home.tradedIn', { count: hero.trade_count }, hero.trade_count) }}</span>
          </p>
        </div>

        <div v-if="rest.length" class="hm-also">
          <p class="hm-eyebrow hm-eyebrow--sub">{{ t('home.alsoMoving') }}</p>
          <a v-for="c in rest" :key="`${c.image_id}-${c.extension}`" :href="cardHref(c)" class="hm-row">
            <img :src="cardImage(c.image_id)" :alt="c.name" class="hm-row__thumb" loading="lazy" />
            <span class="hm-row__text">
              <span class="hm-row__name">{{ c.name }}</span>
              <span v-if="c.extension" class="hm-code hm-code--sm">{{ c.extension }}</span>
            </span>
            <span class="hm-row__n tabular-nums">{{ c.trade_count }}</span>
          </a>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hm-trend { display: flex; flex-direction: column; gap: 18px; }

.hm-trend__body {
  display: flex;
  align-items: flex-start;
  gap: clamp(20px, 3vw, 36px);
}
.hm-trend__side { display: flex; flex-direction: column; gap: 20px; flex: 1; min-width: 0; }

/* The card at the size a card deserves. No glow behind it: the other heroes in
   this app need one because they have no artwork to carry them, and this one
   does. */
.hm-hero__art {
  display: block;
  width: clamp(150px, 20vw, 208px);
  flex-shrink: 0;
  aspect-ratio: 59 / 86;
  border-radius: 8px;
  overflow: hidden;
  background: var(--c-surface-2);
  outline: 1px solid var(--hm-line);
  transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.22s ease;
}
.hm-hero__art img { width: 100%; height: 100%; object-fit: cover; display: block; }
.hm-hero__art:hover {
  transform: translateY(-4px);
  box-shadow: 0 22px 48px color-mix(in srgb, var(--c-trade) 24%, transparent);
}
.hm-hero__art:focus-visible { outline: 2px solid var(--c-accent); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  .hm-hero__art, .hm-hero__art:hover { transition: none; transform: none; }
}

.hm-hero__text { display: flex; flex-direction: column; gap: 9px; min-width: 0; }
.hm-hero__name {
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: clamp(1.5rem, 3.4vw, 2.35rem);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.03em;
  color: var(--c-text);
  text-decoration: none;
  text-wrap: balance;
}
.hm-hero__name:hover { text-decoration: underline; text-underline-offset: 4px; }
.hm-hero__name:focus-visible { outline: 2px solid var(--c-accent); outline-offset: 3px; border-radius: 4px; }

.hm-hero__meta { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin: 0; }
.hm-hero__count { font-size: 0.88rem; font-weight: 600; color: var(--c-accent); }

/* Set codes in monospace, the way collectors read a binder (DESIGN.md, The Mono
   Identifier Rule). */
.hm-code {
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  padding: 3px 8px;
  border-radius: 6px;
  color: var(--c-muted);
  background: color-mix(in srgb, var(--c-muted) 13%, transparent);
}
.hm-code--sm { padding: 1px 5px; font-size: 0.63rem; }

/* ── The rest of the ranked list ── */
/* Held to a readable measure. Left to fill the column the count ended up a
   third of a screen from the name it belongs to. */
.hm-also { display: flex; flex-direction: column; gap: 4px; max-width: 46rem; }

.hm-row {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 6px 10px;
  margin: 0 -10px;
  border-radius: 10px;
  text-decoration: none;
  transition: background 0.16s ease;
}
.hm-row:hover { background: var(--hm-panel); }
.hm-row:focus-visible { outline: 2px solid var(--c-accent); outline-offset: -2px; }
.hm-row__thumb {
  width: 26px;
  height: 38px;
  flex-shrink: 0;
  border-radius: 3px;
  object-fit: cover;
  background: var(--c-surface-2);
}
.hm-row__text { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
.hm-row__name {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--c-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hm-row__n {
  flex-shrink: 0;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--c-accent);
}

.hm-sk { background: var(--c-skeleton); }
.hm-hero__art.hm-sk { outline: 0; }

@media (max-width: 720px) {
  .hm-trend__body { flex-direction: column; align-items: stretch; }
  .hm-hero__art { width: min(58vw, 200px); align-self: flex-start; }
  .hm-row__text { flex-wrap: wrap; gap: 2px 8px; }
}
</style>
