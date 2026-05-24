<script setup>
import LanguageTooltip from './tooltips/LanguageTooltip.vue';
import ConditionTooltip from './tooltips/ConditionTooltip.vue';
import { cardImage } from '@/lib/cardImage';
defineEmits(['deleted']);
</script>

<template>
  <div
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
        <span class="text-[10px] font-bold uppercase tracking-wide text-center px-2 leading-tight" style="color: var(--c-mutual)">Accepted trade</span>
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
            <span v-bind="tip" class="py-1 px-1 rounded text-xs h-fit bg-amber-900/50 text-amber-300 cursor-default">{{ shortenRarity(wish.rarity) }}</span>
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
          {{ wish.quantity }} {{ wish.quantity === 1 ? 'copy' : 'copies' }} locked
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
    </div>
  </div>
</template>

<script>
import { getClient } from "@/lib/supabaseClient";

export default {
  props: ['wish'],
  data() {
    return {
      quantityCount: this.wish.quantity,
      reservedQty: 0,
      loadingReserved: false,
    };
  },
  computed: {
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
.card-element {
  width: 160px;
}
@media (max-width: 639px) {
  .card-element { width: 100%; }
}
</style>
