<script setup>
// Search, rarity and wishlist-only, for a binder that may not be next to them.
//
// These used to live inside CardBinder. The proposal dialog puts them in its
// side rail while the trader profile keeps them above the pages, so the markup
// moved out here and the binder takes the resulting filter set as a prop. One
// behaviour, two placements.
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { rarityOptions, hasWishlistMatches, NO_FILTERS } from "@/lib/binderFilters";

const props = defineProps({
  // { query, rarity, wantedOnly }
  modelValue: { type: Object, default: () => ({ ...NO_FILTERS }) },
  // The unfiltered pile: the rarity list and the wishlist toggle are only
  // offered for what is actually in it.
  cards: { type: Array, default: () => [] },
  // 'column' stacks them for a narrow rail; 'row' is the profile's toolbar.
  layout: { type: String, default: "row" },   // 'row' | 'column'
});

const emit = defineEmits(["update:modelValue"]);

const { t } = useI18n();

const rarities  = computed(() => rarityOptions(props.cards));
const hasWanted = computed(() => hasWishlistMatches(props.cards));

const set = (patch) => emit("update:modelValue", { ...NO_FILTERS, ...props.modelValue, ...patch });

const query      = computed({ get: () => props.modelValue?.query ?? "",       set: (v) => set({ query: v }) });
const rarity     = computed({ get: () => props.modelValue?.rarity ?? "",      set: (v) => set({ rarity: v }) });
const wantedOnly = computed({ get: () => props.modelValue?.wantedOnly ?? false, set: (v) => set({ wantedOnly: v }) });
</script>

<template>
  <div class="bc" :class="`bc--${layout}`">
    <div class="bc__search">
      <v-icon icon="mdi-magnify" size="17" aria-hidden="true" />
      <input
        v-model="query"
        type="search"
        class="bc__input"
        :placeholder="t('traderProfile.binderSearch')"
        :aria-label="t('traderProfile.binderSearch')"
      />
    </div>

    <select
      v-if="rarities.length > 1"
      v-model="rarity"
      class="bc__select"
      :aria-label="t('traderProfile.binderRarity')"
    >
      <option value="">{{ t('traderProfile.binderAllRarities') }}</option>
      <option v-for="r in rarities" :key="r.value" :value="r.value">{{ r.label }}</option>
    </select>

    <button
      v-if="hasWanted"
      type="button"
      class="bc__toggle"
      :class="{ 'bc__toggle--on': wantedOnly }"
      :aria-pressed="wantedOnly"
      @click="wantedOnly = !wantedOnly"
    >
      <v-icon icon="mdi-cards-outline" size="15" aria-hidden="true" />
      {{ t('traderProfile.binderWantedOnly') }}
    </button>
  </div>
</template>

<style scoped>
/* --cb-tone is the one colour these spend, and the host sets it: read through
   a fallback at every use so a host that does not set it still gets amethyst. */
.bc { display: flex; gap: 8px; }
.bc--row { align-items: center; flex-wrap: wrap; }
.bc--column { flex-direction: column; align-items: stretch; }

.bc__search { position: relative; display: flex; align-items: center; min-width: 0; }
.bc--row .bc__search { flex: 1 1 200px; max-width: 340px; }
.bc__search .v-icon { position: absolute; left: 11px; color: var(--c-muted); pointer-events: none; }

.bc__input {
  width: 100%; min-height: 40px;
  padding: 0 12px 0 34px; border-radius: 11px;
  background: var(--c-surface-2); border: 1.5px solid var(--tpb-line, var(--c-border));
  color: var(--c-text); font-size: 13.5px; outline: none;
  transition: border-color 0.15s ease;
}
.bc__input::placeholder { color: var(--c-muted); opacity: 0.7; }
.bc__input:focus { border-color: var(--cb-tone, var(--c-trade)); }
/* The UA clear button is drawn near-black, which vanishes against a dark
   field. Inverted only in the dark theme -- on the light one it was already
   correct and the invert was turning it white on white. */
.bc__input::-webkit-search-cancel-button { cursor: pointer; }
html.dark .bc__input::-webkit-search-cancel-button { filter: invert(0.7); }

.bc__select {
  min-height: 40px; padding: 0 10px; border-radius: 11px;
  background: var(--c-surface-2); border: 1.5px solid var(--tpb-line, var(--c-border));
  color: var(--c-text); font-size: 13px; font-weight: 600; cursor: pointer;
}
.bc--row .bc__select { max-width: 190px; }
.bc__select:focus-visible { outline: 2px solid var(--cb-tone, var(--c-trade)); outline-offset: 2px; }

.bc__toggle {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  min-height: 40px; padding: 0 13px; border-radius: 11px;
  background: transparent; border: 1.5px solid var(--tpb-line, var(--c-border));
  color: var(--c-muted); font-size: 13px; font-weight: 700; cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
}
.bc__toggle:hover { color: var(--c-text); }
.bc__toggle--on {
  background: color-mix(in srgb, var(--cb-tone, var(--c-trade)) 10%, transparent);
  border-color: color-mix(in srgb, var(--cb-tone, var(--c-trade)) 50%, transparent);
  color: var(--cb-tone, var(--c-trade));
}
.bc__toggle:focus-visible { outline: 2px solid var(--cb-tone, var(--c-trade)); outline-offset: 2px; }

@media (pointer: coarse) {
  .bc__input, .bc__select, .bc__toggle { min-height: 44px; }
}
@media (prefers-reduced-motion: reduce) {
  .bc__input, .bc__toggle { transition: none; }
}
</style>
