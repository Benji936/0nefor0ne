<template>
  <div class="deck-stats-breakdown">
    <p class="deck-stats-breakdown__title">{{ t('deckDetail.typeBreakdown') }}</p>

    <div class="deck-stats-breakdown__chips">
      <div
        v-for="chip in typeChips"
        :key="chip.key"
        class="deck-stats-breakdown__chip"
      >
        <img
          v-if="chip.icon"
          :src="chip.icon"
          :alt="chip.label"
          class="deck-stats-breakdown__chip-icon"
        />
        <v-icon v-else :icon="chip.fallbackIcon" size="14" :style="{ color: chip.color }" />
        <span class="deck-stats-breakdown__chip-label">{{ chip.label }}</span>
        <span class="deck-stats-breakdown__chip-count" :style="{ color: chip.color }">{{ chip.count }}</span>
      </div>
    </div>

    <p class="deck-stats-breakdown__value">
      <template v-if="hasValue">
        <span class="deck-stats-breakdown__value-label">{{ t('deckDetail.estimatedValue', { value: formattedValue }) }}</span>
        <span class="deck-stats-breakdown__value-approx">{{ t('deckDetail.estimatedApprox') }}</span>
      </template>
      <span v-else class="deck-stats-breakdown__value-unavailable">{{ t('deckDetail.priceUnavailable') }}</span>
    </p>
  </div>
</template>

<script>
import { useI18n } from 'vue-i18n';
import { computeTypeBreakdown, computeEstimatedValue } from '@/lib/deckStats';
import { iconUrl } from '@/lib/cardIcons';

export default {
  name: 'DeckStatsBreakdown',

  props: {
    entries:        { type: Array,  default: () => [] },      // [{ id, qty }]
    cardMap:        { type: Object, required: true },
    missingEntries: { type: Array,  default: () => [] },      // kept for API parity with DeckSection callers
  },

  setup() {
    const { t, locale } = useI18n();
    return { t, locale };
  },

  computed: {
    typeBreakdown() {
      return computeTypeBreakdown(this.entries, this.cardMap);
    },

    // Approximate cardmarket total for the whole deck (KD "estimated deck value").
    // computeEstimatedValue already guards NaN/empty card_prices → 0, never NaN.
    estimatedValueRaw() {
      return computeEstimatedValue(this.entries, this.cardMap);
    },

    // Treated as unavailable when unknown/zero, per spec: never render a silent 0.00.
    hasValue() {
      const v = this.estimatedValueRaw;
      return Number.isFinite(v) && v > 0;
    },

    formattedValue() {
      if (!this.hasValue) return '';
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(this.estimatedValueRaw);
    },

    typeChips() {
      const b = this.typeBreakdown;
      return [
        {
          key: 'monster',
          label: this.t('search.filters.kind.monster'),
          count: b.monster,
          icon: null,
          fallbackIcon: 'mdi-sword',
          color: 'var(--c-accent)',
        },
        {
          key: 'spell',
          label: this.t('search.filters.kind.spell'),
          count: b.spell,
          icon: iconUrl('spell'),
          fallbackIcon: 'mdi-flash',
          color: 'var(--c-mutual)',
        },
        {
          key: 'trap',
          label: this.t('search.filters.kind.trap'),
          count: b.trap,
          icon: iconUrl('trap'),
          fallbackIcon: 'mdi-alert-octagon',
          color: 'var(--c-trade)',
        },
      ];
    },
  },
};
</script>

<style scoped>
.deck-stats-breakdown {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.deck-stats-breakdown__title {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--c-muted);
}

.deck-stats-breakdown__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.deck-stats-breakdown__chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 9999px;
  background-color: var(--c-surface-2);
  border: 1px solid var(--c-border);
}

.deck-stats-breakdown__chip-icon {
  width: 14px;
  height: 14px;
  object-fit: contain;
}

.deck-stats-breakdown__chip-label {
  font-size: 12px;
  color: var(--c-text);
}

.deck-stats-breakdown__chip-count {
  font-size: 12px;
  font-weight: 700;
}

.deck-stats-breakdown__value {
  margin: 0;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 13px;
}

.deck-stats-breakdown__value-label {
  font-weight: 700;
  color: var(--c-text);
}

.deck-stats-breakdown__value-approx {
  font-size: 11px;
  color: var(--c-muted);
  font-style: italic;
}

.deck-stats-breakdown__value-unavailable {
  color: var(--c-muted);
  font-style: italic;
}
</style>
