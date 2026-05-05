<script setup>
import { cardImage } from '@/lib/cardImage'
const emit = defineEmits(['showTraders'])
</script>

<template>
  <v-overlay class="align-center justify-center rounded-lg" :opacity="0" transition="scale-transition" @click.self="$emit('close')">
    <template v-slot:activator="{ props: activatorProps }">
      <div class="hover:outline hover:outline-white cursor-pointer" v-bind="activatorProps">
        <img :alt="componentCard.name" loading="lazy" class="h-48 object-cover rounded" style="aspect-ratio: 59/86" :src="cardImage(componentCard.id)" />
      </div>
    </template>

    <template v-slot:default="{ isActive }">
      <div
        class="flex flex-col gap-4 px-4 py-5 sm:px-10 sm:py-7 rounded-xl overflow-y-auto"
        style="background-color: var(--c-surface); color: var(--c-text); width: min(680px, calc(100vw - 24px)); max-height: 90dvh"
      >
        <!-- Card image + data -->
        <div class="flex flex-col sm:flex-row gap-4 sm:gap-5">
          <img :alt="componentCard.name" loading="lazy" class="h-52 sm:h-72 shrink-0 mx-auto sm:mx-0 rounded" :src="cardImage(componentCard.id)" />
          <div class="flex flex-col gap-2">
            <p class="font-bold text-xl" style="color: var(--c-text)">{{ componentCard.name }}</p>
            <div class="flex flex-wrap gap-3 text-base" style="color: var(--c-muted)">
              <p v-if="componentCard.atk != null">ATK {{ componentCard.atk }}</p>
              <p v-if="componentCard.def != null">DEF {{ componentCard.def }}</p>
              <p v-if="componentCard.level != null">Level {{ componentCard.level }}</p>
              <p>{{ componentCard.race }}</p>
            </div>
            <p class="text-sm leading-relaxed" style="color: var(--c-text); opacity: 0.85">{{ componentCard.desc }}</p>
          </div>
        </div>

        <!-- Prints -->
        <div v-if="printPrices.length" class="rounded-lg border overflow-hidden" style="border-color: var(--c-border)">
          <div class="overflow-y-auto" style="max-height: 110px">
            <div
              v-for="s in printPrices" :key="s.set_code"
              class="flex items-center gap-2 px-3 py-1.5 border-b last:border-0 text-xs"
              style="border-color: var(--c-border)"
            >
              <span class="font-mono font-semibold shrink-0" style="color: var(--c-text)">{{ s.set_code }}</span>
              <span class="truncate grow" style="color: var(--c-muted)">{{ s.set_rarity }}</span>
              <a
                :href="`https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=${encodeURIComponent(s.set_code)}`"
                target="_blank"
                rel="noopener noreferrer"
                class="shrink-0 transition-opacity hover:opacity-70 flex items-center gap-1 no-underline text-xs"
                style="color: var(--c-muted)"
              >
                <v-icon icon="mdi-open-in-new" size="13" />
                Cardmarket
              </a>
            </div>
          </div>
        </div>

        <!-- Footer links -->
        <div class="flex gap-3 -mt-3">
          <a
            v-for="m in marketLinks" :key="m.label"
            :href="m.url"
            target="_blank"
            rel="noopener noreferrer"
            class="text-xs no-underline transition-opacity hover:opacity-70 flex items-center gap-1"
            style="color: var(--c-muted)"
          >
            <v-icon icon="mdi-open-in-new" size="12" />
            {{ m.label }}
          </a>
        </div>

        <!-- Buttons -->
        <div class="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <v-btn
            class="grow"
            variant="flat"
            :style="{ backgroundColor: 'var(--c-trade)', color: 'white', minHeight: '44px' }"
            prepend-icon="mdi-plus-box"
            @click="openTrade"
          >Add to trade pile</v-btn>

          <v-btn
            class="grow"
            variant="flat"
            :style="{ backgroundColor: 'var(--c-accent)', color: 'white', minHeight: '44px' }"
            prepend-icon="mdi-heart-plus"
            @click="openWish"
          >Add to wishlist</v-btn>

          <v-btn
            class="grow"
            variant="flat"
            :style="{ backgroundColor: 'var(--c-mutual)', color: 'white', minHeight: '44px' }"
            append-icon="mdi-swap-horizontal"
            @click="emit('showTraders', componentCard)"
          >See traders</v-btn>
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
  data() {
    return { over: false };
  },
  computed: {
    printPrices() {
      return this.componentCard.card_sets ?? [];
    },
    marketLinks() {
      const name = encodeURIComponent(this.componentCard.name);
      return [
        { label: 'TCGPlayer', url: `https://www.tcgplayer.com/search/yugioh/product?q=${name}` },
        { label: 'eBay', url: `https://www.ebay.com/sch/i.html?_nkw=${name}+yugioh` },
      ];
    },
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
