<script setup>
import LibrarySection from "./library/LibrarySection.vue";
import { useI18n } from "vue-i18n";
const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col gap-6 md:gap-10 py-5 md:py-8">

    <!-- ── Toolbar: Deck Import + view switch ── -->
    <div>
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <button
          class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style="background-color: var(--c-surface-2); border: 1px solid var(--c-border); color: var(--c-text);"
          @click="showDeckImport = !showDeckImport"
        >
          <v-icon :icon="showDeckImport ? 'mdi-chevron-up' : 'mdi-file-import-outline'" size="18" />
          {{ $t('deckImport.title') }}
        </button>

        <button
          class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style="background-color: var(--c-surface-2); border: 1px solid var(--c-border); color: var(--c-text);"
          @click="showBulkAdd = !showBulkAdd"
        >
          <v-icon :icon="showBulkAdd ? 'mdi-chevron-up' : 'mdi-playlist-plus'" size="18" />
          {{ $t('bulkAdd.title') }}
        </button>

        <!-- View switch (rows vs tiles) -->
        <div
          class="inline-flex items-center rounded-lg p-0.5 gap-0.5"
          style="background: var(--c-surface-2); border: 1px solid var(--c-border)"
          role="group"
          :aria-label="$t('library.viewLabel')"
        >
          <button
            v-for="opt in viewOptions"
            :key="opt.key"
            class="flex items-center justify-center rounded-md cursor-pointer transition-colors"
            style="width: 44px; height: 36px"
            :style="viewMode === opt.key
              ? { background: 'var(--c-surface)', color: 'var(--c-accent)' }
              : { color: 'var(--c-muted)' }"
            :aria-pressed="viewMode === opt.key"
            :aria-label="opt.label"
            :title="opt.label"
            @click="viewMode = opt.key"
          >
            <v-icon :icon="opt.icon" size="20" />
          </button>
        </div>
      </div>

      <div v-if="showDeckImport" class="mt-4">
        <DeckImport
          :login="login"
          @requireAuth="$emit('requireAuth')"
          @added="onDeckImportAdded"
        />
      </div>

      <div v-if="showBulkAdd" class="mt-4">
        <BulkAddCards
          @requireAuth="$emit('requireAuth')"
          @added="onBulkAdded"
        />
      </div>
    </div>

    <LibrarySection
      :title="t('library.tradePile')"
      mode="trade"
      :view="viewMode"
      :cards="trade_cards.value"
      :loading="loading"
      :new-card-id="newCardId"
      :empty-text="t('library.emptyTrade')"
      ring-class="ring-blue-400"
      @added="onCardAdded"
      @deleted="onCardDeleted"
    />

    <LibrarySection
      :title="t('library.wishlist')"
      mode="wish"
      :view="viewMode"
      :cards="wished_cards.value"
      :loading="loading"
      :new-card-id="newCardId"
      :empty-text="t('library.emptyWish')"
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
import DeckImport from "@/components/DeckImport.vue";
import BulkAddCards from "@/components/BulkAddCards.vue";

export default {
  components: { DeckImport, BulkAddCards },
  props: ['login'],
  emits: ['requireAuth'],
  data() {
    return {
      wished_cards: ref([]),
      wishes_quantity: 0,
      trade_cards: ref([]),
      trades_quantity: 0,
      loading: true,
      newCardId: null,
      snackbar: { open: false, message: '', color: '', icon: '' },
      showDeckImport: false,
      showBulkAdd: false,
      // Collection layout: 'list' (compact rows, default) | 'grid' (card tiles).
      // Restored from localStorage in mounted().
      viewMode: 'list',
    };
  },
  computed: {
    viewOptions() {
      return [
        { key: 'list', icon: 'mdi-view-list',        label: this.$t('library.viewList') },
        { key: 'grid', icon: 'mdi-view-grid-outline', label: this.$t('library.viewGrid') },
      ];
    },
  },
  watch: {
    viewMode(val) {
      if (typeof localStorage !== 'undefined') localStorage.setItem('libraryView', val);
    },
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

    onDeckImportAdded(count) {
      this.snackbar = {
        open: true,
        message: this.$t('deckImport.added', count, { count }),
        color: 'var(--c-accent)',
        icon: 'mdi-heart-plus',
      };
    },

    onBulkAdded(count) {
      this.snackbar = {
        open: true,
        message: this.$t('bulkAdd.added', count, { count }),
        color: 'var(--c-accent)',
        icon: 'mdi-playlist-plus',
      };
    },

    onCardAdded(newCard) {
      if (newCard.wish) {
        this.wished_cards.value = [newCard, ...this.wished_cards.value];
        this.wishes_quantity++;
        this.snackbar = { open: true, message: this.$t('library.addedToWishlist', { name: newCard.name }), color: 'var(--c-accent)', icon: 'mdi-heart-plus' };
      } else {
        this.trade_cards.value = [newCard, ...this.trade_cards.value];
        this.trades_quantity++;
        this.snackbar = { open: true, message: this.$t('library.addedToTrade', { name: newCard.name }), color: 'var(--c-trade)', icon: 'mdi-plus-box' };
      }
      this.newCardId = newCard.id;
      setTimeout(() => { this.newCardId = null; }, 2000);
    },
  },
  async mounted() {
    // Restore the saved collection layout (default: compact rows).
    const savedView = typeof localStorage !== 'undefined' ? localStorage.getItem('libraryView') : null;
    if (savedView === 'grid' || savedView === 'list') this.viewMode = savedView;

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
