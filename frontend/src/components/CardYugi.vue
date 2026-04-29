<script setup>
import { cardImage } from '@/lib/cardImage'
const emit = defineEmits(['showTraders'])
</script>

<template>
  <v-overlay class="w-50 place-self-center align-center">
    <template v-slot:activator="{ props: activatorProps }">
      <div class="hover:outline hover:outline-white cursor-pointer" v-bind="activatorProps">
        <img alt="image" class="h-48 object-cover rounded" :src="cardImage(componentCard.id)" />
      </div>
    </template>

    <template v-slot:default="{ isActive }">
      <div
        class="flex flex-col gap-5 px-10 py-7 rounded-xl"
        style="background-color: var(--c-surface); color: var(--c-text); max-width: 680px"
      >
        <div class="flex flex-row gap-5">
          <img alt="image" class="h-72 w-52 object-cover rounded shrink-0" :src="cardImage(componentCard.id)" />
          <div class="flex flex-col gap-2">
            <p class="font-bold text-xl" style="color: var(--c-text)">{{ componentCard.name }}</p>
            <div class="flex flex-row gap-3 text-lg" style="color: var(--c-muted)">
              <p v-if="componentCard.atk != null">ATK {{ componentCard.atk }}</p>
              <p v-if="componentCard.def != null">DEF {{ componentCard.def }}</p>
              <p v-if="componentCard.level != null">Level {{ componentCard.level }}</p>
              <p>{{ componentCard.race }}</p>
            </div>
            <p class="text-justify text-sm" style="color: var(--c-text); opacity: 0.85">{{ componentCard.desc }}</p>

            <!-- Prices -->
            <div v-if="prices" class="flex flex-wrap gap-2 mt-1">
              <a
                v-for="p in prices" :key="p.label"
                :href="p.url"
                target="_blank"
                rel="noopener noreferrer"
                class="text-xs px-2 py-1 rounded-md border font-medium no-underline cursor-pointer transition-opacity hover:opacity-70"
                style="border-color: var(--c-border); background-color: var(--c-surface-2); color: var(--c-text)"
              >
                {{ p.label }} <span style="color: var(--c-accent)">{{ p.value }}</span>
              </a>
            </div>
          </div>
        </div>

        <div class="flex flex-row gap-3">
          <v-btn
            class="grow"
            variant="flat"
            :style="{ backgroundColor: 'var(--c-trade)', color: 'white' }"
            prepend-icon="mdi-plus-box"
            @click="openTrade"
          >
            Add to trade pile
          </v-btn>

          <v-btn
            class="grow"
            variant="flat"
            :style="{ backgroundColor: 'var(--c-accent)', color: 'white' }"
            prepend-icon="mdi-heart-plus"
            @click="openWish"
          >
            Add to wishlist
          </v-btn>

          <v-btn
            class="grow"
            variant="flat"
            :style="{ backgroundColor: 'var(--c-mutual)', color: 'white' }"
            append-icon="mdi-swap-horizontal"
            @click="emit('showTraders', componentCard)"
          >
            See traders
          </v-btn>
        </div>
      </div>
    </template>
  </v-overlay>

  <!-- Headless AddCard dialogs — outside v-overlay to avoid teleport ref issues -->
  <AddCard ref="tradeAdd" mode="trade" :headless="true" />
  <AddCard ref="wishAdd" mode="wish" :headless="true" />
</template>

<script>
import AddCard from './AddCard.vue';

export default {
  components: { AddCard },
  props: {
    componentCard: { type: Object, required: true },
    extension: { type: String, default: '' },
  },
  computed: {
    prices() {
      const p = this.componentCard.card_prices?.[0];
      if (!p) return null;
      const name = encodeURIComponent(this.componentCard.name);
      const fmt = (v) => v && parseFloat(v) > 0 ? `$${parseFloat(v).toFixed(2)}` : null;
      const entries = [
        {
          label: 'TCGPlayer',
          value: fmt(p.tcgplayer_price),
          url: `https://www.tcgplayer.com/search/yugioh/product?q=${name}`,
        },
        {
          label: 'Cardmarket',
          value: fmt(p.cardmarket_price),
          url: `https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=${name}`,
        },
        {
          label: 'eBay',
          value: fmt(p.ebay_price),
          url: `https://www.ebay.com/sch/i.html?_nkw=${name}+yugioh`,
        },
      ].filter(e => e.value);
      return entries.length ? entries : null;
    },
  },
  data() {
    return { over: false };
  },
  methods: {
    openTrade() {
      this.$refs.tradeAdd.openWith(this.componentCard, this.extension);
    },
    openWish() {
      this.$refs.wishAdd.openWith(this.componentCard, this.extension);
    },
  },
};
</script>
