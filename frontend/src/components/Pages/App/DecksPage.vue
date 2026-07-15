<template>
  <v-container class="py-5" style="max-width: 1100px">

    <!-- ── Page title ── -->
    <h1 class="text-h5 font-weight-bold mb-4" style="color: var(--c-text)">
      {{ $t('decks.title') }}
    </h1>

    <!-- ── Guest banner ── -->
    <v-alert
      v-if="isGuest && decks.length > 0"
      type="info"
      variant="tonal"
      density="comfortable"
      class="mb-4"
      icon="mdi-information-outline"
    >
      {{ $t('decks.guestBanner') }}
    </v-alert>

    <!-- ── Migration prompt ── -->
    <v-dialog v-model="showMigrationPrompt" max-width="440" persistent>
      <v-card>
        <v-card-text class="pt-5">
          {{ $t('decks.migratePrompt', { count: pendingMigrationCount }) }}
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" :disabled="migrating" @click="discardMigration">
            {{ $t('decks.migrateDiscard') }}
          </v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :loading="migrating"
            @click="saveMigration"
          >
            {{ $t('decks.migrateSave') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ── Import section ── -->
    <v-card variant="outlined" class="mb-5">
      <v-card-text>
        <div
          class="d-flex flex-column align-center justify-center text-center pa-6 rounded"
          style="border: 2px dashed var(--c-border); cursor: pointer; min-height: 140px"
          :style="dragging ? 'border-color: var(--c-accent); background-color: color-mix(in srgb, var(--c-accent) 6%, transparent)' : ''"
          @click="triggerFileInput"
          @dragover.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onDrop"
        >
          <v-icon icon="mdi-file-import-outline" size="40" style="color: var(--c-muted)" />
          <p class="text-body-2 mt-2" style="color: var(--c-muted)">
            {{ $t('decks.importButton') }}
          </p>
          <input
            ref="fileInput"
            type="file"
            accept=".ydk"
            class="d-none"
            @change="onFileChange"
          />
        </div>

        <!-- File error -->
        <v-alert
          v-if="importError"
          type="error"
          variant="tonal"
          density="compact"
          class="mt-3"
        >
          {{ importError }}
        </v-alert>

        <!-- Name confirmation -->
        <div v-if="pendingDeck" class="mt-4 d-flex flex-column flex-sm-row gap-2 align-sm-center">
          <v-text-field
            v-model="pendingDeck.name"
            :label="$t('decks.confirmName')"
            :maxlength="60"
            density="comfortable"
            variant="outlined"
            hide-details
            class="flex-grow-1"
            @keyup.enter="confirmImport"
          />
          <div class="d-flex gap-2 mt-2 mt-sm-0">
            <v-btn variant="text" :disabled="savingDeck" @click="cancelImport">
              {{ $t('common.close') }}
            </v-btn>
            <v-btn
              color="primary"
              variant="flat"
              :loading="savingDeck"
              :disabled="!pendingDeck.name.trim()"
              @click="confirmImport"
            >
              {{ $t('decks.confirmImport') }}
            </v-btn>
          </div>
        </div>
      </v-card-text>
    </v-card>

    <!-- ── Sort toggle ── -->
    <div v-if="decks.length > 0" class="d-flex justify-end mb-3">
      <v-btn
        size="small"
        variant="outlined"
        :prepend-icon="sortByMissing ? 'mdi-sort-descending' : 'mdi-sort'"
        @click="sortByMissing = !sortByMissing"
      >
        {{ $t('decks.sortByMissing') }}
      </v-btn>
    </div>

    <!-- ── Empty state ── -->
    <v-card v-if="!loading && decks.length === 0" variant="tonal" class="text-center pa-8">
      <v-icon icon="mdi-cards-outline" size="48" style="color: var(--c-muted)" class="mb-2" />
      <p class="text-body-1" style="color: var(--c-muted)">{{ $t('decks.empty') }}</p>
    </v-card>

    <!-- ── Loading ── -->
    <div v-else-if="loading" class="d-flex justify-center py-8">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <!-- ── Deck list ── -->
    <v-expansion-panels v-else v-model="expandedPanel" variant="accordion">
      <v-expansion-panel
        v-for="deck in sortedDecks"
        :key="deck.id"
        :value="deck.id"
        @group:selected="onPanelToggle(deck, $event)"
      >
        <v-expansion-panel-title>
          <div class="d-flex flex-column flex-grow-1" style="min-width: 0">
            <!-- Rename inline -->
            <div v-if="renamingId === deck.id" class="d-flex align-center gap-2" @click.stop>
              <v-text-field
                v-model="renameValue"
                :maxlength="60"
                density="compact"
                variant="outlined"
                hide-details
                autofocus
                @keyup.enter="confirmRename(deck)"
                @keyup.esc="cancelRename"
              />
              <v-btn icon="mdi-check" size="x-small" variant="text" color="primary" @click="confirmRename(deck)" />
              <v-btn icon="mdi-close" size="x-small" variant="text" @click="cancelRename" />
            </div>

            <!-- Name + stats -->
            <template v-else>
              <div class="d-flex align-center gap-2">
                <router-link
                  :to="{ name: 'deckDetail', params: { locale: $route.params.locale, deckId: deck.id || deck.localId } }"
                  class="text-subtitle-1 font-weight-medium text-truncate"
                  style="color: inherit; text-decoration: none"
                  @click.stop
                >{{ deck.name }}</router-link>
                <v-btn
                  icon="mdi-pencil"
                  size="x-small"
                  variant="text"
                  @click.stop="startRename(deck)"
                  :title="$t('decks.rename')"
                />
                <v-btn
                  icon="mdi-delete-outline"
                  size="x-small"
                  variant="text"
                  color="error"
                  @click.stop="askDelete(deck)"
                  :title="$t('decks.delete')"
                />
                <v-btn
                  :to="{ name: 'deckDetail', params: { locale: $route.params.locale, deckId: deck.id || deck.localId } }"
                  size="small"
                  variant="tonal"
                  color="primary"
                  class="ml-auto flex-shrink-0"
                  append-icon="mdi-arrow-right"
                  @click.stop
                >{{ $t('decks.openDeck') }}</v-btn>
              </div>
              <div class="text-caption mt-1" style="color: var(--c-muted)">
                <template v-if="deckStats[deck.id]">
                  <span>{{ $t('decks.totalCards', { total: deckStats[deck.id].total }) }}</span>
                  <span class="mx-1">·</span>
                  <span style="color: var(--c-accent)">{{ $t('decks.ownedCount', { owned: deckStats[deck.id].owned }) }}</span>
                  <span class="mx-1">·</span>
                  <span :style="deckStats[deck.id].missing > 0 ? 'color: var(--c-error, rgb(220,38,38))' : ''">
                    {{ $t('decks.missingCount', { missing: deckStats[deck.id].missing }) }}
                  </span>
                  <template v-if="deckStats[deck.id].unrecognized > 0">
                    <span class="mx-1">·</span>
                    <span>{{ $t('decks.unrecognizedCount', { count: deckStats[deck.id].unrecognized }) }}</span>
                  </template>
                </template>
                <span v-else>&nbsp;</span>
              </div>

              <!-- Compact completion bar + percentage -->
              <div v-if="deckStats[deck.id]" class="d-flex align-center gap-2 mt-1" style="max-width: 320px">
                <DeckCompletionBar
                  compact
                  :owned="deckStats[deck.id].owned"
                  :sourced="deckStats[deck.id].sourcedCount"
                  :total="deckStats[deck.id].total"
                  class="flex-grow-1"
                />
                <span class="text-caption" style="color: var(--c-muted); white-space: nowrap">
                  {{ deckCompletionPct(deck) }}%
                </span>
              </div>
            </template>
          </div>
        </v-expansion-panel-title>

        <v-expansion-panel-text>
          <!-- Stats loading -->
          <div v-if="loadingStats[deck.id]" class="d-flex justify-center py-6">
            <v-progress-circular indeterminate size="28" color="primary" />
          </div>

          <template v-else-if="deckStats[deck.id]">
            <!-- All owned / Add missing -->
            <div class="mb-4">
              <v-alert
                v-if="deckStats[deck.id].missing === 0 && deckStats[deck.id].total > 0"
                type="success"
                variant="tonal"
                density="compact"
                icon="mdi-check-circle-outline"
              >
                {{ $t('decks.allOwned') }}
              </v-alert>
              <v-btn
                v-else-if="deckStats[deck.id].missing > 0"
                color="primary"
                variant="flat"
                prepend-icon="mdi-heart-plus"
                :loading="addingId === deck.id"
                @click="addMissingToWishlist(deck)"
              >
                {{ $t('decks.addMissing', deckStats[deck.id].missing, { count: deckStats[deck.id].missing }) }}
              </v-btn>
            </div>

            <!-- Sections -->
            <DeckSection
              v-for="sec in ['main', 'extra', 'side']"
              :key="sec"
              :entries="deckStats[deck.id][sec]"
              :card-map="deckStats[deck.id].cardMap"
              :owned-ids="deckStats[deck.id].ownedIds"
              :title="$t('deckImport.sections.' + sec)"
              :missing-badge="$t('deckImport.missingBadge')"
              :unknown-badge="$t('deckImport.unknownBadge')"
              :ignored-ids="ignoredByDeck[deck.id] || new Set()"
              @toggle-ignore="onToggleDeckIgnore(deck.id, $event)"
            />
          </template>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <!-- ── Delete confirmation ── -->
    <v-dialog v-model="showDeleteConfirm" max-width="400">
      <v-card>
        <v-card-text class="pt-5">{{ $t('decks.deleteConfirm') }}</v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" :disabled="deleting" @click="showDeleteConfirm = false">
            {{ $t('common.close') }}
          </v-btn>
          <v-btn color="error" variant="flat" :loading="deleting" @click="confirmDelete">
            {{ $t('decks.delete') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ── Snackbar ── -->
    <v-snackbar v-model="snackbar.open" :timeout="3000" :color="snackbar.color" location="bottom right">
      <v-icon :icon="snackbar.icon" class="mr-2" size="18" />
      {{ snackbar.message }}
    </v-snackbar>

  </v-container>
</template>

<script>
import { ref, computed } from 'vue';
import { useHead } from '@unhead/vue';
import { useI18n } from 'vue-i18n';
import { parseYdk } from '@/lib/ydk';
import { getCardsByIds } from '@/api';
import { getClient } from '@/lib/supabaseClient';
import DeckSection from '@/components/library/DeckSection.vue';
import DeckCompletionBar from '@/components/library/DeckCompletionBar.vue';
import { loadIgnoredIds, toggleIgnoredId, loadIgnoredIdsFromRecord, saveIgnoredIdsToDb } from '@/lib/deckIgnore';
import { computeSourcedCount, computeCompletionPct } from '@/lib/deckStats';

const GUEST_KEY = 'tm_guest_decks';

export default {
  name: 'DecksPage',
  components: { DeckSection, DeckCompletionBar },

  props: {
    login: { type: Object, default: null },
  },

  emits: ['requireAuth'],

  setup() {
    const { t } = useI18n();
    const title = ref(t('decks.title') + ' — One for One');
    useHead({
      title,
      meta: [{ name: 'robots', content: 'noindex' }],
    });
    return {};
  },

  data() {
    return {
      loading: true,

      /** Normalized deck list: { id, name, ydk_content, created_at } */
      decks: [],

      /** Lazy per-deck stats cache, keyed by deck id */
      deckStats: {},
      loadingStats: {},

      /** Per-deck ignored card IDs, keyed by deckId; values are Set<number> */
      ignoredByDeck: {},

      expandedPanel: null,

      sortByMissing: true,

      // Import flow
      dragging: false,
      importError: '',
      pendingDeck: null,   // { name, ydkContent }
      savingDeck: false,

      // Rename flow
      renamingId: null,
      renameValue: '',

      // Delete flow
      showDeleteConfirm: false,
      deckToDelete: null,
      deleting: false,

      // Wishlist add
      addingId: null,

      // Migration
      showMigrationPrompt: false,
      pendingMigrationCount: 0,
      migrating: false,

      snackbar: { open: false, message: '', color: '', icon: '' },
    };
  },

  computed: {
    isGuest() {
      return !this.login?.user?.id;
    },

    sortedDecks() {
      const list = [...this.decks];
      if (this.sortByMissing) {
        list.sort((a, b) => {
          const ma = this.deckStats[a.id]?.missing ?? -1;
          const mb = this.deckStats[b.id]?.missing ?? -1;
          return mb - ma;
        });
      }
      return list;
    },
  },

  watch: {
    // Guest → auth migration: fires when login transitions from null to a user
    login(newVal, oldVal) {
      const newId = newVal?.user?.id ?? null;
      const oldId = oldVal?.user?.id ?? null;
      if (newId && newId !== oldId) {
        this.reloadAfterAuthChange();
      }
    },
  },

  async mounted() {
    await this.loadDecks();
    this.loading = false;
    this.checkPendingMigration();
    this.subscribeRealtime();
  },

  beforeUnmount() {
    this.unsubscribeRealtime();
  },

  methods: {
    // ── Completion bar helper ───────────────────────────────────────────
    deckCompletionPct(deck) {
      const stats = this.deckStats[deck.id];
      if (!stats) return 0;
      return computeCompletionPct({ owned: stats.owned, sourced: stats.sourcedCount, total: stats.total });
    },

    // ── Persistence: load ───────────────────────────────────────────────
    async loadDecks() {
      const userId = this.login?.user?.id ?? null;
      if (userId) {
        const supabase = getClient();
        const { data, error } = await supabase
          .from('decks')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
        if (error) {
          console.error('DecksPage: loadDecks failed', error);
          this.decks = [];
          this.snackbar = {
            open: true,
            message: this.$t('common.error'),
            color: 'error',
            icon: 'mdi-alert-circle',
          };
          return;
        }
        this.decks = (data ?? []).map(d => ({
          id: d.id,
          name: d.name,
          ydk_content: d.ydk_content,
          created_at: d.created_at,
        }));

        // Auth users: load ignored IDs from Supabase records (client-only)
        this.ignoredByDeck = {};
        for (const d of (data ?? [])) {
          this.ignoredByDeck[d.id] = loadIgnoredIdsFromRecord(d);
        }
      } else {
        this.decks = this.readGuestDecks().map(d => ({
          id: d.localId,
          name: d.name,
          ydk_content: d.ydkContent,
          created_at: d.importedAt,
        }));

        // Guests: load ignored IDs from localStorage
        this.ignoredByDeck = {};
        for (const deck of this.decks) {
          this.ignoredByDeck[deck.id] = loadIgnoredIds(deck.id);
        }
      }
    },

    async reloadAfterAuthChange() {
      this.loading = true;
      this.deckStats = {};
      this.loadingStats = {};
      this.expandedPanel = null;
      await this.loadDecks();
      this.loading = false;
      this.checkPendingMigration();
    },

    // ── Guest localStorage helpers ──────────────────────────────────────
    // ── Realtime subscription (auth users only) ──────────────────────────
    subscribeRealtime() {
      const userId = this.login?.user?.id ?? null;
      if (!userId) return;

      const supabase = getClient();
      this._realtimeChannel = supabase
        .channel('decks-page-owned-watch')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'Card', filter: `trader=eq.${userId}` },
          () => {
            // Re-compute stats for all already-expanded decks
            this.deckStats = {};
            for (const deck of this.decks) {
              if (this.expandedPanel === deck.id) {
                this.computeStats(deck);
              }
            }
          }
        )
        .subscribe();
    },

    unsubscribeRealtime() {
      if (this._realtimeChannel) {
        getClient().removeChannel(this._realtimeChannel);
        this._realtimeChannel = null;
      }
    },

    readGuestDecks() {
      if (typeof window === 'undefined') return [];
      try {
        const raw = window.localStorage.getItem(GUEST_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    },

    writeGuestDecks(list) {
      if (typeof window === 'undefined') return;
      try {
        window.localStorage.setItem(GUEST_KEY, JSON.stringify(list));
      } catch (err) {
        console.error('DecksPage: writeGuestDecks failed', err);
      }
    },

    clearGuestDecks() {
      if (typeof window === 'undefined') return;
      try {
        window.localStorage.removeItem(GUEST_KEY);
      } catch { /* ignore */ }
    },

    // ── Import flow ─────────────────────────────────────────────────────
    triggerFileInput() {
      this.$refs.fileInput?.click();
    },

    onFileChange(event) {
      const file = event.target.files?.[0];
      if (file) this.processFile(file);
      event.target.value = '';
    },

    onDrop(event) {
      this.dragging = false;
      const file = event.dataTransfer?.files?.[0];
      if (file) this.processFile(file);
    },

    async processFile(file) {
      this.importError = '';
      const name = file?.name ?? '';
      if (!name.toLowerCase().endsWith('.ydk')) {
        this.importError = this.$t('deckImport.error');
        return;
      }
      try {
        const text = await file.text();
        const defaultName = name.replace(/\.ydk$/i, '').slice(0, 60);
        this.pendingDeck = { name: defaultName, ydkContent: text };
      } catch (err) {
        console.error('DecksPage: failed to read file', err);
        this.importError = this.$t('deckImport.error');
      }
    },

    cancelImport() {
      this.pendingDeck = null;
      this.importError = '';
    },

    async confirmImport() {
      if (!this.pendingDeck) return;
      const name = this.pendingDeck.name.trim().slice(0, 60);
      if (!name) return;
      const ydkContent = this.pendingDeck.ydkContent;

      this.savingDeck = true;
      try {
        const saved = await this.saveDeck(name, ydkContent);
        if (saved) {
          this.decks = [saved, ...this.decks];
          this.snackbar = {
            open: true,
            message: `${name} — ${this.$t('decks.confirmImport')}`,
            color: 'var(--c-accent)',
            icon: 'mdi-check-circle',
          };
        }
        this.pendingDeck = null;
      } catch (err) {
        console.error('DecksPage: confirmImport failed', err);
        this.importError = this.$t('deckImport.error');
      } finally {
        this.savingDeck = false;
      }
    },

    // ── Persistence: create ─────────────────────────────────────────────
    async saveDeck(name, ydkContent) {
      const userId = this.login?.user?.id ?? null;
      if (userId) {
        const supabase = getClient();
        const { data, error } = await supabase
          .from('decks')
          .insert({ user_id: userId, name, ydk_content: ydkContent })
          .select()
          .single();
        if (error) throw error;
        return {
          id: data.id,
          name: data.name,
          ydk_content: data.ydk_content,
          created_at: data.created_at,
        };
      }
      // Guest
      const localId = Date.now().toString();
      const importedAt = new Date().toISOString();
      const list = this.readGuestDecks();
      list.unshift({ localId, name, ydkContent, importedAt });
      this.writeGuestDecks(list);
      return { id: localId, name, ydk_content: ydkContent, created_at: importedAt };
    },

    // ── Ignore toggle ────────────────────────────────────────────────────
    onToggleDeckIgnore(deckId, cardId) {
      const result = toggleIgnoredId(deckId, cardId);
      const newSet = new Set(result);
      // Spread to trigger Vue reactivity on the parent plain object
      this.ignoredByDeck = { ...this.ignoredByDeck, [deckId]: newSet };

      // Persist to Supabase for auth users (fire-and-forget)
      const userId = this.login?.user?.id ?? null;
      if (userId) {
        saveIgnoredIdsToDb(getClient(), deckId, newSet);
      }

      // Recompute missing/missingEntries for this deck if stats are already loaded
      const stats = this.deckStats[deckId];
      if (stats) {
        const ignoredIds = this.ignoredByDeck[deckId];
        const allEntries = [...stats.main, ...stats.extra, ...stats.side];
        const missingEntries = allEntries.filter(
          c => stats.cardMap[c.id] && !stats.ownedIds.has(c.id) && !ignoredIds.has(c.id)
        );
        const missing = missingEntries.reduce((s, c) => s + c.qty, 0);
        const sourcedCount = computeSourcedCount(allEntries, stats.cardMap, stats.ownedIds, ignoredIds);
        this.deckStats = {
          ...this.deckStats,
          [deckId]: { ...stats, missing, missingEntries, sourcedCount },
        };
      }
    },

    // ── Lazy stats ──────────────────────────────────────────────────────
    onPanelToggle(deck, payload) {
      // v-expansion-panel emits { value: boolean }
      const opened = payload?.value ?? (this.expandedPanel === deck.id);
      if (opened && !this.deckStats[deck.id] && !this.loadingStats[deck.id]) {
        this.computeStats(deck);
      }
    },

    async computeStats(deck) {
      this.loadingStats = { ...this.loadingStats, [deck.id]: true };
      try {
        const parsed = parseYdk(deck.ydk_content);
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
        const ignoredIds = this.ignoredByDeck[deck.id] || new Set();
        const total = allEntries.reduce((s, c) => s + c.qty, 0);
        const owned = allEntries
          .filter(c => cardMap[c.id] && ownedIds.has(c.id))
          .reduce((s, c) => s + c.qty, 0);
        const missingEntries = allEntries.filter(
          c => cardMap[c.id] && !ownedIds.has(c.id) && !ignoredIds.has(c.id)
        );
        const missing = missingEntries.reduce((s, c) => s + c.qty, 0);
        const unrecognized = allEntries
          .filter(c => !cardMap[c.id])
          .reduce((s, c) => s + c.qty, 0);
        const sourcedCount = computeSourcedCount(allEntries, cardMap, ownedIds, ignoredIds);

        this.deckStats = {
          ...this.deckStats,
          [deck.id]: {
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
            sourcedCount,
          },
        };
      } catch (err) {
        console.error('DecksPage: computeStats failed', err);
      } finally {
        this.loadingStats = { ...this.loadingStats, [deck.id]: false };
      }
    },

    // ── Wishlist add (copied from DeckImport.addMissingToWishlist) ──────
    async addMissingToWishlist(deck) {
      if (!this.login?.user?.id) {
        this.$emit('requireAuth');
        return;
      }
      const stats = this.deckStats[deck.id];
      if (!stats) return;

      this.addingId = deck.id;
      const supabase = getClient();
      const userId = this.login.user.id;
      try {
        const rows = stats.missingEntries.map(entry => {
          const card = stats.cardMap[entry.id];
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
        console.error('DecksPage: addMissingToWishlist failed', err);
        this.snackbar = {
          open: true,
          message: this.$t('common.error'),
          color: 'error',
          icon: 'mdi-alert-circle',
        };
      } finally {
        this.addingId = null;
      }
    },

    // ── Rename ──────────────────────────────────────────────────────────
    startRename(deck) {
      this.renamingId = deck.id;
      this.renameValue = deck.name;
    },

    cancelRename() {
      this.renamingId = null;
      this.renameValue = '';
    },

    async confirmRename(deck) {
      const newName = this.renameValue.trim().slice(0, 60);
      if (!newName) { this.cancelRename(); return; }

      try {
        await this.renameDeck(deck.id, newName);
        const idx = this.decks.findIndex(d => d.id === deck.id);
        if (idx !== -1) this.decks[idx].name = newName;
      } catch (err) {
        console.error('DecksPage: rename failed', err);
        this.snackbar = {
          open: true,
          message: this.$t('common.error'),
          color: 'error',
          icon: 'mdi-alert-circle',
        };
      } finally {
        this.cancelRename();
      }
    },

    async renameDeck(id, newName) {
      const userId = this.login?.user?.id ?? null;
      if (userId) {
        const supabase = getClient();
        const { error } = await supabase
          .from('decks')
          .update({ name: newName })
          .eq('id', id)
          .eq('user_id', userId);
        if (error) throw error;
      } else {
        const list = this.readGuestDecks();
        const item = list.find(d => d.localId === id);
        if (item) { item.name = newName; this.writeGuestDecks(list); }
      }
    },

    // ── Delete ──────────────────────────────────────────────────────────
    askDelete(deck) {
      this.deckToDelete = deck;
      this.showDeleteConfirm = true;
    },

    async confirmDelete() {
      if (!this.deckToDelete) return;
      const id = this.deckToDelete.id;
      this.deleting = true;
      try {
        await this.deleteDeck(id);
        this.decks = this.decks.filter(d => d.id !== id);
        const { [id]: _, ...restStats } = this.deckStats;
        this.deckStats = restStats;
      } catch (err) {
        console.error('DecksPage: delete failed', err);
        this.snackbar = {
          open: true,
          message: this.$t('common.error'),
          color: 'error',
          icon: 'mdi-alert-circle',
        };
      } finally {
        this.deleting = false;
        this.showDeleteConfirm = false;
        this.deckToDelete = null;
      }
    },

    async deleteDeck(id) {
      const userId = this.login?.user?.id ?? null;
      if (userId) {
        const supabase = getClient();
        const { error } = await supabase
          .from('decks')
          .delete()
          .eq('id', id)
          .eq('user_id', userId);
        if (error) throw error;
      } else {
        const list = this.readGuestDecks().filter(d => d.localId !== id);
        this.writeGuestDecks(list);
      }
    },

    // ── Migration ───────────────────────────────────────────────────────
    checkPendingMigration() {
      if (this.isGuest) return;
      const guestDecks = this.readGuestDecks();
      if (guestDecks.length > 0) {
        this.pendingMigrationCount = guestDecks.length;
        this.showMigrationPrompt = true;
      }
    },

    async saveMigration() {
      const userId = this.login?.user?.id ?? null;
      if (!userId) { this.discardMigration(); return; }

      this.migrating = true;
      const guestDecks = this.readGuestDecks();
      let errors = 0;
      try {
        for (const deck of guestDecks) {
          try {
            await this.saveDeck(deck.name, deck.ydkContent);
          } catch (e) {
            errors++;
            console.error('Failed to migrate deck:', deck.name, e);
          }
        }
        await this.loadDecks();
      } finally {
        this.clearGuestDecks();
        this.showMigrationPrompt = false;
        this.migrating = false;
      }
      if (errors > 0) {
        this.snackbar = {
          open: true,
          message: this.$t('decks.migratePartialFail', { errors }),
          color: 'warning',
          icon: 'mdi-alert',
        };
      } else {
        this.snackbar = {
          open: true,
          message: this.$t('decks.migrateSave'),
          color: 'var(--c-accent)',
          icon: 'mdi-check-circle',
        };
      }
    },

    discardMigration() {
      this.clearGuestDecks();
      this.showMigrationPrompt = false;
    },
  },
};
</script>
