<template>
  <div class="deck-completion-bar" :class="{ 'deck-completion-bar--compact': compact }">
    <div
      class="deck-completion-bar__track"
      role="progressbar"
      :aria-valuenow="ariaValueNow"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="ariaLabel"
    >
      <div
        class="deck-completion-bar__segment deck-completion-bar__segment--owned"
        :style="{ width: ownedPct + '%' }"
      />
      <div
        class="deck-completion-bar__segment deck-completion-bar__segment--sourced"
        :style="{ width: sourcedPct + '%' }"
      />
    </div>
    <p v-if="!compact" class="deck-completion-bar__label">
      {{ label }}
    </p>
  </div>
</template>

<script>
import { computeCompletionPct } from '@/lib/deckStats';

export default {
  name: 'DeckCompletionBar',

  props: {
    owned:   { type: Number, required: true },
    sourced: { type: Number, default: 0 },
    total:   { type: Number, required: true },
    compact: { type: Boolean, default: false },
  },

  computed: {
    pct() {
      return computeCompletionPct({ owned: this.owned, sourced: this.sourced, total: this.total });
    },
    // ARIA requires valuenow <= valuemax; clamp for the attribute while pct stays uncapped for display.
    ariaValueNow() {
      return Math.min(100, this.pct);
    },
    // Owned segment's share of the track width, clamped so rounding never overflows 100%.
    ownedPct() {
      if (!(this.total > 0)) return 0;
      return Math.min(100, (this.owned / this.total) * 100);
    },
    // Sourced segment picks up where owned left off; clamped to the remaining track width.
    sourcedPct() {
      if (!(this.total > 0)) return 0;
      const remaining = Math.max(0, 100 - this.ownedPct);
      return Math.min(remaining, (this.sourced / this.total) * 100);
    },
    label() {
      return this.$t('deckDetail.completionPct', { owned: this.owned, total: this.total, pct: this.pct });
    },
    ariaLabel() {
      return this.$t('deckDetail.completionAria', { owned: this.owned, total: this.total, pct: this.pct });
    },
  },
};
</script>

<style scoped>
.deck-completion-bar {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.deck-completion-bar__track {
  display: flex;
  width: 100%;
  height: 8px;
  border-radius: 9999px;
  overflow: hidden;
  background-color: var(--c-surface-2);
  border: 1px solid var(--c-border);
}

.deck-completion-bar--compact .deck-completion-bar__track {
  height: 4px;
}

.deck-completion-bar__segment {
  height: 100%;
  flex: 0 0 auto;
  transition: width 0.2s ease;
}

.deck-completion-bar__segment--owned {
  background-color: var(--c-accent);
}

.deck-completion-bar__segment--sourced {
  background-color: var(--c-mutual);
}

.deck-completion-bar__label {
  margin: 0;
  font-size: 12px;
  line-height: 1.2;
  color: var(--c-muted);
}
</style>
