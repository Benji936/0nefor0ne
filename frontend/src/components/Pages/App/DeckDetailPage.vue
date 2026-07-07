<template>
  <v-container class="py-5" style="max-width: 1100px">

    <!-- ── Back link ── -->
    <div class="mb-4">
      <v-btn
        variant="text"
        prepend-icon="mdi-arrow-left"
        :to="`/${$i18n.locale}/decks`"
        size="small"
      >
        {{ $t('deckDetail.backToDecks') }}
      </v-btn>
    </div>

    <!-- ── Loading ── -->
    <div v-if="loading" class="d-flex justify-center py-12">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <!-- ── Not found ── -->
    <v-card v-else-if="notFound" variant="tonal" class="text-center pa-8">
      <v-icon icon="mdi-cards-outline" size="48" style="color: var(--c-muted)" class="mb-2" />
      <p class="text-body-1 mb-4" style="color: var(--c-muted)">{{ $t('deckDetail.notFound') }}</p>
      <v-btn variant="outlined" :to="`/${$i18n.locale}/decks`">
        {{ $t('deckDetail.backToDecks') }}
      </v-btn>
    </v-card>

    <!-- ── Deck content ── -->
    <template v-else-if="deck">
      <!-- Title -->
      <h1 class="text-h5 font-weight-bold mb-2" style="color: var(--c-text)">
        {{ deck.name }}
      </h1>

      <!-- Summary -->
      <p v-if="!loadingStats" class="text-body-2 mb-1" style="color: var(--c-muted)">
        {{ $t('deckDetail.summary', { total: stats.total, owned: stats.owned, missing: stats.missing }) }}
        <span v-if="stats.unrecognized > 0">
          · {{ $t('deckDetail.unrecognized', { count: stats.unrecognized }) }}
        </span>
      </p>

      <!-- Stats loading -->
      <div v-if="loadingStats" class="d-flex align-center gap-2 mb-4">
        <v-progress-circular indeterminate size="20" width="2" color="primary" />
        <span class="text-body-2" style="color: var(--c-muted)">{{ $t('deckDetail.loading') }}</span>
      </div>

      <!-- ── Wishlist action ── -->
      <div v-if="!loadingStats" class="mb-6 mt-3">
        <v-alert
          v-if="stats.missing === 0 && stats.total > 0"
          type="success"
          variant="tonal"
          density="compact"
          icon="mdi-check-circle-outline"
        >
          {{ $t('deckDetail.allOwned') }}
        </v-alert>
        <v-btn
          v-else-if="stats.missing > 0"
          color="primary"
          variant="flat"
          prepend-icon="mdi-heart-plus"
          :loading="addingToWishlist"
          @click="addMissingToWishlist"
        >
          {{ $t('deckDetail.addMissingToWishlist') }}
        </v-btn>
      </div>

      <!-- ── Card sections ── -->
      <template v-if="!loadingStats">
        <DeckSection
          v-if="stats.main.length"
          :entries="stats.main"
          :card-map="stats.cardMap"
          :owned-ids="stats.ownedIds"
          :ignored-ids="ignoredIds"
          :title="$t('deckDetail.mainDeck')"
          :missing-badge="$t('deckImport.missingBadge')"
          :unknown-badge="$t('deckImport.unknownBadge')"
          @toggle-ignore="onToggleIgnore"
        />
        <DeckSection
          v-if="stats.extra.length"
          :entries="stats.extra"
          :card-map="stats.cardMap"
          :owned-ids="stats.ownedIds"
          :ignored-ids="ignoredIds"
          :title="$t('deckDetail.extraDeck')"
          :missing-badge="$t('deckImport.missingBadge')"
          :unknown-badge="$t('deckImport.unknownBadge')"
          @toggle-ignore="onToggleIgnore"
        />
        <DeckSection
          v-if="stats.side.length"
          :entries="stats.side"
          :card-map="stats.cardMap"
          :owned-ids="stats.ownedIds"
          :ignored-ids="ignoredIds"
          :title="$t('deckDetail.sideDeck')"
          :missing-badge="$t('deckImport.missingBadge')"
          :unknown-badge="$t('deckImport.unknownBadge')"
          @toggle-ignore="onToggleIgnore"
        />
      </template>
    </template>

    <!-- ── Snackbar ── -->
    <v-snackbar v-model="snackbar.open" :timeout="3000" :color="snackbar.color" location="bottom right">
      <v-icon :icon="snackbar.icon" class="mr-2" size="18" />
      {{ snackbar.message }}
    </v-snackbar>

  </v-container>
</template>

<script>
import { ref } from 'vue';
import { useHead } from '@unhead/vue';
import { useI18n } from 'vue-i18n';
import { parseYdk } from '@/lib/ydk';
import { getCardsByIds } from '@/api';
import { getClient } from '@/lib/supabaseClient';
import DeckSection from '@/components/library/DeckSection.vue';
import { loadIgnoredIds, toggleIgnoredId, loadIgnoredIdsFromRecord, saveIgnoredIdsToDb } from '@/lib/deckIgnore';

const GUEST_KEY = 'tm_guest_decks';

export default {
  name: 'DeckDetailPage',
  components: { DeckSection },

  props: {
    login: { type: Object, default: null },
  },

  emits: ['requireAuth'],

  setup() {
    const { t } = useI18n();
    const title = ref(t('deckDetail.backToDecks') + ' — One for One');
    useHead({
      title,
      meta: [{ name: 'robots', content: 'noindex' }],
    });
    return {};
  },

  data() {
    return {
      loading: true,
      loadingStats: false,
      notFound: false,

      /** The raw deck record: { id, name, ydk_content, created_at } */
      deck: null,

      /** Resolved stats after card/ownership lookup */
      stats: {
        cardMap: {},
        ownedIds: new Set(),
        main: [],
        extra: [],
        side: [],
        total: 0,
        owned: 0,
        missing: 0,
        unrecognized: 0,
        missingEntries: [],
      },

      ignoredIds: new Set(),

      addingToWishlist: false,

      snackbar: { open: false, message: '', color: '', icon: '' },
    };
  },

  computed: {
    isGuest() {
      return !this.login?.user?.id;
    },
  },

  async mounted() {
    await this.loadDeck();
    this.subscribeRealtime();
  },

  beforeUnmount() {
    this.unsubscribeRealtime();
  },

  methods: {
    // ── Load the deck ────────────────────────────────────────────────────
    async loadDeck() {
      const deckId = this.$route.params.deckId;
      const userId = this.login?.user?.id ?? null;

      try {
        let deckRecord = null; // holds the raw Supabase row for auth users

        if (userId) {
          // Authenticated: load from Supabase
          const supabase = getClient();
          const { data, error } = await supabase
            .from('decks')
            .select('*')
            .eq('id', deckId)
            .eq('user_id', userId)
            .single();

          if (error || !data) {
            this.notFound = true;
            return;
          }
          deckRecord = data;
          this.deck = {
            id: data.id,
            name: data.name,
            ydk_content: data.ydk_content,
            created_at: data.created_at,
          };
        } else {
          // Guest: load from localStorage
          const guestDecks = this.readGuestDecks();
          const found = guestDecks.find(d => d.localId === deckId);
          if (!found) {
            this.notFound = true;
            return;
          }
          this.deck = {
            id: found.localId,
            name: found.name,
            ydk_content: found.ydkContent,
            created_at: found.importedAt,
          };
        }

        // Update page title now that we have the deck name
        useHead({ title: this.$t('deckDetail.title', { name: this.deck.name }) + ' — One for One' });

        // Load ignored card IDs — from Supabase record for auth users, localStorage for guests
        // (SSR-safe: only called from mounted())
        this.ignoredIds = deckRecord
          ? loadIgnoredIdsFromRecord(deckRecord)
          : loadIgnoredIds(this.deck.id);

        // Resolve cards and ownership in background
        await this.resolveStats();
      } catch (err) {
        console.error('DeckDetailPage: loadDeck failed', err);
        this.snackbar = {
          open: true,
          message: this.$t('common.error'),
          color: 'error',
          icon: 'mdi-alert-circle',
        };
      } finally {
        this.loading = false;
      }
    },

    // ── Resolve card data + ownership ────────────────────────────────────
    async resolveStats() {
      if (!this.deck) return;
      this.loadingStats = true;
      try {
        const parsed = parseYdk(this.deck.ydk_content);
        const allIds = [
          ...new Set([
            ...parsed.main.map(c => c.id),
            ...parsed.extra.map(c => c.id),
            ...parsed.side.map(c => c.id),
          ]),
        ];

        const cardMap = await getCardsByIds(allIds);

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

        const allEntries = [...parsed.main, ...parsed.extra, ...parsed.side];
        const total = allEntries.reduce((s, c) => s + c.qty, 0);
        const owned = allEntries
          .filter(c => cardMap[c.id] && ownedIds.has(c.id))
          .reduce((s, c) => s + c.qty, 0);
        const unrecognized = allEntries
          .filter(c => !cardMap[c.id])
          .reduce((s, c) => s + c.qty, 0);

        // missingEntries excludes ignored cards so wishlist insert naturally skips them
        const ignoredIds = this.ignoredIds;
        const missingEntries = allEntries.filter(
          c => cardMap[c.id] && !ownedIds.has(c.id) && !ignoredIds.has(c.id)
        );
        const missing = missingEntries.reduce((s, c) => s + c.qty, 0);

        this.stats = {
          cardMap,
          ownedIds,
          main: parsed.main,
          extra: parsed.extra,
          side: parsed.side,
          total,
          owned,
          missing,
          unrecognized,
          missingEntries,
        };
      } catch (err) {
        console.error('DeckDetailPage: resolveStats failed', err);
        this.snackbar = {
          open: true,
          message: this.$t('common.error'),
          color: 'error',
          icon: 'mdi-alert-circle',
        };
      } finally {
        this.loadingStats = false;
      }
    },

    // ── Add missing cards to wishlist ────────────────────────────────────
    async addMissingToWishlist() {
      if (!this.login?.user?.id) {
        this.$emit('requireAuth');
        return;
      }

      this.addingToWishlist = true;
      const supabase = getClient();
      const userId = this.login.user.id;
      try {
        const rows = this.stats.missingEntries.map(entry => {
          const card = this.stats.cardMap[entry.id];
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

        let insertedCount = 0;
        if (rows.length) {
          const { data: inserted, error } = await supabase
            .from('Card')
            .insert(rows)
            .select();
          if (error) throw error;
          insertedCount = inserted?.length ?? rows.length;
        }

        this.snackbar = {
          open: true,
          message: this.$t('deckImport.added', insertedCount, { count: insertedCount }),
          color: 'var(--c-accent)',
          icon: 'mdi-heart-plus',
        };
      } catch (err) {
        console.error('DeckDetailPage: addMissingToWishlist failed', err);
        this.snackbar = {
          open: true,
          message: this.$t('common.error'),
          color: 'error',
          icon: 'mdi-alert-circle',
        };
      } finally {
        this.addingToWishlist = false;
      }
    },

    // ── Ignore / skip card toggle ────────────────────────────────────────
    onToggleIgnore(cardId) {
      const result = toggleIgnoredId(this.deck.id, cardId);
      this.ignoredIds = new Set(result); // new Set() instance triggers Vue 3 reactivity

      // Persist to Supabase for auth users (fire-and-forget)
      const userId = this.login?.user?.id ?? null;
      if (userId) {
        saveIgnoredIdsToDb(getClient(), this.deck.id, this.ignoredIds);
      }

      // Optimistically recompute missing count from already-loaded stats
      // without re-fetching card/ownership data
      const allEntries = [
        ...this.stats.main,
        ...this.stats.extra,
        ...this.stats.side,
      ];
      const missingEntries = allEntries.filter(
        e => this.stats.cardMap[e.id] && !this.stats.ownedIds.has(e.id) && !this.ignoredIds.has(e.id)
      );
      this.stats.missing = missingEntries.reduce((sum, e) => sum + e.qty, 0);
      this.stats.missingEntries = missingEntries;
    },

    // ── Realtime subscription (auth users only) ──────────────────────────
    subscribeRealtime() {
      const userId = this.login?.user?.id ?? null;
      if (!userId || !this.deck) return;

      const supabase = getClient();
      this._realtimeChannel = supabase
        .channel(`deck-owned-${this.deck.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'Card', filter: `trader=eq.${userId}` },
          () => { this.resolveStats(); }
        )
        .subscribe();
    },

    unsubscribeRealtime() {
      if (this._realtimeChannel) {
        getClient().removeChannel(this._realtimeChannel);
        this._realtimeChannel = null;
      }
    },

    // ── Guest localStorage helpers ───────────────────────────────────────
    readGuestDecks() {
      if (typeof window === 'undefined') return [];
      try {
        const raw = window.localStorage.getItem(GUEST_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    },
  },
};
</script>
