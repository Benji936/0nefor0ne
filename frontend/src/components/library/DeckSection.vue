<template>
  <template v-if="entries.length">
    <p class="text-caption font-weight-bold text-uppercase mb-2" style="color: var(--c-muted); letter-spacing: 0.03em">
      {{ title }} ({{ sectionTotal }})
      <span v-if="missingInSection > 0" style="color: var(--c-error, rgb(220,38,38)); margin-left: 4px;">
        — {{ t('decks.missingCount', { missing: missingInSection }) }}
      </span>
    </p>
    <div class="d-grid mb-4" style="display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(68px, 1fr))">
      <div v-for="item in entries" :key="item.id" class="d-flex flex-column align-center" style="gap: 4px">
        <div class="position-relative" style="width: 68px">
          <img
            v-if="!isUnrecognized(item.id)"
            :src="cardImage(item.id)"
            :alt="card(item.id).name"
            loading="lazy"
            class="rounded w-100"
            style="aspect-ratio: 59/86; display: block; object-fit: cover"
            :style="{ opacity: isIgnored(item.id) ? 0.15 : isMissing(item.id) ? 0.35 : 1 }"
          />
          <div
            v-else
            class="rounded w-100 d-flex align-center justify-center"
            style="aspect-ratio: 59/86; background-color: var(--c-surface-2); border: 1px solid var(--c-border)"
          >
            <v-icon icon="mdi-help" size="20" style="color: var(--c-muted)" />
          </div>

          <!-- Sourced badge (green) -->
          <div
            v-if="isIgnored(item.id)"
            class="position-absolute d-flex align-center justify-center font-weight-bold"
            style="bottom: 0; left: 0; right: 0; padding: 2px 0; font-size: 9px; background: rgba(34,197,94,0.85); color: white; border-bottom-left-radius: 4px; border-bottom-right-radius: 4px"
          >{{ $t('deckIgnore.skippedBadge') }}</div>

          <!-- Missing badge (red) — only for active missing, not ignored -->
          <div
            v-else-if="isMissing(item.id)"
            class="position-absolute d-flex align-center justify-center font-weight-bold"
            style="bottom: 0; left: 0; right: 0; padding: 2px 0; font-size: 9px; background: var(--c-missing-badge, rgba(220,38,38,0.85)); color: white; border-bottom-left-radius: 4px; border-bottom-right-radius: 4px"
          >{{ missingBadge }}</div>

          <div
            v-if="isUnrecognized(item.id)"
            class="position-absolute d-flex align-center justify-center font-weight-bold"
            style="bottom: 0; left: 0; right: 0; padding: 2px 0; font-size: 9px; background: rgba(100,100,100,0.85); color: white; border-bottom-left-radius: 4px; border-bottom-right-radius: 4px"
          >{{ unknownBadge }}</div>

          <div
            v-if="item.qty > 1"
            class="position-absolute d-flex align-center justify-center font-weight-bold"
            style="top: 2px; right: 2px; width: 16px; height: 16px; border-radius: 50%; font-size: 9px; background: rgba(0,0,0,0.7); color: white"
          >{{ item.qty }}</div>

          <!-- Eye toggle button — only for missing-state cards (active or ignored), never for owned or unrecognized -->
          <button
            v-if="isMissing(item.id) || isIgnored(item.id)"
            class="position-absolute d-flex align-center justify-center"
            style="top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: rgba(0,0,0,0.55); border: none; cursor: pointer; padding: 0;"
            @click.stop="$emit('toggle-ignore', item.id)"
          >
            <v-icon
              :icon="isIgnored(item.id) ? 'mdi-eye' : 'mdi-eye-off'"
              size="11"
              style="color: white"
            />
          </button>
        </div>
        <p class="text-center w-100 text-truncate" style="font-size: 9px; color: var(--c-muted); max-width: 68px; line-height: 1.1">
          {{ card(item.id) ? card(item.id).name : item.id }}
        </p>
      </div>
    </div>
  </template>
</template>

<script>
import { useI18n } from 'vue-i18n';
import { cardImage } from '@/lib/cardImage';

export default {
  name: 'DeckSection',

  props: {
    entries:      { type: Array,  default: () => [] },      // [{ id, qty }]
    cardMap:      { type: Object, required: true },
    ownedIds:     { type: Object, required: true },          // Set<number>
    ignoredIds:   { type: Object, default: () => new Set() }, // Set<number>
    title:        { type: String, default: '' },
    missingBadge: { type: String, default: 'Missing' },
    unknownBadge: { type: String, default: 'Unrecognized' },
  },

  emits: ['toggle-ignore'],

  setup() {
    const { t } = useI18n();
    return { cardImage, t };
  },

  computed: {
    sectionTotal() { return this.entries.reduce((s, c) => s + c.qty, 0); },
    missingInSection() {
      return this.entries.reduce((sum, e) => {
        if (this.cardMap[e.id] && !this.ownedIds.has(e.id) && !this.isIgnored(e.id)) sum += (e.qty || 1);
        return sum;
      }, 0);
    },
    ignoredInSection() {
      return this.entries.filter(e => this.isIgnored(e.id)).reduce((sum, e) => sum + e.qty, 0);
    },
  },

  methods: {
    card(id)           { return this.cardMap[id] ?? null; },
    isUnrecognized(id) { return !this.cardMap[id]; },
    isOwned(id)        { return !!this.cardMap[id] && this.ownedIds.has(id); },
    isMissing(id)      { return !!this.cardMap[id] && !this.ownedIds.has(id); },
    isIgnored(id)      { return this.ignoredIds.has(id); },
  },
};
</script>
