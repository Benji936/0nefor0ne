<script setup>
/**
 * Paste-a-list input for a Looking For announce's want list.
 *
 * Reuses the bulk-add pipeline (parseBulkLines -> resolveLines) so quantity
 * prefixes, set codes and `#` comments behave exactly as they do when adding to
 * a collection. It deliberately does NOT reuse BulkAddCards.vue: that flow drops
 * anything it cannot resolve, whereas a want list keeps unresolved lines as
 * plain text — "Kashtira Fenrir (alt art)" is still a want a human can act on.
 */
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { parseBulkLines } from "@/lib/bulkAddParser";
import { resolveLines } from "@/lib/bulkAddResolver";
import { buildWantRows, countResolved } from "@/lib/announceWantCards";
import { cardImage } from "@/lib/cardImage";

const { t } = useI18n();

const props = defineProps({
  // announce_want_card rows, as built by buildWantRows().
  modelValue: { type: Array, default: () => [] },
});
const emit = defineEmits(["update:modelValue"]);

const rawText  = ref("");
const rows     = ref([]);     // resolved lines from resolveLines()
const resolving = ref(false);
const current  = ref(0);
const total    = ref(0);

const parsedCount = computed(() => parseBulkLines(rawText.value).length);
const wantRows    = computed(() => buildWantRows(rows.value));
const resolvedCount = computed(() => countResolved(wantRows.value));

// The dialog owns the rows it will insert; this component owns how they are
// gathered. Emitting on every change keeps the two in step without the parent
// reaching into our state.
watch(wantRows, (v) => emit("update:modelValue", v), { deep: true });

// An announce being edited arrives with rows already saved. Show them as a
// resolved list rather than an empty box, without re-hitting the API.
watch(
  () => props.modelValue,
  (incoming) => {
    if (rows.value.length === 0 && incoming?.length) {
      rows.value = incoming.map((r) => ({
        status: r.ygo_card_id ? "matched" : "unmatched",
        qty: r.qty,
        query: r.card_name,
        candidates: [],
        selected: r.ygo_card_id ? { id: r.ygo_card_id, name: r.card_name } : null,
        card:     r.ygo_card_id ? { id: r.ygo_card_id, name: r.card_name } : null,
      }));
    }
  },
  { immediate: true }
);

async function resolve() {
  const lines = parseBulkLines(rawText.value);
  if (lines.length === 0) return;

  resolving.value = true;
  current.value = 0;
  total.value = lines.length;
  try {
    const resolved = await resolveLines(lines, {
      onProgress: (done) => { current.value = done; },
    });
    // Append rather than replace, so a second paste extends the list.
    rows.value = [...rows.value, ...resolved];
    rawText.value = "";
  }
  finally { resolving.value = false; }
}

function removeRow(i) { rows.value.splice(i, 1); }
function clearAll()   { rows.value = []; }

/** Resolve an ambiguous line to one of its candidates. */
function pick(row, cardId) {
  const card = row.candidates.find((c) => String(c.id) === String(cardId)) ?? null;
  row.selected = card;
  row.card = card;
  if (card) row.status = "matched";
}

const cardOf = (row) => row.selected ?? row.card ?? null;
</script>

<template>
  <div class="wl">
    <label class="field-label" for="wl-paste">{{ t('wantList.label') }}</label>

    <textarea
      id="wl-paste"
      v-model="rawText"
      class="field-input wl-paste"
      rows="3"
      :placeholder="t('wantList.placeholder')"
      :disabled="resolving"
    />

    <div class="wl-actions">
      <button
        type="button"
        class="wl-btn"
        :disabled="resolving || parsedCount === 0"
        @click="resolve"
      >
        <v-progress-circular v-if="resolving" indeterminate size="13" width="2" />
        <v-icon v-else icon="mdi-magnify" size="15" />
        {{ resolving
            ? t('wantList.resolving', { current, total })
            : t('wantList.resolve', { count: parsedCount }) }}
      </button>
      <button v-if="rows.length && !resolving" type="button" class="wl-clear" @click="clearAll">
        {{ t('wantList.clear') }}
      </button>
    </div>

    <p v-if="rows.length" class="wl-summary">
      {{ t('wantList.summary', { resolved: resolvedCount, total: rows.length }) }}
    </p>

    <ul v-if="rows.length" class="wl-list">
      <li v-for="(row, i) in rows" :key="i" class="wl-row" :class="{ 'wl-row--unresolved': !cardOf(row) }">
        <img
          v-if="cardOf(row)"
          :src="cardImage(cardOf(row).id)"
          class="wl-thumb"
          alt=""
          loading="lazy"
        />
        <span v-else class="wl-thumb wl-thumb--none">
          <v-icon icon="mdi-help" size="13" />
        </span>

        <span class="wl-qty">{{ row.qty }}&times;</span>

        <span class="wl-name">
          {{ cardOf(row)?.name ?? row.query }}
          <!-- Ambiguous lines are kept, not dropped: the user picks, or leaves
               it as plain text and it still saves. -->
          <select
            v-if="row.status === 'ambiguous' && !cardOf(row)"
            class="wl-pick"
            @change="pick(row, $event.target.value)"
          >
            <option value="">{{ t('wantList.pickOne') }}</option>
            <option v-for="c in row.candidates.slice(0, 12)" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </span>

        <button type="button" class="wl-remove" :title="t('wantList.remove')" @click="removeRow(i)">
          <v-icon icon="mdi-close" size="14" />
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* .field-label / .field-input live in CreateAnnounceDialog's scoped styles and
   do not cross into this component, so the shared field look is restated here.
   Keep in sync with that file if the form styling changes. */
.field-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--c-muted);
}
.field-input {
  width: 100%;
  background: var(--c-surface);
  border: 1.5px solid var(--c-border);
  border-radius: 12px;
  padding: 10px 13px;
  font-size: 13.5px;
  color: var(--c-text);
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.field-input:focus {
  border-color: var(--c-trade);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-trade) 15%, transparent);
}
.field-input::placeholder { color: var(--c-muted); opacity: 0.5; font-size: 13px; }
.field-input:disabled { opacity: 0.5; cursor: not-allowed; }

.wl { display: flex; flex-direction: column; gap: 7px; }
.wl-paste { resize: vertical; min-height: 62px; font-family: inherit; }

.wl-actions { display: flex; align-items: center; gap: 8px; }
.wl-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 11px;
  border-radius: 8px;
  border: 1px solid var(--c-border);
  background: var(--c-surface-2);
  color: var(--c-text);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.wl-btn:disabled { opacity: .5; cursor: default; }
.wl-clear {
  background: none;
  border: none;
  color: var(--c-muted);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
}

.wl-summary { margin: 0; font-size: 11px; color: var(--c-muted); font-weight: 600; }

.wl-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 210px;
  overflow-y: auto;
}
.wl-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 8px;
  background: var(--c-surface-2);
}
/* Unresolved lines are saved too, so they read as "kept, unverified" rather
   than as an error. */
.wl-row--unresolved { opacity: .78; }

.wl-thumb {
  width: 22px;
  height: 32px;
  object-fit: cover;
  border-radius: 3px;
  flex-shrink: 0;
}
.wl-thumb--none {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--c-surface);
  border: 1px dashed var(--c-border);
  color: var(--c-muted);
}

.wl-qty { font-size: 11px; font-weight: 800; color: var(--c-muted); flex-shrink: 0; }
.wl-name {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--c-text);
  display: flex;
  align-items: center;
  gap: 6px;
}
.wl-pick {
  font-size: 11px;
  max-width: 150px;
  background: var(--c-surface);
  color: var(--c-text);
  border: 1px solid var(--c-border);
  border-radius: 6px;
  padding: 1px 4px;
}
.wl-remove {
  background: none;
  border: none;
  color: var(--c-muted);
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
}
.wl-remove:hover { color: var(--c-accent); }
</style>
