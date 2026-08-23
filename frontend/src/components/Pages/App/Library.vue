<script setup>
import LibrarySection from "./library/LibrarySection.vue";
import { useI18n } from "vue-i18n";
const { t } = useI18n();
</script>

<template>
  <div class="lib" :class="`lib--${pile}`">

    <!-- ── The binder's two halves ──────────────────────────────────────────
         Dividers, not a pill row or an underline: the open tab drops its bottom
         edge and becomes the top of the page below it, the way a tabbed divider
         is part of the section it opens. The page takes that tab's colour with
         it — amethyst for what you give, pink for what you want — because
         filing a card into the wrong half is the mistake that actually costs
         you here: a card in the trade pile is a standing offer. -->
    <div class="lib-dividers">
      <!-- Pressed buttons, not role="tab". The ARIA tab pattern promises
           arrow-key navigation between tabs and a wired-up tabpanel; half of it
           is worse for a screen reader than none, and these are really
           navigation — each one is a URL. -->
      <div class="lib-tabs" role="group" :aria-label="$t('nav.collection')">
        <button
          v-for="p in piles"
          :key="p.key"
          type="button"
          class="lib-tab"
          :class="[`lib-tab--${p.key}`, { 'is-open': pile === p.key }]"
          :aria-pressed="pile === p.key ? 'true' : 'false'"
          @click="pile = p.key"
        >
          <v-icon :icon="p.icon" size="16" class="shrink-0" />
          <span class="lib-tab__name">{{ p.label }}</span>
          <span class="lib-tab__n tabular-nums">{{ loading ? '–' : p.count }}</span>
        </button>
      </div>

      <div class="lib-tools">
        <div
          class="lib-view"
          role="group"
          :aria-label="$t('library.viewLabel')"
        >
          <button
            v-for="opt in viewOptions"
            :key="opt.key"
            type="button"
            class="lib-view__btn"
            :class="{ 'is-on': viewMode === opt.key }"
            :aria-pressed="viewMode === opt.key ? 'true' : 'false'"
            :aria-label="opt.label"
            :title="opt.label"
            @click="viewMode = opt.key"
          >
            <v-icon :icon="opt.icon" size="19" />
          </button>
        </div>

        <!-- A decklist is a list of cards you want, so importing one only
             belongs to the wants half. It used to sit here in both, silently
             filling a wishlist while you were looking at your trade pile. -->
        <button
          v-if="pile === 'wishlist'"
          type="button"
          class="lib-toolbtn"
          :class="{ 'is-on': showDeckImport }"
          @click="showDeckImport = !showDeckImport"
        >
          <v-icon :icon="showDeckImport ? 'mdi-chevron-up' : 'mdi-file-import-outline'" size="17" />
          <span class="lib-toolbtn__label">{{ $t('deckImport.title') }}</span>
        </button>

        <!-- Straight into the dialog. This used to open a drawer whose only
             content was a second button that did the same thing. Deck import
             keeps its drawer because it really is an inline panel — a drop
             zone — which is what the chevron on it distinguishes. -->
        <button type="button" class="lib-toolbtn" @click="$refs.bulkAddRef?.open()">
          <v-icon icon="mdi-playlist-plus" size="17" />
          <span class="lib-toolbtn__label">{{ $t('bulkAdd.title') }}</span>
        </button>

        <!-- Just "Add card": the tab directly above already names the pile and
             the button wears its colour, so spelling it out again is the label
             doing the tab's job — and on a phone it made this the only control
             wide enough to need its own row. -->
        <AddCard :key="mode" :mode="mode" @added="onCardAdded" />
      </div>
    </div>

    <!-- ── The open page ── -->
    <div class="lib-page">

      <div v-if="showDeckImport" class="lib-drawer">
        <DeckImport
          :login="login"
          @requireAuth="$emit('requireAuth')"
          @added="onDeckImportAdded"
        />
      </div>

      <!-- What the open half is worth. Above the cards rather than under them:
           on a 300-card binder a total at the bottom is a total nobody sees.
           Neutral, not amethyst or pink — money is a fact about the cards, not
           a claim about who wants them (DESIGN.md, The Three-Role Rule). -->
      <div v-if="!loading && pileValue.priced" class="lib-value">
        <span class="lib-value__label">
          {{ pile === 'trade' ? t('price.tradePileValue') : t('price.wishlistValue') }}
        </span>
        <span class="lib-value__amount tabular-nums">
          <template v-if="pileValue.exact">{{ money(pileValue.low) }}</template>
          <template v-else>{{ money(pileValue.low) }} – {{ money(pileValue.high) }}</template>
        </span>
        <span v-if="pileValue.uncertain" class="lib-value__note">
          {{ t('price.needPrinting', { count: pileValue.uncertain }, pileValue.uncertain) }}
        </span>
        <span v-if="pileValue.unpriced" class="lib-value__note">
          {{ t('price.unpriced', { count: pileValue.unpriced }, pileValue.unpriced) }}
        </span>
        <span class="lib-value__src">{{ t('price.sourceShort') }}</span>
      </div>

      <!-- Trade pile: one pile, no dividers inside it. -->
      <LibrarySection
        v-if="pile === 'trade'"
        mode="trade"
        :view="viewMode"
        :prices="prices"
        :cards="trade_cards"
        :loading="loading"
        :new-card-id="newCardId"
        :empty-text="t('library.emptyTrade')"
        @deleted="onCardDeleted"
      />

      <template v-else>
        <!-- The dividers inside the wants half. One chip per list, so a list is
             one click away rather than a scroll past its neighbours — which is
             what the fold-away sections were compensating for. -->
        <div v-if="wishlists.length || wished_cards.length" class="lib-rail">
          <div class="lib-rail__chips" role="group" :aria-label="t('library.wishlist')">
            <button
              v-for="chip in listChips"
              :key="chip.key"
              type="button"
              class="lib-chip"
              :class="{ 'is-on': activeList === chip.key }"
              :aria-pressed="activeList === chip.key ? 'true' : 'false'"
              @click="activeList = chip.key"
            >
              <span class="truncate">{{ chip.label }}</span>
              <span class="lib-chip__n tabular-nums">{{ chip.count }}</span>
            </button>
          </div>

          <!-- Renaming and deleting belong to the list you are looking at, so
               there are two of these on the page instead of two per list. -->
          <div class="lib-rail__acts">
            <template v-if="selectedList">
              <button type="button" class="lib-listbtn lib-listbtn--icon" :title="t('wishlists.rename')" :aria-label="t('wishlists.rename')" @click="promptRename(selectedList)">
                <v-icon icon="mdi-pencil-outline" size="15" />
              </button>
              <button type="button" class="lib-listbtn lib-listbtn--icon" :title="t('wishlists.delete')" :aria-label="t('wishlists.delete')" @click="confirmDelete(selectedList)">
                <v-icon icon="mdi-trash-can-outline" size="15" />
              </button>
            </template>
            <button type="button" class="lib-listbtn" @click="promptNewList">
              <v-icon icon="mdi-playlist-plus" size="15" />
              {{ t('wishlists.newList') }}
            </button>
          </div>
        </div>

        <!-- One section per list when All is open; the chip is the heading when
             a single list is. -->
        <div class="flex flex-col gap-7">
          <LibrarySection
            v-for="group in visibleGroups"
            :key="group.id ?? 'unsorted'"
            :title="group.name ?? t('wishlists.unsorted')"
            mode="wish"
            :show-head="showGroupHeads"
            :dense="showGroupHeads"
            :lists="wishlists"
            :view="viewMode"
            :prices="prices"
            :cards="group.cards"
            :loading="loading"
            :new-card-id="newCardId"
            :empty-text="showGroupHeads ? t('wishlists.emptyList') : t('library.emptyWish')"
            @deleted="onCardDeleted"
            @move="onCardMoved"
          />
        </div>
      </template>
    </div>
  </div>

  <!-- Headless: the toolbar supplies the button, this supplies the dialog. Its
       open() resets from `mode`, so the destination always follows the open
       half without this needing to be rebuilt. -->
  <BulkAddCards
    ref="bulkAddRef"
    :mode="mode"
    :headless="true"
    @requireAuth="$emit('requireAuth')"
    @added="onBulkAdded"
  />

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
import DeckImport from "@/components/library/DeckImport.vue";
import BulkAddCards from "@/components/library/BulkAddCards.vue";
import AddCard from "@/components/library/AddCard.vue";
import {
  fetchWishlists, createWishlist, renameWishlist, deleteWishlist,
  moveCardToList, groupByList, nameProblem, MAX_NAME_LEN,
} from "@/lib/wishlists";
import { fetchCardPrices, sumPrices, formatMoney } from "@/lib/cardmarketPrice";

/** The two halves, in order. First one is what a bare /library means. Kept in
 *  step with the route's `:pile` matcher in router/index.js. These read as URLs
 *  a person could type; `mode` below translates them into the trade/wish
 *  vocabulary the card components and the database use. */
const PILES = ["trade", "wishlist"];

export default {
  components: { DeckImport, BulkAddCards, AddCard },
  props: ['login'],
  emits: ['requireAuth'],
  data() {
    return {
      MAX_NAME_LEN,
      wishlists: [],
      // Which divider is open inside the wants half: a wishlist id as a string,
      // 'unsorted', or 'all'. Not persisted — 'all' is the right thing to see
      // on arrival, every time.
      activeList: 'all',
      listDialog: { open: false, id: null, name: '' },
      // Plain arrays. These used to be ref([]), which Vue unwraps on the way
      // through data()'s reactive() — so reading a `.value` off them gave
      // undefined until a load happened to assign that property onto the array
      // itself. It never surfaced because the only reader passed it straight
      // into a prop with an [] default; asking it for a .length throws.
      wished_cards: [],
      trade_cards: [],
      // Card id -> resolved price. Reassigned wholesale rather than mutated:
      // Options API reactivity does not track Map writes.
      prices: new Map(),
      loading: true,
      newCardId: null,
      snackbar: { open: false, message: '', color: '', icon: '' },
      showDeckImport: false,
      // Collection layout: 'list' (compact rows, default) | 'grid' (card tiles).
      // Restored from localStorage in mounted().
      viewMode: 'list',
    };
  },
  computed: {
    // The open half IS the URL, for the same reasons as the trade centre's tab:
    // it is linkable, it survives a refresh, and it answers the back button.
    pile: {
      get() { return this.$route.params.pile || PILES[0]; },
      set(pile) {
        if (!PILES.includes(pile) || pile === this.pile) return;
        this.$router.push({ name: 'library', params: { ...this.$route.params, pile } });
      },
    },
    /** The open half in the vocabulary the card components and the DB speak. */
    mode() {
      return this.pile === 'wishlist' ? 'wish' : 'trade';
    },
    piles() {
      return [
        { key: 'trade',    label: this.$t('library.tradePile'), icon: 'mdi-cards-outline', count: this.trade_cards.length },
        { key: 'wishlist', label: this.$t('library.wishlist'),  icon: 'mdi-heart-outline', count: this.wished_cards.length },
      ];
    },
    wishlistGroups() {
      return groupByList(this.wishlists, this.wished_cards);
    },
    /** All, then one per list. Unsorted only appears when something is in it —
     *  groupByList already decides that, and the rail follows it. */
    listChips() {
      return [
        { key: 'all', label: this.$t('library.allLists'), count: this.wished_cards.length },
        ...this.wishlistGroups.map(g => ({
          key: String(g.id ?? 'unsorted'),
          label: g.name ?? this.$t('wishlists.unsorted'),
          count: g.cards.length,
        })),
      ];
    },
    /** The group the rail is pointing at, or null when that is All — or when the
     *  list it named has since been deleted, which falls back to All rather than
     *  showing nothing. */
    selectedGroup() {
      if (this.activeList === 'all') return null;
      return this.wishlistGroups.find(g => String(g.id ?? 'unsorted') === this.activeList) ?? null;
    },
    /** The selected group when it is a real list. Unsorted is the absence of
     *  one, so there is nothing there to rename or delete. */
    selectedList() {
      return this.selectedGroup?.id ? this.selectedGroup : null;
    },
    visibleGroups() {
      if (this.selectedGroup) return [this.selectedGroup];
      // An empty wants half is still a wants half. With no lists and no cards
      // there are no groups to draw, and the page would come up blank instead
      // of saying what the pile is for.
      return this.wishlistGroups.length ? this.wishlistGroups : [{ id: null, name: null, cards: [] }];
    },
    /**
     * What the open half is worth.
     *
     * The half, not the collection: the trade pile and the wants list are two
     * different claims -- what you could give away, and what you would have to
     * buy -- and adding them together produces a number that answers neither.
     * The tab you are on says which one you are asking about.
     *
     * Comes back as a range whenever any card in it does. Summing bands by
     * their midpoint would invent a figure no card is worth, and across a
     * 300-card binder the invention compounds; see sumPrices.
     */
    pileValue() {
      const cards = this.pile === 'trade' ? this.trade_cards : this.wished_cards;
      return sumPrices(cards.map(c => ({ price: this.prices.get(c.id), quantity: c.quantity })));
    },

    /** Headings are what tells two lists apart. Looking at one, the chip above
     *  is already its name, and a heading under it would say it twice. */
    showGroupHeads() {
      return !this.selectedGroup && this.wishlists.length > 0;
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
    // A watcher rather than a line in mounted(): arriving at /library from
    // inside the app reuses this component, so mounted() would not run and the
    // bare URL would sit there. `replace`, so the back button leaves rather
    // than bouncing here.
    "$route.params.pile": {
      immediate: true,
      handler(pile) {
        if (pile || this.$route.name !== 'library') return;
        this.$router.replace({ name: 'library', params: { ...this.$route.params, pile: PILES[0] } });
      },
    },
    // Deck import does not belong in the trade half at all, so switching there
    // with its drawer open would leave a wishlist tool on a trade page.
    pile() {
      this.showDeckImport = false;
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
          this.wishlists = await fetchWishlists();
        } else {
          const made = await createWishlist(name, {
            ownerId: this.login.user.id,
            sortOrder: this.wishlists.length,
          });
          this.wishlists = await fetchWishlists();
          // Open the list they just made. A new divider you have to go and find
          // is indistinguishable from one that failed to save.
          if (made?.id) this.activeList = String(made.id);
        }
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
        // The divider you were behind is gone; the page falls back to All
        // rather than to a list that no longer exists.
        if (this.activeList === String(group.id)) this.activeList = 'all';
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
      const card = this.wished_cards.find(c => c.id === cardId);
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
      // A null id means "no session yet", which is indistinguishable from
      // "signed out" until one arrives. Settle either way, the same as the
      // account page does: a signed-out visitor watching a skeleton that will
      // never resolve learns nothing, where the empty state at least says what
      // the pile is for. The id watcher re-runs this when a session shows up.
      if (!this.login?.user?.id) { this.loading = false; return; }
      this.loading = true;

      const [wishes, trades] = await Promise.all([
        getClient().from('Card').select('*').eq('wish', true).eq('trader', this.login.user.id).neq('status', 'traded'),
        getClient().from('Card').select('*').eq('wish', false).eq('trader', this.login.user.id).neq('status', 'traded'),
      ]);

      const allLoaded = [...(wishes.data ?? []), ...(trades.data ?? [])];
      const zeroes = allLoaded.filter(c => (c.quantity ?? 0) <= 0 && c.status !== 'locked').map(c => c.id);
      if (zeroes.length) await getClient().from('Card').delete().in('id', zeroes);

      this.wished_cards = this.filterCovered((wishes.data ?? []).filter(c => (c.quantity ?? 0) > 0 || c.status === 'locked'));
      this.trade_cards  = this.filterCovered((trades.data ?? []).filter(c => (c.quantity ?? 0) > 0 || c.status === 'locked'));
      this.wishlists = await fetchWishlists();
      this.loading = false;
      this.loadPrices();

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
      this.wished_cards = this.filterCovered(w.data ?? []);
      this.trade_cards  = this.filterCovered(t.data ?? []);
      this.loadPrices();
    },

    /**
     * One request for the whole binder, both halves at once.
     *
     * Deliberately not awaited by the card load: prices are the last thing on
     * the page worth waiting for, and blocking the binder on Cardmarket would
     * trade a fast list of cards for a slow list of cards with numbers on it.
     * They appear when they arrive.
     */
    money(v) { return formatMoney(v, this.$i18n.locale); },

    async loadPrices() {
      const ids = [...this.trade_cards, ...this.wished_cards].map(c => c.id);
      this.prices = await fetchCardPrices(ids);
    },

    onCardDeleted(cardId) {
      this.trade_cards  = this.trade_cards.filter(c => c.id !== cardId);
      this.wished_cards = this.wished_cards.filter(c => c.id !== cardId);
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
        this.wished_cards = [newCard, ...this.wished_cards];
        this.snackbar = { open: true, message: this.$t('library.addedToWishlist', { name: newCard.name }), color: 'var(--c-accent)', icon: 'mdi-heart-plus' };
      } else {
        this.trade_cards = [newCard, ...this.trade_cards];
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
/* Borrowed from the landing page (LandingPage.vue's --lp-* set) and already
   carried into the account page: the open binder page sits one tonal step
   *under* the app background rather than above it, hairlines are a fraction of
   the border token, and depth is a 1px top highlight instead of a drop shadow —
   lit from above, per DESIGN.md's Flat-By-Default Rule.
   It stops at the cards. A row keeps its --c-surface ground, so it still reads
   as the same card row it is everywhere else in the app. */
.lib {
  --lb-panel: color-mix(in srgb, var(--c-surface) 94%, var(--c-bg));
  --lb-line: color-mix(in srgb, var(--c-border) 60%, transparent);
  --lb-line-soft: color-mix(in srgb, var(--c-border) 34%, transparent);
  --lb-lit: inset 0 1px 0 color-mix(in srgb, var(--c-text) 8%, transparent);
  --lb-r: 20px;

  padding: 20px 0 56px;
}
@media (min-width: 768px) { .lib { padding-top: 28px; } }

/* The page's one accent, set by which half is open. Everything downstream —
   the rail's live chip, the empty state, the ring on a card that just landed —
   reads --pile rather than naming a colour, so the whole surface answers the
   tab. Both are role colours doing their own job (DESIGN.md, The Three-Role
   Rule): amethyst is what you offer, pink is what you want. */
.lib--trade    { --pile: var(--c-trade); }
.lib--wishlist { --pile: var(--c-accent); }

/* ── Divider row ─────────────────────────────────────────────────────────── */
.lib-dividers {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px 16px;
  border-bottom: 1px solid var(--lb-line);
}

.lib-tabs { display: flex; align-items: flex-end; gap: 4px; min-width: 0; }

.lib-tab {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 18px;
  /* Overlaps the row's rule so an open tab can paint over it. */
  margin-bottom: -1px;
  border: 1px solid transparent;
  border-bottom: 1px solid transparent;
  border-radius: 13px 13px 0 0;
  background: transparent;
  color: var(--c-muted);
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease, border-color 0.15s ease;
}
.lib-tab:hover:not(.is-open) { color: var(--c-text); background: var(--lb-line-soft); }

/* Open: the tab and the page below it are one shape. Its bottom border is the
   page's own ground, which erases the row's rule for exactly its width. */
.lib-tab.is-open {
  background: var(--lb-panel);
  border-color: var(--lb-line);
  border-bottom-color: var(--lb-panel);
  box-shadow: var(--lb-lit);
  color: var(--c-text);
}
.lib-tab--trade.is-open    { color: var(--c-trade); }
.lib-tab--wishlist.is-open { color: var(--c-accent); }

.lib-tab__name { white-space: nowrap; }
.lib-tab__n {
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 999px;
  color: var(--c-muted);
  background: color-mix(in srgb, var(--c-muted) 12%, transparent);
}
.lib-tab.is-open .lib-tab__n {
  color: var(--c-text);
  background: color-mix(in srgb, currentColor 14%, transparent);
}

/* ── Tools, riding the same rule as the tabs ─────────────────────────────── */
.lib-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-bottom: 9px;
}

.lib-view {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: 10px;
  border: 1px solid var(--lb-line);
}
.lib-view__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 32px;
  border-radius: 8px;
  color: var(--c-muted);
  background: transparent;
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}
.lib-view__btn:hover { color: var(--c-text); }
.lib-view__btn.is-on { color: var(--pile); background: var(--lb-panel); }

.lib-toolbtn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 13px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--c-muted);
  background: transparent;
  border: 1px solid var(--lb-line);
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease, border-color 0.15s ease;
}
.lib-toolbtn:hover { color: var(--c-text); background: var(--lb-panel); }
.lib-toolbtn.is-on { color: var(--pile); border-color: color-mix(in srgb, var(--pile) 45%, transparent); }
@media (max-width: 700px) {
  .lib-toolbtn__label { display: none; }
  .lib-toolbtn { padding: 8px 10px; }
}

/* ── The open page ───────────────────────────────────────────────────────── */
.lib-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: clamp(16px, 2.4vw, 26px);
  background: var(--lb-panel);
  border: 1px solid var(--lb-line);
  border-top: 0;
  border-radius: 0 0 var(--lb-r) var(--lb-r);
}

.lib-drawer {
  padding-bottom: 4px;
  border-bottom: 1px solid var(--lb-line-soft);
}

/* ── The rail of list dividers ───────────────────────────────────────────── */
/* ── What the open half is worth ──────────────────────────────────────────
   A rule, not a panel. The binder below is already a stack of bordered rows,
   and boxing the total would add a fourth edge to a page that has enough of
   them; a hairline underneath does the separating (DESIGN.md, The
   Flat-By-Default Rule). The label is the collector's register — mono,
   uppercase, tracked — and the figure is the only thing here at full weight. */
.lib-value {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px 12px;
  padding: 0 2px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--c-border) 45%, transparent);
  margin-bottom: 14px;
}
.lib-value__label {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.16em; color: var(--c-muted);
}
.lib-value__amount { font-size: 17px; font-weight: 700; color: var(--c-text); }
/* Sits after the figure, not under it: "12 cards need a printing" is a caveat
   on the number, and a caveat that scrolls away from its claim is not one. */
.lib-value__note { font-size: 11.5px; font-weight: 600; color: var(--c-muted); }
/* No opacity here. Muted is already the quietest colour the system has, and
   fading it to 0.75 measured 4.22:1 against the page -- under AA -- to buy a
   softness the token had already provided at 7.45:1. */
.lib-value__src {
  margin-left: auto; font-size: 10.5px; font-weight: 600;
  color: var(--c-muted); white-space: nowrap;
}
@media (max-width: 560px) {
  /* The source credit stops earning its right-hand column once the row wraps. */
  .lib-value__src { margin-left: 0; }
}

.lib-rail {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px 14px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--lb-line-soft);
}
.lib-rail__chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; }
.lib-rail__acts  { display: flex; align-items: center; gap: 6px; }

.lib-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: 15rem;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--lb-line-soft);
  background: transparent;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--c-muted);
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}
.lib-chip:hover { color: var(--c-text); border-color: var(--lb-line); }
.lib-chip.is-on {
  color: var(--c-on-accent);
  background: var(--pile);
  border-color: transparent;
}
/* Full strength, not dimmed: how many cards are on a list is the reason the
   chip carries a number at all, and 0.72 opacity put it under 4.5:1 on both
   the pink ground and the panel. Dropping the tracking is enough to tell the
   number apart from the name. */
.lib-chip__n { letter-spacing: 0; }

.lib-listbtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 11px;
  border-radius: 9px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--c-muted);
  background: transparent;
  border: 1px solid var(--lb-line-soft);
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}
.lib-listbtn:hover { color: var(--c-text); background: color-mix(in srgb, var(--c-surface) 70%, transparent); }
.lib-listbtn--icon { padding: 6px 8px; }

/* Every control on this page takes its focus ring from the open half. */
.lib :where(button, .lib-chip):focus-visible {
  outline: 2px solid var(--pile);
  outline-offset: 2px;
}

/* Phones: the dividers scroll sideways rather than stacking. Five chips and a
   button wrapped to four rows put a third of the screen between the tab and the
   first card — worse than the fold-away sections this replaced. */
@media (max-width: 700px) {
  .lib-rail { flex-wrap: nowrap; align-items: flex-start; }
  .lib-rail__chips {
    flex-wrap: nowrap;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    padding-bottom: 2px;
  }
  .lib-rail__chips::-webkit-scrollbar { display: none; }
  .lib-chip { flex: 0 0 auto; }
  .lib-rail__acts { flex-shrink: 0; }
}

/* Phones: the two halves split the width, and the tools drop below their rule. */
@media (max-width: 560px) {
  .lib-tabs { flex: 1 0 100%; }
  .lib-tab  { flex: 1; justify-content: center; padding: 11px 10px; font-size: 0.88rem; }
  .lib-tools { flex: 1 0 100%; padding-bottom: 0; padding-top: 10px; justify-content: flex-start; }
  .lib-dividers { border-bottom: 0; }
  .lib-page { border-top: 1px solid var(--lb-line); border-radius: var(--lb-r); }
}

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
  color: var(--c-on-accent);
  background: var(--c-accent);
  border-color: var(--c-accent);
}
.lib-dlg__btn:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
