<script setup>
import LanguageTooltip from '@/components/tooltips/LanguageTooltip.vue';
import ConditionTooltip from '@/components/tooltips/ConditionTooltip.vue';
import { cardImage } from '@/lib/cardImage';
defineEmits(['deleted', 'move']);
</script>

<template>
  <!-- Stable root so toggling layout swaps the inner content in place — keeps the
       parent TransitionGroup from running a leave/enter on the root (which flashed
       both layouts during a view switch). -->
  <div class="ce-root">
  <!-- ── Compact list row (basic view) ── -->
  <div
    v-if="layout === 'list'"
    class="card-row flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors"
    :style="{
      backgroundColor: 'var(--c-surface)',
      borderColor: wish.status === 'locked'
        ? 'color-mix(in srgb, var(--c-mutual) 60%, transparent)'
        : 'var(--c-border)',
      opacity: wish.status === 'locked' ? '0.85' : '1',
    }"
  >
    <!-- Thumbnail -->
    <div class="relative shrink-0">
      <img :src="cardImage(wish.image_id)" :alt="wish.name" loading="lazy" class="rounded block" style="width: 38px; aspect-ratio: 59/86; object-fit: cover" />
      <div
        v-if="wish.status === 'locked'"
        class="absolute inset-0 flex items-center justify-center rounded"
        style="background: rgba(0,0,0,0.55)"
      >
        <v-icon icon="mdi-handshake" size="14" color="var(--c-mutual)" />
      </div>
    </div>

    <!-- Name + meta -->
    <div class="min-w-0 flex-1 flex flex-col gap-1">
      <p class="font-semibold text-sm leading-tight truncate" style="color: var(--c-text)">{{ wish.name }}</p>
      <div class="flex flex-wrap items-center gap-2">
        <ConditionTooltip v-if="wish.condition" :condition="wish.condition" />
        <LanguageTooltip v-if="wish.language" :language="wish.language" />
        <v-tooltip v-if="wish.rarity" :text="wish.rarity" location="top">
          <template #activator="{ props: tip }">
            <span v-bind="tip" class="ce-rarity cursor-default">{{ shortenRarity(wish.rarity) }}</span>
          </template>
        </v-tooltip>
        <a
          :href="`https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=${encodeURIComponent(wish.name)}`"
          target="_blank"
          rel="noopener noreferrer"
          class="shrink-0 transition-opacity hover:opacity-70 flex items-center gap-1 no-underline text-[11px]"
          style="color: var(--c-muted)"
        ><v-icon icon="mdi-open-in-new" size="12" />{{ wish.extension }}</a>
      </div>
    </div>

    <!-- Move to another wishlist -->
    <v-menu v-if="canFile" location="bottom end">
      <template #activator="{ props: menu }">
        <button
          v-bind="menu"
          class="shrink-0 flex items-center justify-center rounded-md transition-colors ce-file"
          style="width: 30px; height: 30px"
          :title="$t('wishlists.moveTo')"
          :aria-label="$t('wishlists.moveTo')"
        >
          <v-icon icon="mdi-folder-move-outline" size="16" />
        </button>
      </template>
      <v-list density="compact" style="background: var(--c-surface); border: 1px solid var(--c-border)">
        <v-list-item
          v-for="opt in fileOptions"
          :key="opt.id ?? 'unsorted'"
          @click="$emit('move', { cardId: wish.id, listId: opt.id })"
        >
          <v-list-item-title class="text-sm" style="color: var(--c-text)">{{ opt.name }}</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-menu>

    <!-- Quantity / locked status -->
    <div class="shrink-0">
      <div
        v-if="wish.status === 'locked'"
        class="flex items-center gap-1.5 rounded-md px-2 !py-1.5"
        style="background: color-mix(in srgb, var(--c-mutual) 10%, transparent); border: 1px solid color-mix(in srgb, var(--c-mutual) 30%, transparent)"
      >
        <v-icon icon="mdi-lock-outline" size="13" color="var(--c-mutual)" />
        <span class="text-xs font-semibold tabular-nums" style="color: var(--c-mutual)">{{ wish.quantity }}</span>
      </div>
      <div v-else class="card-row-qty">
        <v-number-input
          hide-details
          density="compact"
          variant="outlined"
          control-variant="split"
          v-model="quantityCount"
          @update:model-value="onQuantityChange"
          :min="minQuantity"
        />
      </div>
    </div>
  </div>

  <!-- ── Card tile (grid view) ── -->
  <div
    v-else
    class="card-element flex flex-col rounded-b-lg border overflow-hidden transition-colors"
    :style="{
      backgroundColor: 'transparent',
      borderColor: wish.status === 'locked'
        ? 'color-mix(in srgb, var(--c-mutual) 60%, transparent)'
        : 'var(--c-border)',
      opacity: wish.status === 'locked' ? '0.8' : '1',
    }"
  >
    <!-- Card image -->
    <div class="relative">
      <img :src="cardImage(wish.image_id)" :alt="wish.name" loading="lazy" class="w-full object-cover" style="aspect-ratio: 59/86">

      <!-- Locked overlay (accepted trade) -->
      <div
        v-if="wish.status === 'locked'"
        class="absolute inset-0 flex flex-col items-center justify-center gap-2"
        style="background: rgba(0,0,0,0.6)"
      >
        <v-icon icon="mdi-handshake" size="22" color="var(--c-mutual)" />
        <span class="text-[10px] font-bold uppercase tracking-wide text-center px-2 leading-tight" style="color: var(--c-mutual)">{{ $t('cardElement.acceptedTrade') }}</span>
      </div>

    </div>

    <!-- Data -->
    <div class="flex flex-col gap-2 px-3 pt-2 pb-1" style="background-color: var(--c-surface)">
      <p class="font-semibold text-xs leading-tight truncate" style="color: var(--c-text)">{{ wish.name }}</p>
      <div class="flex flex-wrap gap-3">
        <ConditionTooltip v-if="wish.condition" :condition="wish.condition" />
        <LanguageTooltip v-if="wish.language" :language="wish.language" />
        <v-tooltip v-if="wish.rarity" :text="wish.rarity" location="top">
          <template #activator="{ props: tip }">
            <span v-bind="tip" class="ce-rarity cursor-default">{{ shortenRarity(wish.rarity) }}</span>
          </template>
        </v-tooltip>
        <a
          :href="`https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=${encodeURIComponent(wish.name)}`"
          target="_blank"
          rel="noopener noreferrer"
          class="shrink-0 transition-opacity hover:opacity-70 flex gap-1 no-underline text-xs"
          style="color: var(--c-muted)"
        ><v-icon icon="mdi-open-in-new" size="13" />{{ wish.extension }}</a>
      </div>
    </div>

    <!-- Quantity -->
    <div class="px-2 pb-2 flex flex-col gap-1" style="background-color: var(--c-surface)">

      <!-- Locked card: static quantity display, no controls -->
      <div
        v-if="wish.status === 'locked'"
        class="flex items-center justify-center gap-2 rounded-md py-2"
        style="background: color-mix(in srgb, var(--c-mutual) 10%, transparent); border: 1px solid color-mix(in srgb, var(--c-mutual) 30%, transparent)"
      >
        <v-icon icon="mdi-lock-outline" size="13" color="var(--c-mutual)" />
        <span class="text-xs font-semibold tabular-nums" style="color: var(--c-mutual)">
          {{ wish.quantity === 1 ? $t('cardElement.copyLocked') : $t('cardElement.copiesLocked', { count: wish.quantity }) }}
        </span>
      </div>

      <!-- Normal / reserved card: editable quantity input -->
      <template v-else>
        <v-number-input
          hide-details
          density="compact"
          variant="outlined"
          control-variant="split"
          v-model="quantityCount"
          @update:model-value="onQuantityChange"
          :min="minQuantity"
        />
      </template>

      <!-- Move to another wishlist -->
      <v-menu v-if="canFile" location="bottom end">
        <template #activator="{ props: menu }">
          <button
            v-bind="menu"
            class="flex items-center justify-center gap-1 rounded-md py-1 text-[11px] font-semibold transition-colors ce-file"
            :title="$t('wishlists.moveTo')"
          >
            <v-icon icon="mdi-folder-move-outline" size="13" />
            {{ $t('wishlists.moveTo') }}
          </button>
        </template>
        <v-list density="compact" style="background: var(--c-surface); border: 1px solid var(--c-border)">
          <v-list-item
            v-for="opt in fileOptions"
            :key="opt.id ?? 'unsorted'"
            @click="$emit('move', { cardId: wish.id, listId: opt.id })"
          >
            <v-list-item-title class="text-sm" style="color: var(--c-text)">{{ opt.name }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </div>
  </div>
  </div>
</template>

<script>
import { getClient } from "@/lib/supabaseClient";

export default {
  props: {
    wish:   { required: true },
    layout: { default: 'list' },
    // Named wishlists this card could be filed under. Empty for a trade-pile
    // card, which has no lists — the control hides itself rather than offering
    // somewhere to put something that cannot go there.
    lists:  { type: Array, default: () => [] },
  },
  data() {
    return {
      quantityCount: this.wish.quantity,
      reservedQty: 0,
      loadingReserved: false,
    };
  },
  computed: {
    /** Only a wished card can be filed, and only when there is a list to file
     *  it under. Mirrors the card_wishlist_only_when_wish CHECK. */
    canFile() {
      return !!this.wish?.wish && this.lists.length > 0;
    },
    /** The lists, plus the way back out to unsorted. */
    fileOptions() {
      return [
        ...this.lists.map(l => ({ id: l.id, name: l.name })),
        { id: null, name: this.$t('wishlists.unsorted') },
      ].filter(o => o.id !== (this.wish?.wishlist ?? null));
    },
    /**
     * The lowest value the quantity input allows.
     * Always derived from the live reservedQty count, not from wish.status —
     * so cards in accepted trades are protected even if the status column
     * wasn't updated server-side.
     */
    minQuantity() {
      return this.reservedQty;
    },
  },
  async mounted() {
    // Always check for active-trade reservations, regardless of wish.status.
    // wish.status drives the visual "Reserved" overlay; minQuantity drives
    // the edit floor — they must be independent.
    await this.fetchReservedQty();
  },
  methods: {
    shortenRarity(rarity) {
      return rarity.split(' ').map(w => w[0]).join('');
    },

    /**
     * Fetch how many copies of this card are committed in active trades.
     * Now uses locked Card copies as the source of truth — one locked row
     * is created per trade_item when a trade is accepted, so summing their
     * quantities gives the exact reserved floor.
     */
    async fetchReservedQty() {
      this.loadingReserved = true;
      try {
        const { data } = await getClient()
          .from('Card')
          .select('quantity')
          .eq('locked_original_card_id', this.wish.id)
          .eq('status', 'locked');

        this.reservedQty = (data ?? []).reduce((sum, r) => sum + (r.quantity ?? 0), 0);
      } catch {
        this.reservedQty = 0;
      } finally {
        this.loadingReserved = false;
      }
    },

    async onQuantityChange() {
      if (this.quantityCount < this.minQuantity) {
        this.quantityCount = this.minQuantity;
        return;
      }

      const supabase_client = getClient();
      if (this.quantityCount > 0) {
        await supabase_client.from('Card').update({ quantity: this.quantityCount }).eq('id', this.wish.id);
      } else {
        await supabase_client.from('Card').delete().eq('id', this.wish.id);
        this.$emit('deleted', this.wish.id);
      }
    },
  },
};
</script>

<style scoped>
/* A rarity code is an identifier, so it is set like one: monospace, in the same
   tinted-neutral chip the collection uses for its counts (DESIGN.md, The Mono
   Identifier Rule). It used to be Tailwind amber — a hue outside the palette,
   and at 1.8:1 on a light row it was not readable at all. */
.ce-rarity {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 5px;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.5;
  height: fit-content;
  color: var(--c-muted);
  background: color-mix(in srgb, var(--c-muted) 14%, transparent);
}

/* Quiet until wanted: filing is a thing you do occasionally, and a button per
   card at full contrast would compete with the card itself. */
.ce-file {
  color: var(--c-muted);
  border: 1px solid var(--c-border);
  background: transparent;
  cursor: pointer;
}
.ce-file:hover {
  color: var(--c-text);
  background: var(--c-surface-2);
}

.card-element {
  width: 160px;
}
@media (max-width: 639px) {
  .card-element { width: 100%; }
}

/* Compact stepper for the list row — keep the +/- control from stretching. */
.card-row-qty { width: 124px; }
.card-row:hover { background-color: var(--c-surface-2) !important; }
</style>
