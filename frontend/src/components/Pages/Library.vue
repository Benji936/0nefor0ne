<script setup>
import LibrarySection from "./library/LibrarySection.vue";
</script>

<template>
  <div class="flex flex-col gap-6 md:gap-10 py-5 md:py-8">

    <LibrarySection
      title="Cards for trade"
      mode="trade"
      :cards="trade_cards.value"
      :loading="loading"
      :new-card-id="newCardId"
      empty-text="Nothing here yet — click &quot;Add card&quot; to list cards you have for trade."
      ring-class="ring-blue-400"
      @added="onCardAdded"
      @deleted="onCardDeleted"
    />

    <LibrarySection
      title="Wishlist"
      mode="wish"
      :cards="wished_cards.value"
      :loading="loading"
      :new-card-id="newCardId"
      empty-text="Nothing here yet — click &quot;Add card&quot; to list cards you're hunting for."
      ring-class="ring-pink-400"
      @added="onCardAdded"
      @deleted="onCardDeleted"
    />

  </div>

  <v-snackbar v-model="snackbar.open" :timeout="3000" :color="snackbar.color" location="bottom right">
    <v-icon :icon="snackbar.icon" class="mr-2" size="18" />
    {{ snackbar.message }}
  </v-snackbar>
</template>

<script>
import { getClient } from "@/lib/supabaseClient";
import { ref } from "vue";

export default {
  props: ['login'],
  data() {
    return {
      wished_cards: ref([]),
      wishes_quantity: 0,
      trade_cards: ref([]),
      trades_quantity: 0,
      loading: true,
      newCardId: null,
      snackbar: { open: false, message: '', color: '', icon: '' },
    };
  },
  methods: {
    filterCovered(cards) {
      // Hide original cards that have a locked copy in an accepted trade.
      const lockedOriginalIds = new Set(
        cards
          .filter(c => c.status === 'locked' && c.locked_original_card_id)
          .map(c => c.locked_original_card_id)
      );
      return cards.filter(c => c.status === 'locked' || !lockedOriginalIds.has(c.id));
    },

    onCardDeleted(cardId) {
      this.trade_cards.value  = this.trade_cards.value.filter(c => c.id !== cardId);
      this.wished_cards.value = this.wished_cards.value.filter(c => c.id !== cardId);
      this.trades_quantity = this.trade_cards.value.length;
      this.wishes_quantity = this.wished_cards.value.length;
    },

    onCardAdded(newCard) {
      if (newCard.wish) {
        this.wished_cards.value = [newCard, ...this.wished_cards.value];
        this.wishes_quantity++;
        this.snackbar = { open: true, message: `"${newCard.name}" added to wishlist.`, color: 'var(--c-accent)', icon: 'mdi-heart-plus' };
      } else {
        this.trade_cards.value = [newCard, ...this.trade_cards.value];
        this.trades_quantity++;
        this.snackbar = { open: true, message: `"${newCard.name}" added to trade pile.`, color: 'var(--c-trade)', icon: 'mdi-plus-box' };
      }
      this.newCardId = newCard.id;
      setTimeout(() => { this.newCardId = null; }, 2000);
    },
  },
  async mounted() {
    const [wishes, trades] = await Promise.all([
      getClient().from('Card').select('*').eq('wish', true).eq('trader', this.login.user.id).neq('status', 'traded'),
      getClient().from('Card').select('*').eq('wish', false).eq('trader', this.login.user.id).neq('status', 'traded'),
    ]);

    const allLoaded = [...(wishes.data ?? []), ...(trades.data ?? [])];
    const zeroes = allLoaded.filter(c => (c.quantity ?? 0) <= 0 && c.status !== 'locked').map(c => c.id);
    if (zeroes.length) await getClient().from('Card').delete().in('id', zeroes);

    this.wished_cards.value = this.filterCovered((wishes.data ?? []).filter(c => (c.quantity ?? 0) > 0 || c.status === 'locked'));
    this.trade_cards.value  = this.filterCovered((trades.data ?? []).filter(c => (c.quantity ?? 0) > 0 || c.status === 'locked'));
    this.wishes_quantity = this.wished_cards.value.length;
    this.trades_quantity = this.trade_cards.value.length;
    this.loading = false;

    getClient().channel('custom-all-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Card' }, async () => {
        const [w, t] = await Promise.all([
          getClient().from('Card').select('*').eq('wish', true).eq('trader', this.login.user.id).neq('status', 'traded'),
          getClient().from('Card').select('*').eq('wish', false).eq('trader', this.login.user.id).neq('status', 'traded'),
        ]);
        this.wished_cards.value = this.filterCovered(w.data ?? []);
        this.trade_cards.value  = this.filterCovered(t.data ?? []);
        this.wishes_quantity = this.wished_cards.value.length;
        this.trades_quantity = this.trade_cards.value.length;
      })
      .subscribe();
  },
};
</script>
