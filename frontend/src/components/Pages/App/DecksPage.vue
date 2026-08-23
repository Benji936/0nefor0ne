<script setup>
/**
 * Your decks, and how far each one is from playable.
 *
 * The page used to be a list of names. Every deck's counts, its completion bar
 * and its percentage sat behind `v-if="deckStats[deck.id]"`, and nothing filled
 * that until you expanded the deck's accordion panel — so the rows showed a
 * name and a blank line, and the "Sort by missing" control above them ordered
 * the list by a number that did not exist yet, which meant it did nothing at
 * all. Expanding a panel then rendered the whole decklist, the same view
 * `/decks/:id` already renders, from a second forty-line copy of the same
 * parse-fetch-diff.
 *
 * So the accordion is gone, the stats are resolved for every deck at once —
 * one card lookup and one ownership query for the whole page, which is fewer
 * requests than the old one-per-panel — and each deck is a row carrying the
 * thing the page exists to say: one tick per card, amethyst for the ones in
 * your trade pile and pink for the ones still to find.
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { useHead } from "@unhead/vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { getClient } from "@/lib/supabaseClient";
import {
  fetchDecks, resolveDecks, createDeck, renameDeck, deleteDeck,
  readGuestDecks, clearGuestDecks,
} from "@/lib/decks";
import { deckTally } from "@/lib/deckStats";
import DeckTicks from "@/components/library/DeckTicks.vue";

const props = defineProps({ login: { type: Object, default: null } });
const emit = defineEmits(["requireAuth"]);

const { t } = useI18n();
const route = useRoute();
const locale = computed(() => route.params.locale || "en");
useHead({ title: computed(() => `${t("decks.title")} — One for One`), meta: [{ name: "robots", content: "noindex" }] });

const userId = computed(() => props.login?.user?.id ?? null);
const isGuest = computed(() => !userId.value);

const loading = ref(true);
const decks = ref([]);
const ignoredByDeck = ref({});
const cardMap = ref({});
const ownedIds = ref(new Set());
const parsedByDeck = ref(new Map());

// ── Load ────────────────────────────────────────────────────────────────────
// One request for every deck's cards and one for the collection, rather than a
// pair per deck as its panel opened.
let reqId = 0;
async function load() {
  const myId = ++reqId;
  loading.value = true;
  try {
    const { decks: rows, ignoredByDeck: ignored } = await fetchDecks(userId.value);
    if (myId !== reqId) return;
    decks.value = rows;
    ignoredByDeck.value = ignored;

    const resolved = await resolveDecks(rows, userId.value);
    if (myId !== reqId) return;
    parsedByDeck.value = resolved.parsed;
    cardMap.value = resolved.cardMap;
    ownedIds.value = resolved.ownedIds;
  } catch (err) {
    console.error("DecksPage: load failed", err);
    if (myId === reqId) toast(t("common.error"), "error");
  } finally {
    if (myId === reqId) loading.value = false;
  }
}

const entriesFor = (deck) => {
  const p = parsedByDeck.value.get(deck.id);
  return p ? [...p.main, ...p.extra, ...p.side] : [];
};

const tallyFor = (deck) => deckTally(entriesFor(deck), {
  cardMap: cardMap.value,
  ownedIds: ownedIds.value,
  ignoredIds: ignoredByDeck.value[deck.id] ?? new Set(),
});

// Every card still to find, across every deck. The page's one summary, and the
// only number on it that is not about a single deck.
const shortfall = computed(() =>
  decks.value.reduce((sum, deck) => sum + tallyFor(deck).missing, 0));

// ── Order ───────────────────────────────────────────────────────────────────
// Two named orders rather than one button labelled "Sort by missing" that gave
// no clue which way it currently was.
const order = ref("missing");
const ordered = computed(() => {
  const list = [...decks.value];
  if (order.value === "missing") {
    list.sort((a, b) => tallyFor(b).missing - tallyFor(a).missing);
  }
  return list;   // otherwise newest first, which is the order they arrive in
});

// ── Import ──────────────────────────────────────────────────────────────────
const fileInput = ref(null);
const dragging = ref(false);
const importError = ref("");
const pending = ref(null);      // { name, ydkContent }
const saving = ref(false);

// The whole page is the drop target. A 140px dashed box at the top of a page
// that already has decks in it was spending the best real estate on the thing
// you do least often, and a file dropped two pixels outside it did nothing.
let dragDepth = 0;
function onDragEnter(e) { if (hasFile(e)) { dragDepth++; dragging.value = true; } }
function onDragLeave() { if (--dragDepth <= 0) { dragDepth = 0; dragging.value = false; } }
function onDragOver(e) { if (hasFile(e)) e.preventDefault(); }
function onDrop(e) {
  dragDepth = 0; dragging.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (file) readFile(file);
}
const hasFile = (e) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

function onPick(e) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (file) readFile(file);
}

async function readFile(file) {
  importError.value = "";
  const name = file?.name ?? "";
  if (!name.toLowerCase().endsWith(".ydk")) { importError.value = t("deckImport.error"); return; }
  try {
    pending.value = { name: name.replace(/\.ydk$/i, "").slice(0, 60), ydkContent: await file.text() };
  } catch (err) {
    console.error("DecksPage: could not read the file", err);
    importError.value = t("deckImport.error");
  }
}

function cancelImport() { pending.value = null; importError.value = ""; }

async function confirmImport() {
  const name = pending.value?.name.trim().slice(0, 60);
  if (!name || saving.value) return;
  saving.value = true;
  try {
    await createDeck({ userId: userId.value, name, ydkContent: pending.value.ydkContent });
    pending.value = null;
    await load();                       // resolves the new deck's cards with the rest
    toast(t("decks.imported", { name }));
  } catch (err) {
    console.error("DecksPage: import failed", err);
    importError.value = t("deckImport.error");
  } finally {
    saving.value = false;
  }
}

// ── Rename ──────────────────────────────────────────────────────────────────
const renamingId = ref(null);
const renameValue = ref("");
function startRename(deck) { renamingId.value = deck.id; renameValue.value = deck.name; }
function cancelRename() { renamingId.value = null; renameValue.value = ""; }
async function confirmRename(deck) {
  const name = renameValue.value.trim().slice(0, 60);
  if (!name) { cancelRename(); return; }
  try {
    await renameDeck(deck.id, name, userId.value);
    const found = decks.value.find((d) => d.id === deck.id);
    if (found) found.name = name;
  } catch (err) {
    console.error("DecksPage: rename failed", err);
    toast(t("common.error"), "error");
  } finally {
    cancelRename();
  }
}

// ── Delete ──────────────────────────────────────────────────────────────────
const pendingDelete = ref(null);
const deleting = ref(false);
async function confirmDelete() {
  const deck = pendingDelete.value;
  if (!deck) return;
  deleting.value = true;
  try {
    await deleteDeck(deck.id, userId.value);
    decks.value = decks.value.filter((d) => d.id !== deck.id);
  } catch (err) {
    console.error("DecksPage: delete failed", err);
    toast(t("common.error"), "error");
  } finally {
    deleting.value = false;
    pendingDelete.value = null;
  }
}

// ── Wishlist ────────────────────────────────────────────────────────────────
const addingId = ref(null);
async function addMissing(deck) {
  if (!userId.value) { emit("requireAuth"); return; }
  const ignored = ignoredByDeck.value[deck.id] ?? new Set();
  const rows = entriesFor(deck)
    .filter((e) => cardMap.value[e.id] && !ownedIds.value.has(e.id) && !ignored.has(e.id))
    .map((entry) => {
      const card = cardMap.value[entry.id];
      const name = card.name_en ?? card.name;
      return {
        wish: true, game: "YGO",
        url: "https://db.ygoprodeck.com/api/v7/cardinfo.php?name=" + name,
        name, extension: "", rarity: "common", quantity: entry.qty,
        trader: userId.value, image_id: card.id,
        language: "English", condition: "Near Mint", first_edition: false,
      };
    });
  if (!rows.length) return;

  addingId.value = deck.id;
  try {
    const { data, error } = await getClient().from("Card").insert(rows).select();
    if (error) throw error;
    const n = data?.length ?? rows.length;
    toast(t("deckImport.added", { count: n }, n));
  } catch (err) {
    console.error("DecksPage: addMissing failed", err);
    toast(t("common.error"), "error");
  } finally {
    addingId.value = null;
  }
}

// ── Guest → account migration ───────────────────────────────────────────────
const migration = ref(0);
const migrating = ref(false);
function checkMigration() {
  if (isGuest.value) { migration.value = 0; return; }
  migration.value = readGuestDecks().length;
}

async function saveMigration() {
  if (!userId.value) { discardMigration(); return; }
  migrating.value = true;
  let failed = 0;
  try {
    for (const deck of readGuestDecks()) {
      try { await createDeck({ userId: userId.value, name: deck.name, ydkContent: deck.ydkContent }); }
      catch (err) { failed++; console.error("DecksPage: could not migrate", deck.name, err); }
    }
  } finally {
    clearGuestDecks();
    migration.value = 0;
    migrating.value = false;
  }
  await load();
  if (failed > 0) toast(t("decks.migratePartialFail", { errors: failed }), "error");
  else toast(t("decks.migrated"));
}

function discardMigration() { clearGuestDecks(); migration.value = 0; }

// ── Toast ───────────────────────────────────────────────────────────────────
// A plain element on the page rather than a v-snackbar: the snackbar was being
// handed color: "var(--c-accent)", which is a CSS value where Vuetify wants a
// theme colour name, and it teleports out of scope so nothing could style it
// back onto the palette.
const note = ref(null);
let noteTimer = null;
function toast(message, kind = "ok") {
  note.value = { message, kind };
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => { note.value = null; }, 3500);
}

// A card leaving or joining the collection changes every deck on the page, so
// the whole set is re-resolved rather than only the one that happened to be open.
let channel = null;
function subscribe() {
  if (!userId.value) return;
  channel = getClient()
    .channel("decks-page-owned-watch")
    .on("postgres_changes",
      { event: "*", schema: "public", table: "Card", filter: `trader=eq.${userId.value}` },
      () => { load(); })
    .subscribe();
}
function unsubscribe() {
  if (channel) { getClient().removeChannel(channel); channel = null; }
}

onMounted(async () => { await load(); checkMigration(); subscribe(); });
onBeforeUnmount(() => { unsubscribe(); clearTimeout(noteTimer); });

// Signing in mid-session swaps which store the decks come from.
watch(userId, (now, before) => {
  if (now === before) return;
  unsubscribe();
  load().then(checkMigration);
  subscribe();
});
</script>

<template>
  <!-- The page is the drop target. A dashed 140px box at the top was spending
       the best space on the thing you do least often, and a file let go two
       pixels outside it did nothing at all. -->
  <main
    class="dk"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <header class="dk-head">
      <div class="dk-head__text">
        <h1 class="dk-title">{{ t('decks.title') }}</h1>
        <!-- The one summary the page owes: how many decks, and how many cards
             short across all of them. Held back until the counts are real, so
             it never flashes "0 cards to find" over a deck it has not read. -->
        <p v-if="!loading && decks.length" class="dk-summary">
          {{ t('decks.summaryDecks', { n: decks.length }, decks.length) }}
          <span class="dk-summary__sep" aria-hidden="true">·</span>
          <span :class="{ 'dk-summary__short': shortfall > 0 }">
            {{ t('decks.summaryCards', { n: shortfall }, shortfall) }}
          </span>
        </p>
      </div>
      <button
        v-if="loading || decks.length > 0"
        type="button"
        class="dk-import"
        @click="fileInput?.click()"
      >
        <v-icon icon="mdi-tray-arrow-up" size="16" />
        {{ t('decks.importButton') }}
      </button>
      <input ref="fileInput" type="file" accept=".ydk" class="dk-hide" @change="onPick" />
    </header>

    <!-- Saved where, and what to do about it. A line, not a blue alert box. -->
    <p v-if="isGuest && decks.length > 0" class="dk-note-line">
      <v-icon icon="mdi-laptop" size="14" />
      {{ t('decks.guestBanner') }}
    </p>

    <p v-if="importError" class="dk-error" role="alert">
      <v-icon icon="mdi-alert-circle-outline" size="15" />{{ importError }}
    </p>

    <!-- Name it before it is saved. -->
    <div v-if="pending" class="dk-panel dk-panel--ask">
      <label class="dk-field">
        <span class="dk-field__label">{{ t('decks.confirmName') }}</span>
        <input
          v-model="pending.name"
          class="dk-input"
          maxlength="60"
          autofocus
          @keyup.enter="confirmImport"
          @keyup.esc="cancelImport"
        />
      </label>
      <div class="dk-panel__acts">
        <button type="button" class="dk-ghost" :disabled="saving" @click="cancelImport">
          {{ t('common.close') }}
        </button>
        <button
          type="button"
          class="dk-primary"
          :disabled="saving || !pending.name.trim()"
          @click="confirmImport"
        >
          <v-progress-circular v-if="saving" indeterminate size="15" width="2" color="currentColor" />
          {{ t('decks.confirmImport') }}
        </button>
      </div>
    </div>

    <!-- Decks left behind in this browser after signing in. -->
    <div v-if="migration > 0" class="dk-panel dk-panel--ask">
      <p class="dk-panel__text">{{ t('decks.migratePrompt', { count: migration }) }}</p>
      <div class="dk-panel__acts">
        <button type="button" class="dk-ghost" :disabled="migrating" @click="discardMigration">
          {{ t('decks.migrateDiscard') }}
        </button>
        <button type="button" class="dk-primary" :disabled="migrating" @click="saveMigration">
          <v-progress-circular v-if="migrating" indeterminate size="15" width="2" color="currentColor" />
          {{ t('decks.migrateSave') }}
        </button>
      </div>
    </div>

    <!-- Two named orders, rather than one button that gave no clue which way
         the list currently ran. -->
    <div v-if="!loading && decks.length > 1" class="dk-order" role="group" :aria-label="t('decks.orderLabel')">
      <button
        v-for="opt in [{ id: 'missing', label: t('decks.orderMissing') }, { id: 'newest', label: t('decks.orderNewest') }]"
        :key="opt.id"
        type="button"
        class="dk-order__opt"
        :class="{ 'is-on': order === opt.id }"
        :aria-pressed="order === opt.id"
        @click="order = opt.id"
      >{{ opt.label }}</button>
    </div>

    <!-- Loading: the shape of a row, so nothing jumps. -->
    <ul v-if="loading" class="dk-list" aria-hidden="true">
      <li v-for="i in 2" :key="i" class="dk-row dk-row--sk">
        <div class="dk-sk dk-sk--name" />
        <div class="dk-sk dk-sk--strip" />
        <div class="dk-sk dk-sk--tally" />
      </li>
    </ul>

    <!-- Nothing yet: the page is the invitation. -->
    <div v-else-if="!decks.length" class="dk-blank">
      <p class="dk-blank__title">{{ t('decks.emptyTitle') }}</p>
      <p class="dk-blank__body">{{ t('decks.emptyBody') }}</p>
      <button type="button" class="dk-primary" @click="fileInput?.click()">
        <v-icon icon="mdi-tray-arrow-up" size="16" />
        {{ t('decks.importButton') }}
      </button>
    </div>

    <ul v-else class="dk-list">
      <li v-for="deck in ordered" :key="deck.id" class="dk-row">
        <div class="dk-row__top">
          <template v-if="renamingId === deck.id">
            <input
              v-model="renameValue"
              class="dk-input dk-input--rename"
              maxlength="60"
              autofocus
              :aria-label="t('decks.rename')"
              @keyup.enter="confirmRename(deck)"
              @keyup.esc="cancelRename"
            />
            <button type="button" class="dk-icon" :aria-label="t('common.save')" @click="confirmRename(deck)">
              <v-icon icon="mdi-check" size="17" />
            </button>
            <button type="button" class="dk-icon" :aria-label="t('common.close')" @click="cancelRename">
              <v-icon icon="mdi-close" size="17" />
            </button>
          </template>

          <template v-else>
            <h2 class="dk-row__name">
              <router-link class="dk-row__hit" :to="`/${locale}/decks/${deck.id}`">{{ deck.name }}</router-link>
            </h2>
            <span class="dk-row__total tabular-nums">{{ tallyFor(deck).total }}</span>
            <button
              v-if="tallyFor(deck).missing > 0"
              type="button"
              class="dk-wish"
              :disabled="addingId === deck.id"
              @click="addMissing(deck)"
            >
              <v-progress-circular v-if="addingId === deck.id" indeterminate size="14" width="2" color="currentColor" />
              <v-icon v-else icon="mdi-heart-plus-outline" size="15" />
              {{ t('decks.wishlistMissing', { n: tallyFor(deck).missing }) }}
            </button>
            <button type="button" class="dk-icon" :aria-label="t('decks.rename')" @click="startRename(deck)">
              <v-icon icon="mdi-pencil-outline" size="16" />
            </button>
            <button type="button" class="dk-icon dk-icon--danger" :aria-label="t('decks.delete')" @click="pendingDelete = deck">
              <v-icon icon="mdi-trash-can-outline" size="16" />
            </button>
          </template>
        </div>

        <DeckTicks
          :entries="entriesFor(deck)"
          :card-map="cardMap"
          :owned-ids="ownedIds"
          :ignored-ids="ignoredByDeck[deck.id] ?? new Set()"
        />
      </li>
    </ul>

    <!-- Dragging a file anywhere over the page. -->
    <div v-if="dragging" class="dk-drop" aria-hidden="true">
      <span class="dk-drop__label">
        <v-icon icon="mdi-tray-arrow-down" size="20" />
        {{ t('decks.dropNow') }}
      </span>
    </div>

    <v-dialog
      :model-value="!!pendingDelete"
      max-width="420"
      @update:model-value="(open) => { if (!open) pendingDelete = null; }"
    >
      <div class="dk-modal">
        <p class="dk-modal__title">{{ t('decks.deleteConfirm') }}</p>
        <p class="dk-modal__body">{{ pendingDelete?.name }}</p>
        <div class="dk-panel__acts">
          <button type="button" class="dk-ghost" :disabled="deleting" @click="pendingDelete = null">
            {{ t('common.close') }}
          </button>
          <button type="button" class="dk-danger" :disabled="deleting" @click="confirmDelete">
            <v-progress-circular v-if="deleting" indeterminate size="15" width="2" color="currentColor" />
            {{ t('decks.delete') }}
          </button>
        </div>
      </div>
    </v-dialog>

    <div v-if="note" class="dk-toast" :data-kind="note.kind" role="status">{{ note.message }}</div>
  </main>
</template>

<style scoped>
/* Borrowed from the landing page (its --lp-* set), as the account, collection,
   matches, home, announce, directory and profile pages already do: panels sit
   one tonal step under the page rather than above it, hairlines are a fraction
   of the border token, and depth is a 1px top highlight instead of a drop
   shadow — lit from above, per DESIGN.md's Flat-By-Default Rule. */
.dk {
  --dk-panel: color-mix(in srgb, var(--c-surface) 94%, var(--c-bg));
  --dk-line: color-mix(in srgb, var(--c-border) 60%, transparent);
  --dk-line-soft: color-mix(in srgb, var(--c-border) 34%, transparent);
  --dk-lit: inset 0 1px 0 color-mix(in srgb, var(--c-text) 8%, transparent);
  --dk-danger: #F2555A;

  position: relative;
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 1000px;
  margin: 0 auto;
  padding: 22px 0 56px;
}
@media (min-width: 768px) { .dk { padding-top: 30px; } }

.dk-hide { display: none; }

/* ── Header ───────────────────────────────────────── */
.dk-head { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.dk-head__text { display: flex; flex-direction: column; gap: 9px; margin-right: auto; min-width: 0; }

/* The collector's register — monospace, uppercase, widely tracked (DESIGN.md,
   The Mono Identifier Rule) — matching every other page in this pass. */
.dk-summary {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: 0 8px;
  margin: 0;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.72rem; font-weight: 700;
  letter-spacing: 0.14em; text-transform: uppercase;
  font-variant-numeric: tabular-nums;
  color: var(--c-muted);
}
.dk-summary__sep { color: color-mix(in srgb, var(--c-muted) 72%, transparent); }
/* Pink once there is a shortfall, because those cards are a wishlist waiting to
   happen — and plain muted at zero, where there is nothing to want. */
.dk-summary__short { color: var(--c-accent); }
.dk-title {
  margin: 0;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: clamp(1.75rem, 4vw, 2.6rem);
  font-weight: 700; line-height: 1.04; letter-spacing: -0.035em;
  color: var(--c-text);
}

.dk-import {
  display: inline-flex; align-items: center; gap: 7px;
  min-height: 40px; padding: 0 17px; border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--c-trade) 45%, transparent);
  background: transparent; color: var(--c-trade);
  font-size: 0.8rem; font-weight: 700; cursor: pointer;
  transition: background 0.15s ease;
}
.dk-import:hover { background: color-mix(in srgb, var(--c-trade) 12%, transparent); }
.dk-import .v-icon { color: currentColor; }

.dk-note-line {
  display: flex; align-items: center; gap: 8px;
  margin: -6px 0 0;
  font-size: 0.8rem; color: var(--c-muted);
}
.dk-note-line .v-icon { color: var(--c-muted); flex-shrink: 0; }

.dk-error {
  display: flex; align-items: center; gap: 8px; margin: 0;
  padding: 11px 15px; border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--dk-danger) 40%, transparent);
  background: color-mix(in srgb, var(--dk-danger) 10%, transparent);
  color: var(--dk-danger); font-size: 0.82rem; font-weight: 600;
}
.dk-error .v-icon { color: currentColor; }

/* ── Ask panels (name this import / keep these decks) ── */
.dk-panel {
  display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap;
  padding: 16px 18px;
  border: 1px solid var(--dk-line);
  border-radius: 18px;
  background: var(--dk-panel);
  box-shadow: var(--dk-lit);
}
.dk-panel__text { margin: 0; flex: 1 1 240px; font-size: 0.875rem; color: var(--c-text); line-height: 1.5; }
.dk-panel__acts { display: flex; align-items: center; gap: 10px; margin-left: auto; }
.dk-field { display: flex; flex-direction: column; gap: 6px; flex: 1 1 240px; min-width: 0; }
.dk-field__label {
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.66rem; font-weight: 700;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--c-muted);
}

.dk-input {
  width: 100%; min-height: 40px;
  padding: 9px 13px; border-radius: 11px;
  border: 1px solid var(--dk-line);
  background: color-mix(in srgb, var(--c-bg) 55%, var(--c-surface));
  color: var(--c-text); font-family: inherit;
  font-size: 0.88rem; font-weight: 600;
  outline: none; transition: border-color 0.15s ease;
}
.dk-input:focus { border-color: var(--c-trade); }
.dk-input--rename {
  flex: 1 1 200px;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: 1rem; font-weight: 700; letter-spacing: -0.02em;
}

/* ── Buttons ──────────────────────────────────────── */
.dk-primary {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 42px; padding: 0 20px; border-radius: 999px;
  background: var(--c-trade); color: var(--c-on-accent);
  font-size: 0.82rem; font-weight: 700; cursor: pointer;
  transition: filter 0.15s ease;
}
.dk-primary .v-icon { color: var(--c-on-accent); }
.dk-primary:hover:not(:disabled) { filter: brightness(1.08); }
.dk-primary:disabled { opacity: 0.5; pointer-events: none; }

.dk-ghost {
  min-height: 42px; padding: 0 15px; border-radius: 999px;
  background: transparent; color: var(--c-muted);
  font-size: 0.82rem; font-weight: 600; cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.dk-ghost:hover { background: var(--c-surface-2); color: var(--c-text); }
.dk-ghost:disabled { opacity: 0.5; pointer-events: none; }

.dk-danger {
  display: inline-flex; align-items: center; gap: 8px;
  min-height: 42px; padding: 0 20px; border-radius: 999px;
  background: var(--dk-danger); color: var(--c-on-accent);
  font-size: 0.82rem; font-weight: 700; cursor: pointer;
  transition: filter 0.15s ease;
}
.dk-danger:hover:not(:disabled) { filter: brightness(1.06); }
.dk-danger:disabled { opacity: 0.5; pointer-events: none; }

/* ── Order ────────────────────────────────────────── */
.dk-order { display: flex; align-items: center; gap: 8px; }
.dk-order__opt {
  padding: 7px 14px; border-radius: 999px;
  border: 1px solid var(--dk-line-soft);
  background: transparent; color: var(--c-muted);
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.66rem; font-weight: 700;
  letter-spacing: 0.12em; text-transform: uppercase;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}
.dk-order__opt:hover { color: var(--c-text); border-color: var(--dk-line); }
/* Amethyst for the lit one, because choosing an order is something the reader
   did — never teal, which is the agreement chain's alone. */
.dk-order__opt.is-on {
  color: var(--c-trade);
  border-color: color-mix(in srgb, var(--c-trade) 45%, transparent);
  background: color-mix(in srgb, var(--c-trade) 13%, transparent);
}

/* ── The list ─────────────────────────────────────── */
.dk-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }

.dk-row {
  position: relative;
  display: flex; flex-direction: column; gap: 13px;
  padding: 17px 19px;
  border: 1px solid var(--dk-line);
  border-radius: 18px;
  background: var(--dk-panel);
  box-shadow: var(--dk-lit);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
/* Amethyst glow, never a black drop shadow (DESIGN.md, The Flat-By-Default
   Rule). */
.dk-row:hover {
  border-color: color-mix(in srgb, var(--c-trade) 55%, transparent);
  box-shadow: var(--dk-lit), 0 12px 30px color-mix(in srgb, var(--c-trade) 16%, transparent);
}

.dk-row__top { display: flex; align-items: center; gap: 10px; min-width: 0; }
.dk-row__name {
  margin: 0; min-width: 0; margin-right: auto;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: 1.05rem; font-weight: 700; letter-spacing: -0.02em;
  color: var(--c-text);
}
/* One real link, stretched over the row, with the buttons lifted above it —
   rather than a row of controls nested inside an anchor, which is invalid and
   reads to a keyboard as one confusing stop. */
.dk-row__hit {
  color: inherit; text-decoration: none;
  display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dk-row__hit::after { content: ""; position: absolute; inset: 0; border-radius: inherit; }
.dk-row__hit:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 3px; border-radius: 4px; }

/* How big the deck is, in the register the app reads identifiers in. Forty and
   sixty and fifteen are the numbers a decklist is read by. */
.dk-row__total {
  flex-shrink: 0;
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.74rem; font-weight: 700; color: var(--c-muted);
}

/* Pink, because these cards are going on a wishlist and wanting is what pink
   means here (DESIGN.md, The Three-Role Rule). */
.dk-wish {
  position: relative; z-index: 1;
  display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0;
  min-height: 34px; padding: 0 14px; border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--c-accent) 45%, transparent);
  background: transparent; color: var(--c-accent);
  font-size: 0.76rem; font-weight: 700; cursor: pointer;
  transition: background 0.15s ease;
}
.dk-wish:hover:not(:disabled) { background: color-mix(in srgb, var(--c-accent) 13%, transparent); }
.dk-wish:disabled { opacity: 0.55; pointer-events: none; }
.dk-wish .v-icon { color: currentColor; }

.dk-icon {
  position: relative; z-index: 1;
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
  width: 34px; height: 34px; border-radius: 999px;
  background: transparent; color: var(--c-muted); cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.dk-icon:hover { background: var(--c-surface-2); color: var(--c-text); }
.dk-icon--danger:hover { background: color-mix(in srgb, var(--dk-danger) 14%, transparent); color: var(--dk-danger); }

/* ── Blank ────────────────────────────────────────── */
.dk-blank {
  display: flex; flex-direction: column; align-items: flex-start; gap: 12px;
  padding: 44px 24px 48px;
  border: 1px dashed var(--dk-line);
  border-radius: 20px;
  background: var(--dk-panel);
}
.dk-blank__title {
  margin: 0;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: clamp(1.2rem, 3vw, 1.6rem);
  font-weight: 700; letter-spacing: -0.025em; color: var(--c-text);
}
.dk-blank__body { margin: 0 0 6px; font-size: 0.9rem; line-height: 1.6; color: var(--c-muted); max-width: 52ch; }

/* ── Loading ──────────────────────────────────────── */
.dk-row--sk { pointer-events: none; animation: dk-pulse 1.6s ease-in-out infinite; }
.dk-sk { border-radius: 7px; background: var(--c-skeleton); }
.dk-sk--name { height: 20px; width: 42%; }
.dk-sk--strip { height: 14px; width: 100%; }
.dk-sk--tally { height: 11px; width: 58%; }
@keyframes dk-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
@media (prefers-reduced-motion: reduce) { .dk-row--sk { animation: none; } }

/* ── Drop overlay ─────────────────────────────────── */
.dk-drop {
  position: fixed; inset: 0; z-index: 40;
  display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--c-bg) 82%, transparent);
  backdrop-filter: blur(3px);
  pointer-events: none;
}
.dk-drop__label {
  display: inline-flex; align-items: center; gap: 11px;
  padding: 20px 30px; border-radius: 18px;
  border: 2px dashed var(--c-trade);
  background: var(--dk-panel);
  color: var(--c-trade);
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: 1.05rem; font-weight: 700; letter-spacing: -0.02em;
}
.dk-drop__label .v-icon { color: currentColor; }

/* ── Modal (inside Vuetify's dialog, which handles the focus trap) ── */
.dk-modal {
  display: flex; flex-direction: column; gap: 8px;
  padding: 22px 24px 20px;
  border: 1px solid var(--dk-line);
  border-radius: 20px;
  background: var(--c-surface);
  box-shadow: var(--dk-lit);
}
.dk-modal__title {
  margin: 0;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: 1.15rem; font-weight: 700; letter-spacing: -0.02em; color: var(--c-text);
}
.dk-modal__body { margin: 0 0 10px; font-size: 0.875rem; color: var(--c-muted); }

/* ── Toast ────────────────────────────────────────── */
.dk-toast {
  position: fixed; right: 20px; bottom: 20px; z-index: 50;
  max-width: min(380px, calc(100vw - 40px));
  padding: 13px 18px; border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--c-trade) 40%, transparent);
  background: var(--c-surface);
  box-shadow: var(--dk-lit), 0 14px 40px color-mix(in srgb, var(--c-trade) 20%, transparent);
  color: var(--c-text); font-size: 0.85rem; font-weight: 600;
}
.dk-toast[data-kind="error"] {
  border-color: color-mix(in srgb, var(--dk-danger) 45%, transparent);
  box-shadow: var(--dk-lit), 0 14px 40px color-mix(in srgb, var(--dk-danger) 20%, transparent);
  color: var(--dk-danger);
}

/* ── Shared focus ring ────────────────────────────── */
.dk-import:focus-visible,
.dk-primary:focus-visible,
.dk-ghost:focus-visible,
.dk-danger:focus-visible,
.dk-order__opt:focus-visible,
.dk-wish:focus-visible,
.dk-icon:focus-visible,
.dk-input:focus-visible {
  outline: 2px solid var(--c-trade);
  outline-offset: 2px;
}
</style>
