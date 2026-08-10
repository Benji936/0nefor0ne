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
          class="inline-flex items-center rounded-lg !p-0.5 gap-0.5"
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

    <!-- ── Wishlist ── -->
    <!-- One section when there are no named lists, so somebody who never makes
         one sees exactly what they saw before. Once lists exist it becomes a
         heading plus a sub-section per list. -->
    <LibrarySection
      v-if="!wishlists.length"
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
    >
      <template #actions>
        <button class="lib-listbtn" @click="promptNewList">
          <v-icon icon="mdi-playlist-plus" size="16" />
          {{ t('wishlists.newList') }}
        </button>
      </template>
    </LibrarySection>

    <div v-else class="flex flex-col gap-4">
      <div class="flex flex-row items-center justify-between gap-2">
        <p class="text-left text-xl uppercase font-semibold tracking-wide" style="color: var(--c-text)">
          {{ t('library.wishlist') }}
        </p>
        <div class="flex items-center gap-1">
          <button class="lib-listbtn" @click="promptNewList">
            <v-icon icon="mdi-playlist-plus" size="16" />
            {{ t('wishlists.newList') }}
          </button>
          <AddCard mode="wish" @added="onCardAdded" />
        </div>
      </div>

      <LibrarySection
        v-for="group in wishlistGroups"
        :key="group.id ?? 'unsorted'"
        :title="group.name ?? t('wishlists.unsorted')"
        mode="wish"
        dense
        :show-add="false"
        :lists="wishlists"
        :view="viewMode"
        :cards="group.cards"
        :loading="loading"
        :new-card-id="newCardId"
        :empty-text="t('wishlists.emptyList')"
        ring-class="ring-pink-400"
        @deleted="onCardDeleted"
        @move="onCardMoved"
      >
        <!-- Unsorted is the absence of a list, so there is nothing to rename. -->
        <template v-if="group.id" #actions>
          <button class="lib-listbtn lib-listbtn--icon" :title="t('wishlists.rename')" @click="promptRename(group)">
            <v-icon icon="mdi-pencil-outline" size="14" />
          </button>
          <button class="lib-listbtn lib-listbtn--icon" :title="t('wishlists.delete')" @click="confirmDelete(group)">
            <v-icon icon="mdi-trash-can-outline" size="14" />
          </button>
        </template>
      </LibrarySection>
    </div>

  </div>

  <!-- Name a list: used for both creating and renaming. -->
  <v-dialog v-model="listDialog.open" max-width="420">
    <div class="lib-dlg">
      <p class="lib-dlg__title">
        {{ listDialog.id ? t('wishlists.rename') : t('wishlists.newList') }}
      </p>
      <input
        ref="listNameInput"
        v-model="listDialog.name"
        class="lib-dlg__input"
        :maxlength="MAX_NAME_LEN"
        :placeholder="t('wishlists.namePlaceholder')"
        @keyup.enter="saveList"
      />
      <p v-if="listNameError" class="lib-dlg__err">{{ listNameError }}</p>
      <div class="lib-dlg__row">
        <button class="lib-dlg__btn" @click="listDialog.open = false">{{ t('common.cancel') }}</button>
        <button class="lib-dlg__btn lib-dlg__btn--go" :disabled="!!listNameError || !listDialog.name.trim()" @click="saveList">
          {{ t('wishlists.save') }}
        </button>
      </div>
    </div>
  </v-dialog>

  <v-snackbar v-model="snackbar.open" :timeout="3000" :color="snackbar.color" location="bottom right">
    <v-icon :icon="snackbar.icon" class="mr-2" size="18" />
    {{ snackbar.message }}
  </v-snackbar>
</template>

<script>
import { getClient } from "@/lib/supabaseClient";
import { ref } from "vue";
import DeckImport from "@/components/library/DeckImport.vue";
import BulkAddCards from "@/components/library/BulkAddCards.vue";
import AddCard from "@/components/library/AddCard.vue";
import {
  fetchWishlists, createWishlist, renameWishlist, deleteWishlist,
  moveCardToList, groupByList, nameProblem, MAX_NAME_LEN,
} from "@/lib/wishlists";

export default {
  components: { DeckImport, BulkAddCards, AddCard },
  props: ['login'],
  emits: ['requireAuth'],
  data() {
    return {
      MAX_NAME_LEN,
      wishlists: [],
      listDialog: { open: false, id: null, name: '' },
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
    wishlistGroups() {
      return groupByList(this.wishlists, this.wished_cards.value);
    },
    /** The reason the typed name cannot be used, already translated, or null. */
    listNameError() {
      if (!this.listDialog.open) return null;
      const problem = nameProblem(this.listDialog.name, this.wishlists, this.listDialog.id);
      if (!problem) return null;
      // "empty" is the state the field starts in; saying so before they have
      // typed anything is nagging. The save button is disabled regardless.
      if (problem === 'empty') return null;
      return this.$t(`wishlists.error.${problem}`, { max: MAX_NAME_LEN });
    },
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
    // Same reason as the trade centre: this page is not gated on the session,
    // so a direct URL load mounts it before App has one. Without this, the
    // collection stays empty until you navigate away and back.
    'login.user.id'(id, was) {
      if (!id || id === was) return;
      this.loadEverything();
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

    // ── Named wishlists ───────────────────────────────────────────────
    promptNewList() {
      this.listDialog = { open: true, id: null, name: '' };
      this.$nextTick(() => this.$refs.listNameInput?.focus());
    },
    promptRename(group) {
      this.listDialog = { open: true, id: group.id, name: group.name };
      this.$nextTick(() => this.$refs.listNameInput?.select());
    },
    async saveList() {
      const name = this.listDialog.name.trim();
      if (!name || this.listNameError) return;
      try {
        if (this.listDialog.id) {
          await renameWishlist(this.listDialog.id, name);
        } else {
          await createWishlist(name, {
            ownerId: this.login.user.id,
            sortOrder: this.wishlists.length,
          });
        }
        this.wishlists = await fetchWishlists();
        this.listDialog.open = false;
      } catch (err) {
        console.error('saveList failed', err);
        this.snackbar = { open: true, message: this.$t('wishlists.saveFailed'), color: 'var(--c-accent)', icon: 'mdi-alert-circle-outline' };
      }
    },
    async confirmDelete(group) {
      // The cards survive — the database sets them back to unsorted — so this
      // does not need the ceremony of a destructive confirmation.
      try {
        await deleteWishlist(group.id);
        this.wishlists = await fetchWishlists();
        await this.reloadCards();
        this.snackbar = { open: true, message: this.$t('wishlists.deleted', { name: group.name }), color: 'var(--c-muted)', icon: 'mdi-playlist-remove' };
      } catch (err) {
        console.error('deleteWishlist failed', err);
        this.snackbar = { open: true, message: this.$t('wishlists.saveFailed'), color: 'var(--c-accent)', icon: 'mdi-alert-circle-outline' };
      }
    },
    async onCardMoved({ cardId, listId }) {
      // Move it on screen first: the round trip is short but a card that sits
      // still after you have filed it reads as a click that did not land.
      const card = this.wished_cards.value.find(c => c.id === cardId);
      const previous = card?.wishlist ?? null;
      if (card) card.wishlist = listId;
      try {
        await moveCardToList(cardId, listId);
      } catch (err) {
        console.error('moveCardToList failed', err);
        if (card) card.wishlist = previous;
        this.snackbar = { open: true, message: this.$t('wishlists.moveFailed'), color: 'var(--c-accent)', icon: 'mdi-alert-circle-outline' };
      }
    },

    /**
     * First load: the piles, the lists, and the realtime subscription.
     *
     * Guarded on the session, and re-run by the `login.user.id` watcher when it
     * arrives. Opening /library by its URL mounts this page before App has
     * finished restoring the session — this used to read `this.login.user.id`
     * off null and throw, which took the rest of mounted() down with it.
     */
    async loadEverything() {
      if (!this.login?.user?.id) return;

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
      this.wishlists = await fetchWishlists();
      this.loading = false;

      // Guarded so a second call — the watcher firing after mounted already
      // ran — does not leave an orphaned channel behind.
      if (!this._cardChannel) {
        this._cardChannel = getClient().channel('library-cards')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'Card' }, () => this.reloadCards())
          .subscribe();
      }
    },

    /** Re-read both piles. Shared by the realtime handler and by anything that
     *  changes which list a card is on out from under the local copy. */
    async reloadCards() {
      if (!this.login?.user?.id) return;
      const [w, t] = await Promise.all([
        getClient().from('Card').select('*').eq('wish', true).eq('trader', this.login.user.id).neq('status', 'traded'),
        getClient().from('Card').select('*').eq('wish', false).eq('trader', this.login.user.id).neq('status', 'traded'),
      ]);
      this.wished_cards.value = this.filterCovered(w.data ?? []);
      this.trade_cards.value  = this.filterCovered(t.data ?? []);
      this.wishes_quantity = this.wished_cards.value.length;
      this.trades_quantity = this.trade_cards.value.length;
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

    await this.loadEverything();
  },
  beforeUnmount() {
    if (this._cardChannel) getClient().removeChannel(this._cardChannel);
  },
};
</script>

<style scoped>
/* List controls sit beside AddCard, so they borrow its quiet weight rather
   than competing with it. */
.lib-listbtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--c-muted);
  background: var(--c-surface-2);
  border: 1px solid var(--c-border);
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}
.lib-listbtn:hover { color: var(--c-text); background: var(--c-surface); }
.lib-listbtn--icon { padding: 5px 7px; }

/* ── Name-a-list dialog ── */
.lib-dlg {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  border-radius: 16px;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
}
.lib-dlg__title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--c-text);
}
.lib-dlg__input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 14px;
  color: var(--c-text);
  background: var(--c-surface-2);
  border: 1px solid var(--c-border);
  outline: none;
}
.lib-dlg__input:focus { border-color: var(--c-accent); }
.lib-dlg__err { margin: 0; font-size: 12px; color: var(--c-accent); }
.lib-dlg__row { display: flex; justify-content: flex-end; gap: 8px; }
.lib-dlg__btn {
  padding: 8px 14px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 600;
  color: var(--c-muted);
  background: transparent;
  border: 1px solid var(--c-border);
  cursor: pointer;
}
.lib-dlg__btn--go {
  color: white;
  background: var(--c-accent);
  border-color: var(--c-accent);
}
.lib-dlg__btn:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
