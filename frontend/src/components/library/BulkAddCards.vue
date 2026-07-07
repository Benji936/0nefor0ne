<template>
  <v-dialog v-model="dialogOpen" max-width="640" scrollable @after-leave="reset">
    <template v-if="!headless" #activator="{ props: activatorProps }">
      <v-btn
        density="comfortable"
        variant="flat"
        :style="{ backgroundColor: meta.color, color: 'white' }"
        prepend-icon="mdi-playlist-plus"
        v-bind="activatorProps"
      >
        {{ buttonLabel || $t('bulkAdd.title') }}
      </v-btn>
    </template>

    <v-card style="min-height: 480px; background-color: var(--c-surface); color: var(--c-text)">
      <!-- Banner -->
      <div class="flex flex-row items-center gap-3 px-5 py-3" :style="{ backgroundColor: meta.color, color: 'white' }">
        <v-icon icon="mdi-playlist-plus" size="22" />
        <div class="flex flex-col grow min-w-0">
          <span class="font-bold leading-tight">{{ $t('bulkAdd.title') }}</span>
          <span class="text-xs opacity-80">{{ $t('bulkAdd.subtitle') }}</span>
        </div>
        <v-btn icon="mdi-close" variant="text" color="white" density="compact" @click="dialogOpen = false" />
      </div>

      <!-- ── Step: Paste ── -->
      <template v-if="step === 'paste'">
        <v-card-text class="pa-5 flex flex-col gap-4">
          <!-- Destination toggle (AC6) -->
          <div class="flex flex-col gap-2">
            <span class="text-xs font-semibold uppercase tracking-wide" style="color: var(--c-muted)">{{ $t('bulkAdd.destination') }}</span>
            <v-btn-toggle
              v-model="destination"
              mandatory
              density="comfortable"
              variant="outlined"
              divided
            >
              <v-btn value="trade" prepend-icon="mdi-plus-box">{{ $t('bulkAdd.tradePile') }}</v-btn>
              <v-btn value="wish" prepend-icon="mdi-heart-plus">{{ $t('bulkAdd.wishlist') }}</v-btn>
            </v-btn-toggle>
          </div>

          <v-textarea
            v-model="rawText"
            :placeholder="$t('bulkAdd.placeholder')"
            variant="outlined"
            rows="10"
            auto-grow
            hide-details
            autofocus
          />

          <!-- Nothing-to-add hint (AC8) -->
          <p v-if="rawText.trim() && parsedCount === 0" class="text-xs" style="color: var(--c-muted)">
            {{ $t('bulkAdd.noLines') }}
          </p>

          <v-alert v-if="errorMessage" type="error" variant="tonal" density="compact">{{ errorMessage }}</v-alert>

          <v-btn
            class="w-full mt-1"
            size="large"
            prepend-icon="mdi-magnify"
            :style="{ backgroundColor: meta.color, color: 'white' }"
            variant="flat"
            :disabled="parsedCount === 0"
            @click="onResolve"
          >
            {{ $t('bulkAdd.resolve') }}
          </v-btn>
        </v-card-text>
      </template>

      <!-- ── Step: Resolving (progress) ── -->
      <template v-else-if="step === 'resolving'">
        <v-card-text class="pa-5 flex flex-col items-center justify-center gap-4" style="min-height: 320px">
          <v-progress-linear
            :model-value="resolveTotal ? (resolveCurrent / resolveTotal) * 100 : 0"
            color="var(--c-accent)"
            height="8"
            rounded
            class="w-full"
          />
          <p class="text-sm" style="color: var(--c-muted)">
            {{ $t('bulkAdd.resolving', { current: resolveCurrent, total: resolveTotal }) }}
          </p>
        </v-card-text>
      </template>

      <!-- ── Step: Review ── -->
      <template v-else-if="step === 'review'">
        <v-card-text class="pa-5 flex flex-col gap-3">
          <p class="text-xs font-bold uppercase tracking-wide" style="color: var(--c-muted)">
            {{ $t('bulkAdd.reviewTitle') }}
          </p>

          <div class="flex flex-col gap-2 overflow-y-auto" style="max-height: 360px">
            <div
              v-for="(row, index) in rows"
              :key="index"
              class="flex items-center gap-3 rounded-xl px-3 py-2 border"
              :style="rowStyle(row)"
            >
              <!-- Thumbnail / status icon -->
              <img
                v-if="rowImageId(row)"
                :src="cardImage(rowImageId(row))"
                :alt="rowDisplayName(row)"
                loading="lazy"
                class="h-14 w-10 object-contain rounded shrink-0"
              />
              <div
                v-else
                class="h-14 w-10 rounded shrink-0 flex items-center justify-center"
                style="background-color: var(--c-surface-2); border: 1px solid var(--c-border)"
              >
                <v-icon icon="mdi-help" size="18" style="color: var(--c-muted)" />
              </div>

              <div class="flex flex-col grow min-w-0 gap-1">
                <!-- Matched -->
                <template v-if="row.status === 'matched'">
                  <p class="font-semibold text-sm truncate" style="color: var(--c-text)">{{ rowDisplayName(row) }}</p>
                  <span class="text-xs" style="color: var(--c-trade)">{{ $t('bulkAdd.matched') }} · ×{{ row.qty }}</span>
                </template>

                <!-- Ambiguous (picker — AC4) -->
                <template v-else-if="row.status === 'ambiguous'">
                  <p class="text-xs truncate" style="color: var(--c-muted)">"{{ row.query }}" · ×{{ row.qty }}</p>
                  <span class="text-xs font-semibold" style="color: var(--c-accent)">{{ $t('bulkAdd.ambiguous') }}</span>
                  <v-select
                    v-model="row.selected"
                    :items="row.candidates"
                    :item-title="candidateTitle"
                    return-object
                    density="compact"
                    variant="outlined"
                    hide-details
                    class="mt-1"
                  />
                </template>

                <!-- Unmatched (flagged, excluded — AC3) -->
                <template v-else>
                  <p class="text-sm truncate" style="color: var(--c-muted)">"{{ row.query }}"</p>
                  <span class="text-xs font-semibold" style="color: #dc2626">{{ $t('bulkAdd.unmatched') }}</span>
                </template>
              </div>

              <v-btn
                icon="mdi-close"
                variant="text"
                density="compact"
                size="small"
                :title="$t('bulkAdd.remove')"
                @click="removeRow(index)"
              />
            </div>
          </div>

          <v-alert v-if="errorMessage" type="error" variant="tonal" density="compact">{{ errorMessage }}</v-alert>

          <v-btn
            class="w-full mt-1"
            size="large"
            prepend-icon="mdi-content-save-all"
            :style="{ backgroundColor: meta.color, color: 'white' }"
            variant="flat"
            :loading="inserting"
            :disabled="includedCount === 0"
            @click="onConfirm"
          >
            {{ inserting ? $t('bulkAdd.adding') : $t('bulkAdd.addAll') }}
          </v-btn>
        </v-card-text>
      </template>

      <!-- ── Step: Summary ── -->
      <template v-else-if="step === 'summary'">
        <v-card-text class="pa-5 flex flex-col items-center justify-center gap-4" style="min-height: 320px">
          <v-icon icon="mdi-check-circle-outline" size="48" style="color: var(--c-accent)" />
          <p class="text-base font-semibold" style="color: var(--c-text)">
            {{ $t('bulkAdd.added', addedCount, { count: addedCount }) }}
          </p>
          <p v-if="skippedCount > 0" class="text-sm" style="color: var(--c-muted)">
            {{ $t('bulkAdd.skipped', skippedCount, { count: skippedCount }) }}
          </p>
          <v-btn variant="outlined" style="color: var(--c-muted); border-color: var(--c-border)" @click="dialogOpen = false">
            {{ $t('common.close') }}
          </v-btn>
        </v-card-text>
      </template>
    </v-card>
  </v-dialog>
</template>

<script>
import { cardImage } from '@/lib/cardImage';
import { getClient } from '@/lib/supabaseClient';
import { parseBulkLines } from '@/lib/bulkAddParser';
import { resolveLines, buildRow, sanitizeRows, chunk } from '@/lib/bulkAddResolver';

export default {
  name: 'BulkAddCards',

  props: {
    mode: { type: String, default: 'trade', validator: (m) => ['wish', 'trade'].includes(m) },
    buttonLabel: { type: String, default: '' },
    headless: { type: Boolean, default: false },
  },

  emits: ['added', 'requireAuth'],

  data() {
    return {
      dialogOpen: false,
      /** 'paste' | 'resolving' | 'review' | 'summary' */
      step: 'paste',
      destination: this.mode === 'wish' ? 'wish' : 'trade',
      rawText: '',
      rows: [],
      resolveCurrent: 0,
      resolveTotal: 0,
      inserting: false,
      errorMessage: '',
      addedCount: 0,
      skippedCount: 0,
      /** Total parsed-line count captured at resolve time, for AC7 reconciliation. */
      parsedTotal: 0,
    };
  },

  computed: {
    meta() {
      return this.destination === 'wish'
        ? { color: 'var(--c-accent)' }
        : { color: 'var(--c-trade)' };
    },

    /** Number of usable lines in the current paste (drives the disabled state, AC8). */
    parsedCount() {
      return parseBulkLines(this.rawText).length;
    },

    /** Rows that will actually be inserted: matched, or ambiguous with a selection. */
    includedRows() {
      return this.rows.filter((r) => this.isIncluded(r));
    },

    includedCount() {
      return this.includedRows.length;
    },
  },

  methods: {
    cardImage,

    /** A row is included when it is matched, or ambiguous with a chosen candidate. */
    isIncluded(row) {
      if (!row) return false;
      if (row.status === 'matched') return !!(row.selected || row.card);
      if (row.status === 'ambiguous') return !!row.selected;
      return false;
    },

    /** The resolved card for an included row (selected candidate wins). */
    rowCard(row) {
      return row?.selected ?? row?.card ?? null;
    },

    rowImageId(row) {
      return this.rowCard(row)?.id ?? null;
    },

    rowDisplayName(row) {
      const card = this.rowCard(row);
      return card?.name ?? row?.query ?? '';
    },

    candidateTitle(card) {
      return card?.name ?? '';
    },

    rowStyle(row) {
      if (row.status === 'unmatched') {
        return {
          backgroundColor: 'color-mix(in srgb, #dc2626 6%, transparent)',
          borderColor: 'color-mix(in srgb, #dc2626 25%, transparent)',
        };
      }
      if (row.status === 'ambiguous') {
        return {
          backgroundColor: 'color-mix(in srgb, var(--c-accent) 6%, transparent)',
          borderColor: 'color-mix(in srgb, var(--c-accent) 25%, transparent)',
        };
      }
      return { backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' };
    },

    removeRow(index) {
      this.rows.splice(index, 1);
    },

    /**
     * Resolve phase. Auth is checked BEFORE resolution (AC11) so a stale session
     * never loses the paste, and no lookups fire on empty input (AC8).
     */
    async onResolve() {
      this.errorMessage = '';
      const parsed = parseBulkLines(this.rawText);
      if (parsed.length === 0) return; // AC8 — no lookups on empty/whitespace.

      // AC11 — auth gate before resolve; abort without writing rows or losing paste.
      const { data: userData, error: userError } = await getClient().auth.getUser();
      if (userError || !userData?.user?.id) {
        this.$emit('requireAuth');
        return;
      }

      this.parsedTotal = parsed.length;
      this.resolveCurrent = 0;
      this.resolveTotal = parsed.length;
      this.step = 'resolving';

      try {
        const resolved = await resolveLines(parsed, {
          onProgress: (current, total) => {
            this.resolveCurrent = current;
            this.resolveTotal = total;
          },
        });
        this.rows = resolved;
        this.step = 'review';
      } catch (err) {
        console.error('BulkAddCards: resolution failed', err);
        this.errorMessage = String(err?.message ?? err);
        this.step = 'paste';
      }
    },

    /**
     * Confirm + chunked insert. Re-checks auth, builds rows via buildRow, runs
     * sanitizeRows defensively, then inserts in chunks of 500 (AC9/AC10),
     * accumulating the inserted count. Duplicates are allowed (AC5).
     */
    async onConfirm() {
      this.errorMessage = '';
      const included = this.includedRows;
      if (included.length === 0) return;

      this.inserting = true;
      try {
        const supabase = getClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData?.user?.id) {
          this.$emit('requireAuth');
          this.inserting = false;
          return;
        }
        const userId = userData.user.id;
        const isWish = this.destination === 'wish';

        const rows = sanitizeRows(
          included
            .map((row) => {
              const card = this.rowCard(row);
              return card ? buildRow({ card, qty: row.qty, isWish, userId }) : null;
            })
            .filter((r) => r != null),
        );

        let insertedCount = 0;
        for (const part of chunk(rows, 500)) {
          const { data, error } = await supabase.from('Card').insert(part).select();
          if (error) throw error;
          insertedCount += data?.length ?? part.length;
        }

        // AC7 — skipped reconciles to the parsed total:
        //   skipped = parsedTotal - inserted (unmatched + dropped + unresolved ambiguous).
        this.addedCount = insertedCount;
        this.skippedCount = Math.max(0, this.parsedTotal - insertedCount);

        this.$emit('added', insertedCount);
        this.step = 'summary';
      } catch (err) {
        console.error('BulkAddCards: insert failed', err);
        this.errorMessage = String(err?.message ?? err);
      } finally {
        this.inserting = false;
      }
    },

    reset() {
      this.step = 'paste';
      this.destination = this.mode === 'wish' ? 'wish' : 'trade';
      this.rawText = '';
      this.rows = [];
      this.resolveCurrent = 0;
      this.resolveTotal = 0;
      this.inserting = false;
      this.errorMessage = '';
      this.addedCount = 0;
      this.skippedCount = 0;
      this.parsedTotal = 0;
    },
  },
};
</script>
