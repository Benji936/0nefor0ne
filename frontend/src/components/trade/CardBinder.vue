<script setup>
// A searchable, filterable page of someone's cards.
//
// Replaces a bare wall of thumbnails. A 224-card pile rendered in one go was
// both a scanning problem (no way to answer "do they have X" except by eye)
// and a rendering one (224 images plus 224 tooltip instances on first paint).
//
// Filtering is client-side on purpose: the whole pile already arrives in one
// query, so a round trip per keystroke would be slower and would break while
// offline. If piles ever outgrow that, the swap is to server-side search here
// and nowhere else.
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { cardImage } from "@/lib/cardImage";

const props = defineProps({
  cards: { type: Array, default: () => [] },
  // Shown when the collection itself is empty, as opposed to filtered to zero.
  emptyLabel: { type: String, default: "" },
  // Wishlist cards are dimmed slightly; the pile is not.
  dim: { type: Boolean, default: false },
});

const { t } = useI18n();

// One screenful and a bit. Enough that most piles need at most a couple of
// presses, small enough that first paint stays cheap.
const PAGE = 60;

const query      = ref("");
const rarityValue = ref("");
const wantedOnly = ref(false);
const shown      = ref(PAGE);

const hasWanted = computed(() => props.cards.some((c) => c.matchesMyWishlist));

// Rarity, not `extension`. Extension is a print code (MZMU-EN001) that
// identifies one printing of one card, so filtering by it returned a single
// card; it is also blank on the large majority of rows, which made the control
// vanish on the biggest collections. Rarity is present on every card.
const rarityKey = (c) => String(c?.rarity ?? "").trim().toLowerCase();

// Stored casing is inconsistent ("common" alongside "Ultra Rare"), so group on
// a lowercase key and capitalise for display. slice(1) rather than a full
// title-case, or "Collector's Rare" becomes "Collector'S Rare".
const rarities = computed(() => {
  const byKey = new Map();
  for (const c of props.cards) {
    const k = rarityKey(c);
    if (!k || byKey.has(k)) continue;
    byKey.set(k, k.split(" ").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" "));
  }
  return [...byKey].map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
});

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  return props.cards.filter((c) => {
    if (wantedOnly.value && !c.matchesMyWishlist) return false;
    if (rarityValue.value && rarityKey(c) !== rarityValue.value) return false;
    if (q && !String(c.name ?? "").toLowerCase().includes(q)) return false;
    return true;
  });
});

const visible = computed(() => filtered.value.slice(0, shown.value));
const more    = computed(() => Math.max(filtered.value.length - shown.value, 0));

// Any change to the query re-pages from the top, or the user would press
// "load more" to reveal results that were never hidden from this filter.
watch([query, rarityValue, wantedOnly, () => props.cards], () => { shown.value = PAGE; });

function label(c) {
  const bits = [c.name];
  if (c.extension) bits.push(c.extension);
  const base = bits.join(" · ");
  return c.condition ? `${base} (${c.condition})` : base;
}
</script>

<template>
  <div class="cb">
    <p v-if="!cards.length" class="cb__empty">{{ emptyLabel }}</p>

    <template v-else>
      <!-- Controls only appear once there is enough to warrant them. Below
           this a search field is just chrome over a list you can already see. -->
      <div v-if="cards.length > 12 || hasWanted" class="cb__controls">
        <div class="cb__search">
          <v-icon icon="mdi-magnify" size="17" aria-hidden="true" />
          <input
            v-model="query"
            type="search"
            class="cb__input"
            :placeholder="t('traderProfile.binderSearch')"
            :aria-label="t('traderProfile.binderSearch')"
          />
        </div>

        <select v-if="rarities.length > 1" v-model="rarityValue" class="cb__select" :aria-label="t('traderProfile.binderRarity')">
          <option value="">{{ t('traderProfile.binderAllRarities') }}</option>
          <option v-for="r in rarities" :key="r.value" :value="r.value">{{ r.label }}</option>
        </select>

        <button
          v-if="hasWanted"
          type="button"
          class="cb__toggle"
          :class="{ 'cb__toggle--on': wantedOnly }"
          :aria-pressed="wantedOnly"
          @click="wantedOnly = !wantedOnly"
        >
          <v-icon icon="mdi-cards-outline" size="15" aria-hidden="true" />
          {{ t('traderProfile.binderWantedOnly') }}
        </button>
      </div>

      <!-- Live so a screen reader hears the result count change as you type,
           rather than typing into silence. -->
      <p v-if="cards.length > 12 || hasWanted" class="cb__count" role="status" aria-live="polite">
        <!-- Counts against the filtered set, not the collection: "20 of 224"
             after a search reads as pagination when it actually means 20
             matches. Once everything matching is on screen the ratio stops
             being informative, so it collapses to a plain count. -->
        <template v-if="more">{{ t('traderProfile.binderShowing', { shown: visible.length, total: filtered.length }) }}</template>
        <template v-else>{{ t('traderProfile.binderCount', { count: filtered.length }, filtered.length) }}</template>
      </p>

      <div v-if="visible.length" class="cb__grid">
        <v-tooltip v-for="card in visible" :key="card.id" :text="label(card)" location="top" open-on-click>
          <template #activator="{ props: tip }">
            <img
              v-bind="tip"
              :src="cardImage(card.image_id)"
              :alt="card.name"
              class="cb__card"
              :class="{ 'cb__card--wanted': card.matchesMyWishlist, 'cb__card--dim': dim }"
              loading="lazy"
              decoding="async"
            />
          </template>
        </v-tooltip>
      </div>

      <p v-else class="cb__empty">{{ t('traderProfile.binderNoResults') }}</p>

      <button v-if="more" type="button" class="cb__more" @click="shown += PAGE">
        {{ t('traderProfile.binderLoadMore', { count: more }) }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.cb { display: flex; flex-direction: column; }

.cb__controls {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  margin-bottom: 12px;
}

/* Capped rather than stretched: as the only control on the row it would
   otherwise run the full width of the card, which reads as a page search
   rather than a filter over the grid below. Matches AnnouncesTab's toolbar. */
.cb__search {
  position: relative; display: flex; align-items: center;
  flex: 1 1 200px; min-width: 0; max-width: 340px;
}
.cb__search .v-icon {
  position: absolute; left: 11px; color: var(--c-muted); pointer-events: none;
}
.cb__input {
  width: 100%; min-height: 40px;
  padding: 0 12px 0 34px; border-radius: 11px;
  background: var(--c-surface-2); border: 1.5px solid var(--c-border);
  color: var(--c-text); font-size: 13.5px; outline: none;
  transition: border-color 0.15s ease;
}
.cb__input::placeholder { color: var(--c-muted); opacity: 0.7; }
.cb__input:focus { border-color: var(--c-trade); }
/* The UA clear button is invisible against a dark field in some browsers. */
.cb__input::-webkit-search-cancel-button { filter: invert(0.6); cursor: pointer; }

.cb__select {
  min-height: 40px; padding: 0 10px; border-radius: 11px;
  background: var(--c-surface-2); border: 1.5px solid var(--c-border);
  color: var(--c-text); font-size: 13px; font-weight: 600; cursor: pointer;
  max-width: 190px;
}
.cb__select:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

.cb__toggle {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 40px; padding: 0 13px; border-radius: 11px;
  background: transparent; border: 1.5px solid var(--c-border);
  color: var(--c-muted); font-size: 13px; font-weight: 700; cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
}
.cb__toggle:hover { color: var(--c-text); }
.cb__toggle--on {
  background: color-mix(in srgb, var(--c-trade) 16%, transparent);
  border-color: color-mix(in srgb, var(--c-trade) 45%, transparent);
  color: var(--c-trade);
}
.cb__toggle:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

.cb__count {
  margin: 0 0 12px; font-size: 12.5px; font-weight: 600; color: var(--c-muted);
  font-variant-numeric: tabular-nums;
}

.cb__grid { display: flex; flex-wrap: wrap; gap: 12px; }

.cb__card {
  height: 96px; width: 68px; flex-shrink: 0; display: block;
  border-radius: 4px; object-fit: contain; background: var(--c-surface-2);
  outline: 1px solid rgba(255,255,255,0.07);
  transition: transform 0.15s cubic-bezier(0.22,1,0.36,1), box-shadow 0.15s ease;
}
.cb__card:hover {
  transform: translateY(-2px) scale(1.06);
  box-shadow: 0 6px 20px rgba(0,0,0,0.4);
  outline-color: rgba(255,255,255,0.2);
}
.cb__card--dim { opacity: 0.85; }
/* Repeats the match block's signal. An outline rather than a badge: 68px of
   card leaves no room for chrome, and a ring reads across a wall of art. */
.cb__card--wanted { outline: 2px solid var(--c-trade); }
.cb__card--wanted:hover { outline-color: var(--c-trade); }

.cb__empty { margin: 0; padding: 24px 0; text-align: center; font-size: 13.5px; color: var(--c-muted); }

.cb__more {
  align-self: center; margin-top: 16px;
  min-height: 40px; padding: 0 18px; border-radius: 11px;
  background: color-mix(in srgb, var(--c-trade) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--c-trade) 28%, transparent);
  color: var(--c-trade); font-size: 13px; font-weight: 700; cursor: pointer;
  transition: background 0.15s ease;
}
.cb__more:hover { background: color-mix(in srgb, var(--c-trade) 22%, transparent); }
.cb__more:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

@media (pointer: coarse) {
  .cb__input, .cb__select, .cb__toggle, .cb__more { min-height: 44px; }
}

@media (prefers-reduced-motion: reduce) {
  .cb__card { transition: none; }
  .cb__card:hover { transform: none; }
  .cb__input, .cb__toggle, .cb__more { transition: none; }
}
</style>
