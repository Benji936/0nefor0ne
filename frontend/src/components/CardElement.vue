<script setup>
import LanguageTooltip from './tooltips/LanguageTooltip.vue';
import ConditionTooltip from './tooltips/ConditionTooltip.vue';
import { cardImage } from '@/lib/cardImage';
</script>

<template>
  <div
    class="flex flex-col rounded-b-lg border overflow-hidden transition-colors"
    style="background-color: var(--c-surface-2); border-color: var(--c-border); width: 160px"
  >
    <!-- Card image -->
    <img :src="cardImage(wish.image_id)" :alt="wish.name" class="w-full object-cover" style="aspect-ratio: 59/86">

    <!-- Data -->
    <div class="flex flex-col gap-1.5 px-3 pt-2 pb-1">
      <p class="font-semibold text-xs leading-tight truncate" style="color: var(--c-text)">{{ wish.name }}</p>
      <div class="flex flex-wrap gap-1 items-center">
        <ConditionTooltip v-if="wish.condition" :condition="wish.condition" />
        <LanguageTooltip v-if="wish.language" :language="wish.language" />
        <span v-if="wish.rarity" class="px-1 py-0.5 rounded text-[10px] bg-amber-900/50 border border-amber-700/40 text-amber-300 leading-none" :title="wish.rarity">{{ shortenRarity(wish.rarity) }}</span>
        <span v-if="wish.extension" class="text-[10px] leading-none" style="color: var(--c-muted)">{{ wish.extension }}</span>
      </div>
    </div>

    <!-- Quantity -->
    <div class="px-2 pb-2">
      <v-number-input
        hide-details
        density="compact"
        variant="outlined"
        control-variant="split"
        v-model="quantityCount"
        @update:model-value="onQuantityChange"
        :min="0"
      />
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
    };
  },
  methods: {
    shortenRarity(rarity) {
      return rarity.split(' ').map(w => w[0]).join('');
    },
    async onQuantityChange() {
      const supabase_client = getClient();
      if (this.quantityCount > 0) {
        await supabase_client.from('Card').update({ quantity: this.quantityCount }).eq('id', this.wish.id);
      } else {
        await supabase_client.from('Card').delete().eq('id', this.wish.id);
      }
    },
  },
};
</script>
