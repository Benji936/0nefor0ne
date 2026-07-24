<script setup>
// Card thumbnail tile used across the search/result grids. Clicking navigates to
// the card's permalink page (CardPage), which carries the full detail view —
// add-to-trade/wishlist, traders, printings, combo explorer, etc. The hover
// preview (CardHoverPreview, mounted globally) provides the quick peek.
import { useRoute } from 'vue-router';
import { cardImage } from '@/lib/cardImage';
import CardKindIcons from './CardKindIcons.vue';
import CardBanlistBadge from './CardBanlistBadge.vue';

defineProps({
  componentCard: { type: Object, required: true },
  // Still accepted so parents can keep passing it; no longer used here.
  extension: { type: String, default: '' },
});
// Declared for backward-compatibility with parents that still bind these from the
// old overlay; they are simply never emitted now.
defineEmits(['showTraders', 'requireAuth']);

const route = useRoute();
</script>

<template>
  <router-link
    :to="`/${route.params.locale || 'en'}/card/${componentCard.id}`"
    class="hover:outline hover:outline-white cursor-pointer w-fit relative block no-underline"
    :title="componentCard.name"
  >
    <img
      :alt="componentCard.name"
      loading="lazy"
      class="h-48 object-cover rounded block"
      style="aspect-ratio: 59/86"
      :src="cardImage(componentCard.id)"
    />
    <CardKindIcons
      :card="componentCard"
      :size="18"
      :icons-only="true"
      class="absolute top-1 right-1 rounded-md px-1 !py-0.5"
      style="background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(2px)"
    />
    <CardBanlistBadge :card="componentCard" class="absolute top-1 left-1" />
  </router-link>
</template>
