<template>
  <div class="flex flex-col gap-4">

    <!-- ── Dropzone (shown when no deck loaded) ── -->
    <div
      v-if="state === 'idle'"
      class="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors py-12 px-6 text-center"
      :class="dragging ? 'border-[var(--c-accent)] bg-[color-mix(in_srgb,var(--c-accent)_6%,transparent)]' : 'border-[var(--c-border)] hover:border-[var(--c-accent)]'"
      style="min-height: 180px"
      @click="triggerFileInput"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <v-icon icon="mdi-file-import-outline" size="40" style="color: var(--c-muted)" />
      <p class="text-sm" style="color: var(--c-muted)">{{ $t('deckImport.dropzone') }}</p>
      <input
        ref="fileInput"
        type="file"
        accept=".ydk"
        class="hidden"
        @change="onFileChange"
      />
    </div>

    <!-- ── Loading ── -->
    <div v-else-if="state === 'loading'" class="flex flex-col items-center justify-center gap-3 py-12">
      <v-progress-circular indeterminate size="32" style="color: var(--c-accent)" />
      <p class="text-sm" style="color: var(--c-muted)">{{ $t('deckImport.loading') }}</p>
    </div>

    <!-- ── Error ── -->
    <div
      v-else-if="state === 'error'"
      class="flex flex-col items-center justify-center gap-3 rounded-xl border py-10 px-6 text-center"
      style="border-color: var(--c-border)"
    >
      <v-icon icon="mdi-alert-circle-outline" size="36" color="error" />
      <p class="text-sm" style="color: var(--c-text)">{{ $t('deckImport.error') }}</p>
      <v-btn size="small" variant="outlined" style="color: var(--c-muted); border-color: var(--c-border)" @click="reset">
        {{ $t('common.retry') }}
      </v-btn>
    </div>

    <!-- ── Loaded ── -->
    <template v-else-if="state === 'loaded'">

      <!-- Summary bar -->
      <div
        class="flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3"
        style="background-color: var(--c-surface-2); border: 1px solid var(--c-border)"
      >
        <p class="text-sm font-medium" style="color: var(--c-text)">
          {{ $t('deckImport.summary', { total: totalCards, owned: ownedCount, missing: missingCount, unrecognized: unrecognizedCount }) }}
        </p>
        <v-btn
          size="x-small"
          variant="text"
          style="color: var(--c-muted)"
          prepend-icon="mdi-close"
          @click="reset"
        >{{ $t('common.close') }}</v-btn>
      </div>

      <!-- All owned special state -->
      <div
        v-if="missingCount === 0 && unrecognizedCount === 0 && totalCards > 0"
        class="flex items-center gap-3 rounded-xl px-4 py-3"
        style="background: color-mix(in srgb, var(--c-accent) 8%, transparent); border: 1px solid color-mix(in srgb, var(--c-accent) 25%, transparent)"
      >
        <v-icon icon="mdi-check-circle-outline" style="color: var(--c-accent)" size="20" />
        <p class="text-sm font-medium" style="color: var(--c-accent)">{{ $t('deckImport.allOwned') }}</p>
      </div>

      <!-- Add missing button -->
      <v-btn
        v-else-if="missingCount > 0"
        variant="flat"
        :style="{ backgroundColor: 'var(--c-accent)', color: 'white' }"
        prepend-icon="mdi-heart-plus"
        :loading="adding"
        @click="addMissingToWishlist"
      >
        {{ $t('deckImport.addMissing', missingCount, { count: missingCount }) }}
      </v-btn>

      <!-- Section: Main Deck -->
      <template v-if="mainCards.length">
        <p class="text-xs font-bold uppercase tracking-wide" style="color: var(--c-muted)">
          {{ $t('deckImport.sections.main') }} ({{ mainCards.reduce((s, c) => s + c.qty, 0) }})
        </p>
        <div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(68px, 1fr))">
          <CardSlot
            v-for="item in mainCards"
            :key="item.id"
            :item="item"
            :card-map="cardMap"
            :owned-ids="ownedIds"
            :missing-badge="$t('deckImport.missingBadge')"
            :unknown-badge="$t('deckImport.unknownBadge')"
          />
        </div>
      </template>

      <!-- Section: Extra Deck -->
      <template v-if="extraCards.length">
        <p class="text-xs font-bold uppercase tracking-wide" style="color: var(--c-muted)">
          {{ $t('deckImport.sections.extra') }} ({{ extraCards.reduce((s, c) => s + c.qty, 0) }})
        </p>
        <div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(68px, 1fr))">
          <CardSlot
            v-for="item in extraCards"
            :key="item.id"
            :item="item"
            :card-map="cardMap"
            :owned-ids="ownedIds"
            :missing-badge="$t('deckImport.missingBadge')"
            :unknown-badge="$t('deckImport.unknownBadge')"
          />
        </div>
      </template>

      <!-- Section: Side Deck -->
      <template v-if="sideCards.length">
        <p class="text-xs font-bold uppercase tracking-wide" style="color: var(--c-muted)">
          {{ $t('deckImport.sections.side') }} ({{ sideCards.reduce((s, c) => s + c.qty, 0) }})
        </p>
        <div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(68px, 1fr))">
          <CardSlot
            v-for="item in sideCards"
            :key="item.id"
            :item="item"
            :card-map="cardMap"
            :owned-ids="ownedIds"
            :missing-badge="$t('deckImport.missingBadge')"
            :unknown-badge="$t('deckImport.unknownBadge')"
          />
        </div>
      </template>

      <!-- Link to deck management page -->
      <div class="text-center mt-2">
        <router-link :to="`/${$i18n.locale}/decks`" class="text-caption text-medium-emphasis">
          {{ $t('decks.manageLink') }}
        </router-link>
      </div>

    </template>

  </div>
</template>

<script>
import { defineComponent } from 'vue';
import { parseYdk } from '@/lib/ydk';
import { getCardsByIds } from '@/api';
import { getClient } from '@/lib/supabaseClient';
import { cardImage } from '@/lib/cardImage';

/**
 * Inner card slot sub-component — renders a single card entry in one of the
 * three visual states (owned / missing / unrecognized).  Defined inline here
 * so DeckImport.vue stays a single file with no extra imports in Library.vue.
 */
const CardSlot = defineComponent({
  name: 'DeckImportCardSlot',
  props: {
    item:         { type: Object, required: true },   // { id, qty }
    cardMap:      { type: Object, required: true },   // { [id]: cardData }
    ownedIds:     { type: Object, required: true },   // Set<number>
    missingBadge: { type: String, default: 'Missing' },
    unknownBadge: { type: String, default: 'Unrecognized' },
  },
  setup() { return { cardImage }; },
  computed: {
    card()         { return this.cardMap[this.item.id] ?? null; },
    isUnrecognized() { return !this.card; },
    isOwned()      { return !this.isUnrecognized && this.ownedIds.has(this.item.id); },
    isMissing()    { return !this.isUnrecognized && !this.isOwned; },
  },
  template: `
    <div class="flex flex-col gap-1 items-center">
      <!-- Card image area -->
      <div class="relative" style="width: 68px">
        <!-- Owned or Missing: real card image -->
        <img
          v-if="!isUnrecognized"
          :src="cardImage(item.id)"
          :alt="card.name"
          loading="lazy"
          class="rounded object-cover w-full"
          style="aspect-ratio: 59/86; display: block;"
          :style="{ opacity: isMissing ? 0.35 : 1 }"
        />
        <!-- Unrecognized: grey placeholder -->
        <div
          v-else
          class="rounded w-full flex items-center justify-center"
          style="aspect-ratio: 59/86; background-color: var(--c-surface-2); border: 1px solid var(--c-border)"
        >
          <v-icon icon="mdi-help" size="20" style="color: var(--c-muted)" />
        </div>

        <!-- Missing badge -->
        <div
          v-if="isMissing"
          class="absolute bottom-0 left-0 right-0 flex items-center justify-center rounded-b text-[9px] font-bold py-0.5"
          style="background: rgba(220,38,38,0.85); color: white; letter-spacing: 0.03em"
        >{{ missingBadge }}</div>

        <!-- Unrecognized badge -->
        <div
          v-if="isUnrecognized"
          class="absolute bottom-0 left-0 right-0 flex items-center justify-center rounded-b text-[9px] font-bold py-0.5"
          style="background: rgba(100,100,100,0.85); color: white; letter-spacing: 0.03em"
        >{{ unknownBadge }}</div>

        <!-- Qty badge (>1) -->
        <div
          v-if="item.qty > 1"
          class="absolute top-0.5 right-0.5 rounded-full text-[9px] font-bold w-4 h-4 flex items-center justify-center"
          style="background: rgba(0,0,0,0.7); color: white"
        >{{ item.qty }}</div>
      </div>

      <!-- Card name -->
      <p
        class="text-center leading-tight w-full truncate"
        style="font-size: 9px; color: var(--c-muted); max-width: 68px"
      >{{ card ? card.name : item.id }}</p>
    </div>
  `,
});

export default {
  name: 'DeckImport',
  components: { CardSlot },

  props: {
    login: { type: Object, default: null },
  },

  emits: ['requireAuth', 'added'],

  data() {
    return {
      /** 'idle' | 'loading' | 'loaded' | 'error' */
      state: 'idle',
      dragging: false,

      /** Parsed deck sections — arrays of { id: number, qty: number } */
      mainCards:  [],
      extraCards: [],
      sideCards:  [],

      /** { [numericId]: cardData } from YGOPRODeck API */
      cardMap: {},

      /** Set<number> of passcode IDs the user owns (from Card table, wish=false) */
      ownedIds: new Set(),

      adding: false,
    };
  },

  computed: {
    /** Flat list of all unique card entries across all sections */
    allEntries() {
      return [...this.mainCards, ...this.extraCards, ...this.sideCards];
    },

    /** Total card count (counting duplicates) */
    totalCards() {
      return this.allEntries.reduce((s, c) => s + c.qty, 0);
    },

    ownedCount() {
      return this.allEntries
        .filter(c => this.cardMap[c.id] && this.ownedIds.has(c.id))
        .reduce((s, c) => s + c.qty, 0);
    },

    missingCount() {
      return this.allEntries
        .filter(c => this.cardMap[c.id] && !this.ownedIds.has(c.id))
        .reduce((s, c) => s + c.qty, 0);
    },

    unrecognizedCount() {
      return this.allEntries
        .filter(c => !this.cardMap[c.id])
        .reduce((s, c) => s + c.qty, 0);
    },

    /** Missing card entries (recognized but not owned) */
    missingEntries() {
      return this.allEntries.filter(c => this.cardMap[c.id] && !this.ownedIds.has(c.id));
    },
  },

  methods: {
    triggerFileInput() {
      this.$refs.fileInput?.click();
    },

    onFileChange(event) {
      const file = event.target.files?.[0];
      if (file) this.processFile(file);
      // Reset so same file can be re-selected
      event.target.value = '';
    },

    onDrop(event) {
      this.dragging = false;
      const file = event.dataTransfer?.files?.[0];
      if (file) this.processFile(file);
    },

    async processFile(file) {
      this.state = 'loading';
      try {
        const text = await file.text();
        const parsed = parseYdk(text);

        const allIds = [
          ...new Set([
            ...parsed.main.map(c => c.id),
            ...parsed.extra.map(c => c.id),
            ...parsed.side.map(c => c.id),
          ]),
        ];

        // Batch-fetch card data
        const cardMap = await getCardsByIds(allIds);

        // Ownership cross-reference (only when logged in)
        const ownedIds = new Set();
        const userId = this.login?.user?.id ?? null;
        if (userId) {
          const supabase = getClient();
          const { data } = await supabase
            .from('Card')
            .select('image_id')
            .eq('trader', userId)
            .eq('wish', false)
            .not('status', 'in', '("traded","locked")');

          if (data) {
            for (const row of data) {
              if (row.image_id != null) ownedIds.add(Number(row.image_id));
            }
          }
        }

        this.cardMap    = cardMap;
        this.ownedIds   = ownedIds;
        this.mainCards  = parsed.main;
        this.extraCards = parsed.extra;
        this.sideCards  = parsed.side;
        this.state      = 'loaded';
      } catch (err) {
        this.state = 'error';
      }
    },

    /**
     * Inserts all missing cards into the wishlist using the EXACT same Supabase
     * call as AddCard.vue in wish mode (table "Card", same row shape).
     */
    async addMissingToWishlist() {
      if (!this.login?.user?.id) {
        this.$emit('requireAuth');
        return;
      }

      this.adding = true;
      const supabase = getClient();
      const userId = this.login.user.id;
      let insertedCount = 0;

      try {
        const rows = this.missingEntries.map(entry => {
          const card = this.cardMap[entry.id];
          const canonicalName = card.name_en ?? card.name;
          return {
            wish:          true,
            game:          'YGO',
            url:           'https://db.ygoprodeck.com/api/v7/cardinfo.php?name=' + canonicalName,
            name:          canonicalName,
            extension:     '',
            rarity:        'common',
            quantity:      entry.qty,
            trader:        userId,
            image_id:      card.id,
            language:      'English',
            condition:     'Near Mint',
            first_edition: false,
          };
        });

        if (rows.length) {
          const { data: inserted, error } = await supabase
            .from('Card')
            .insert(rows)
            .select();

          if (error) throw error;
          insertedCount = inserted?.length ?? rows.length;
        }

        this.$emit('added', insertedCount);

        // Refresh owned state so newly-wished cards reflect in UI
        // (they stay "missing" on the trade side — no need to re-query wishes)
      } catch (err) {
      } finally {
        this.adding = false;
      }
    },

    reset() {
      this.state      = 'idle';
      this.dragging   = false;
      this.mainCards  = [];
      this.extraCards = [];
      this.sideCards  = [];
      this.cardMap    = {};
      this.ownedIds   = new Set();
      this.adding     = false;
    },
  },
};
</script>
