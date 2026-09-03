<script setup>
/**
 * One deck, and the cards between you and playing it.
 *
 * The page had the right facts and drew them as a rebuke: every card the reader
 * did not own was dimmed to 35% and stamped with a red MISSING label, so a deck
 * you had just imported was forty invisible rectangles under forty red
 * stickers. The completion bar under the title spent pink on the cards you own
 * and teal on the ones you had sourced elsewhere — teal being the colour this
 * app reserves for two people agreeing on a trade — and the type breakdown
 * below it spent all three of the system's semantic colours on Monster, Spell
 * and Trap, which are not roles but categories.
 *
 * The page is a shopping list, so it is drawn as one. Amethyst is what is
 * already in your trade pile, pink is what is headed for your wishlist, and
 * teal appears nowhere: a decklist contains no agreements (DESIGN.md, The
 * Agreement Rule). The strip under the name draws one tick per copy rather than
 * a percentage, because forty-six cards at thirteen percent is not a number
 * anybody can act on and "thirty-eight to find" is. Per copy: a deck asking for
 * three of a card you hold one of is two short, and used to read as settled.
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { useHead } from "@unhead/vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { getClient } from "@/lib/supabaseClient";
import { fetchDeck, resolveDecks } from "@/lib/decks";
import {
  allocateCopies, deckTally, missingEntries,
  computeTypeBreakdown, computeEstimatedValue,
} from "@/lib/deckStats";
import {
  decodeSourced, withSourcedCount, quantitiesOf,
  saveSourcedLocal, saveSourcedToDb,
} from "@/lib/deckIgnore";
import { iconUrl } from "@/lib/cardIcons";
import DeckTicks from "@/components/library/DeckTicks.vue";
import DeckSection from "@/components/library/DeckSection.vue";

const props = defineProps({ login: { type: Object, default: null } });
const emit = defineEmits(["requireAuth"]);

const { t, locale: i18nLocale } = useI18n();
const route = useRoute();
const locale = computed(() => route.params.locale || "en");
const userId = computed(() => props.login?.user?.id ?? null);

const loading = ref(true);
const notFound = ref(false);
const deck = ref(null);
const parsed = ref({ main: [], extra: [], side: [] });
const cardMap = ref({});
const ownedCopies = ref(new Map());
const sourcedCopies = ref(new Map());

const ctx = computed(() => ({
  cardMap: cardMap.value, ownedCopies: ownedCopies.value, sourcedCopies: sourcedCopies.value,
}));
const entries = computed(() => [...parsed.value.main, ...parsed.value.extra, ...parsed.value.side]);
const tally = computed(() => deckTally(entries.value, ctx.value));

// The copies, split across the four states, once for the whole deck.
//
// Once, because the pool is shared: a card in the main deck twice and the side
// deck once needs three copies, and one copy in the collection covers the first
// entry only. Allocating per section would hand that copy to all three. The
// sections read their slice back out by position, which is why `entries` is
// main-extra-side in that order and the slices below follow it.
const alloc = computed(() => allocateCopies(entries.value, ctx.value));
const mainAlloc = computed(() => alloc.value.slice(0, parsed.value.main.length));
const extraAlloc = computed(() => alloc.value.slice(
  parsed.value.main.length, parsed.value.main.length + parsed.value.extra.length));
const sideAlloc = computed(() => alloc.value.slice(
  parsed.value.main.length + parsed.value.extra.length));

// The shopping list, in copies outstanding rather than copies the deck asks
// for — what the button wishlists and what the estimate prices.
const stillNeeded = computed(() => missingEntries(entries.value, ctx.value));

// Stale-response guard: only the most recently issued load may commit, so a
// slower earlier fetch after a rapid id change cannot clobber a newer one.
let reqId = 0;
async function load() {
  const myId = ++reqId;
  loading.value = true;
  notFound.value = false;
  try {
    const { deck: row, marks } = await fetchDeck(route.params.deckId, userId.value);
    if (myId !== reqId) return;
    if (!row) { notFound.value = true; deck.value = null; return; }
    deck.value = row;

    const resolved = await resolveDecks([row], userId.value);
    if (myId !== reqId) return;
    parsed.value = resolved.parsed.get(row.id) ?? { main: [], extra: [], side: [] };
    cardMap.value = resolved.cardMap;
    ownedCopies.value = resolved.ownedCopies;
    // Decoded only now: a mark stored in the old whole-entry form has to be
    // read against the quantities this deck actually asks for.
    sourcedCopies.value = decodeSourced(marks, quantitiesOf(entries.value));
  } catch (err) {
    console.error("DeckDetailPage: load failed", err);
    if (myId === reqId) { notFound.value = true; toast(t("common.error"), "error"); }
  } finally {
    if (myId === reqId) loading.value = false;
  }
}

useHead(computed(() => ({
  title: deck.value ? `${deck.value.name} | NoBinder` : `${t("decks.title")} | NoBinder`,
  meta: [{ name: "robots", content: "noindex" }],
})));

// ── Type mix and what it would cost ─────────────────────────────────────────
// Achromatic on purpose. Monster, Spell and Trap are categories, not roles, and
// the old chips painted them pink, teal and amethyst — spending the entire
// semantic system on a breakdown of card types. The counts carry themselves in
// mono, next to the game's own spell and trap symbols.
const breakdown = computed(() => computeTypeBreakdown(entries.value, cardMap.value));
const typeRows = computed(() => [
  { key: "monster", label: t("search.filters.kind.monster"), n: breakdown.value.monster, icon: null },
  { key: "spell", label: t("search.filters.kind.spell"), n: breakdown.value.spell, icon: "spell" },
  { key: "trap", label: t("search.filters.kind.trap"), n: breakdown.value.trap, icon: "trap" },
].filter((row) => row.n > 0));

const deckValue = computed(() => computeEstimatedValue(entries.value, cardMap.value));
// What the cards you still need would cost, which is the number this page is
// actually about — the whole-deck total is trivia next to it.
const missingValue = computed(() => computeEstimatedValue(stillNeeded.value, cardMap.value));
const money = (v) => new Intl.NumberFormat(i18nLocale.value, { style: "currency", currency: "EUR" }).format(v);

// ── Sourced elsewhere ───────────────────────────────────────────────────────
// A count, not a flag: the tile sends how many copies should now be marked, so
// two of a three-of can be handled while the third stays on the shopping list.
// Vue does not track in-place Map mutation, so the ref is always reassigned.
function onMarkSourced({ id, count }) {
  const next = withSourcedCount(sourcedCopies.value, id, count);
  sourcedCopies.value = next;
  if (userId.value) saveSourcedToDb(getClient(), deck.value.id, next);
  else saveSourcedLocal(deck.value.id, next);
}

// ── Wishlist ────────────────────────────────────────────────────────────────
const adding = ref(false);
async function addMissing() {
  if (!userId.value) { emit("requireAuth"); return; }
  // `stillNeeded` carries the outstanding count, not the deck's count: owning
  // one of three puts two on the wishlist, where it used to put three.
  const rows = stillNeeded.value
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

  adding.value = true;
  try {
    const { data, error } = await getClient().from("Card").insert(rows).select();
    if (error) throw error;
    const n = data?.length ?? rows.length;
    toast(t("deckImport.added", { count: n }, n));
  } catch (err) {
    console.error("DeckDetailPage: addMissing failed", err);
    toast(t("common.error"), "error");
  } finally {
    adding.value = false;
  }
}

// ── Toast ───────────────────────────────────────────────────────────────────
const note = ref(null);
let noteTimer = null;
function toast(message, kind = "ok") {
  note.value = { message, kind };
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => { note.value = null; }, 3500);
}

// A card joining or leaving the collection changes what this page says, so it
// re-resolves rather than leaving a stale count on screen.
let channel = null;
function subscribe() {
  if (!userId.value) return;
  channel = getClient()
    .channel("deck-detail-owned-watch")
    .on("postgres_changes",
      { event: "*", schema: "public", table: "Card", filter: `trader=eq.${userId.value}` },
      () => { load(); })
    .subscribe();
}
function unsubscribe() { if (channel) { getClient().removeChannel(channel); channel = null; } }

onMounted(() => { load(); subscribe(); });
onBeforeUnmount(() => { unsubscribe(); clearTimeout(noteTimer); });

watch(() => route.params.deckId, load);
watch(userId, (now, before) => {
  if (now === before) return;
  unsubscribe(); load(); subscribe();
});
</script>

<template>
  <main class="dd">

    <!-- Loading: the shape of the panel, so nothing jumps. -->
    <div v-if="loading" class="dd-panel dd-panel--sk" aria-hidden="true">
      <div class="dd-sk dd-sk--name" />
      <div class="dd-sk dd-sk--strip" />
      <div class="dd-sk dd-sk--tally" />
    </div>

    <div v-else-if="notFound" class="dd-missing">
      <p class="dd-missing__title">{{ t('deckDetail.notFound') }}</p>
      <router-link class="dd-primary" :to="`/${locale}/decks`">
        <v-icon icon="mdi-arrow-left" size="16" />{{ t('decks.title') }}
      </router-link>
    </div>

    <template v-else-if="deck">
      <nav class="dd-crumbs" :aria-label="t('decks.title')">
        <router-link class="dd-crumb" :to="`/${locale}/decks`">{{ t('decks.title') }}</router-link>
        <span class="dd-crumb__sep" aria-hidden="true">/</span>
        <span class="dd-crumb dd-crumb--here">{{ deck.name }}</span>
      </nav>

      <!-- The deck, and what stands between you and playing it. -->
      <section class="dd-panel">
        <h1 class="dd-name">{{ deck.name }}</h1>

        <DeckTicks :tally="tally" />

        <div class="dd-acts">
          <button
            v-if="tally.missing > 0"
            type="button"
            class="dd-wish"
            :disabled="adding"
            @click="addMissing"
          >
            <v-progress-circular v-if="adding" indeterminate size="15" width="2" color="currentColor" />
            <v-icon v-else icon="mdi-heart-plus-outline" size="16" />
            {{ t('deckDetail.wishlistMissing', { n: tally.missing }) }}
          </button>
          <!-- Not a green success alert: nothing here is agreement, and the
               strip above already shows an unbroken amethyst run. -->
          <p v-else-if="tally.total > 0" class="dd-done">
            <v-icon icon="mdi-check" size="16" />{{ t('deckDetail.allOwned') }}
          </p>

          <!-- What the cards you still need would cost. The whole-deck total is
               trivia next to the number the page is actually about. -->
          <p v-if="tally.missing > 0 && missingValue > 0" class="dd-cost">
            {{ t('deckDetail.costToFinish', { value: money(missingValue) }) }}
          </p>
        </div>
      </section>

      <!-- The mix, and the whole-deck value. Achromatic: Monster, Spell and
           Trap are categories, not roles, and the chips used to spend all three
           of the system's semantic colours on them. -->
      <p v-if="typeRows.length" class="dd-mix">
        <span v-for="row in typeRows" :key="row.key" class="dd-mix__item">
          <img v-if="iconUrl(row.icon)" :src="iconUrl(row.icon)" alt="" class="dd-mix__icon" />
          {{ row.label }}
          <b class="tabular-nums">{{ row.n }}</b>
        </span>
        <span v-if="deckValue > 0" class="dd-mix__item dd-mix__item--value">
          <span class="dd-mix__sep" aria-hidden="true">·</span>
          {{ t('deckDetail.deckValue', { value: money(deckValue) }) }}
        </span>
      </p>

      <DeckSection
        :alloc="mainAlloc"
        :card-map="cardMap"
        :title="t('deckDetail.mainDeck')"
        @mark-sourced="onMarkSourced"
      />
      <DeckSection
        :alloc="extraAlloc"
        :card-map="cardMap"
        :title="t('deckDetail.extraDeck')"
        @mark-sourced="onMarkSourced"
      />
      <DeckSection
        :alloc="sideAlloc"
        :card-map="cardMap"
        :title="t('deckDetail.sideDeck')"
        @mark-sourced="onMarkSourced"
      />
    </template>

    <div v-if="note" class="dd-toast" :data-kind="note.kind" role="status">{{ note.message }}</div>
  </main>
</template>

<style scoped>
/* The landing page's token set, as every other page in this pass uses it:
   panels one tonal step under the page, hairlines a fraction of the border
   token, depth a 1px top highlight rather than a drop shadow (DESIGN.md, The
   Flat-By-Default Rule). */
.dd {
  --dk-panel: color-mix(in srgb, var(--c-surface) 94%, var(--c-bg));
  --dk-line: color-mix(in srgb, var(--c-border) 60%, transparent);
  --dk-line-soft: color-mix(in srgb, var(--c-border) 34%, transparent);
  --dk-lit: inset 0 1px 0 color-mix(in srgb, var(--c-text) 8%, transparent);
  --dk-danger: #F2555A;

  display: flex;
  flex-direction: column;
  gap: 26px;
  max-width: 1000px;
  margin: 0 auto;
  padding: 22px 0 56px;
}
@media (min-width: 768px) { .dd { padding-top: 30px; } }

/* ── Trail ────────────────────────────────────────── */
.dd-crumbs {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  margin-bottom: -12px; min-width: 0;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.7rem; font-weight: 700;
  letter-spacing: 0.14em; text-transform: uppercase;
}
.dd-crumb {
  display: inline-flex; align-items: center; min-height: 24px;
  color: var(--c-muted); text-decoration: none; transition: color 0.15s ease;
}
a.dd-crumb:hover { color: var(--c-trade); }
.dd-crumb--here { color: var(--c-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dd-crumb__sep { color: color-mix(in srgb, var(--c-muted) 72%, transparent); }
.dd-crumb:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 3px; border-radius: 4px; }

/* ── The deck ─────────────────────────────────────── */
.dd-panel {
  display: flex; flex-direction: column; gap: 18px;
  padding: 22px;
  border: 1px solid var(--dk-line);
  border-radius: 20px;
  background: var(--dk-panel);
  box-shadow: var(--dk-lit);
}
@media (min-width: 640px) { .dd-panel { padding: 26px 28px; } }

.dd-name {
  margin: 0;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: clamp(1.7rem, 4vw, 2.5rem);
  font-weight: 700; line-height: 1.05; letter-spacing: -0.035em;
  color: var(--c-text); text-wrap: balance;
}

.dd-acts { display: flex; align-items: center; flex-wrap: wrap; gap: 12px 16px; }

/* Pink, because these cards are going on a wishlist and wanting is what pink
   means in this system (DESIGN.md, The Three-Role Rule). It is the one filled
   button on the page: finishing the deck is the only thing to do here. */
.dd-wish {
  display: inline-flex; align-items: center; gap: 8px;
  min-height: 44px; padding: 0 20px; border-radius: 999px;
  background: var(--c-accent); color: var(--c-on-accent);
  font-size: 0.85rem; font-weight: 700; cursor: pointer;
  transition: filter 0.15s ease;
}
.dd-wish .v-icon { color: var(--c-on-accent); }
.dd-wish:hover:not(:disabled) { filter: brightness(1.08); }
.dd-wish:disabled { opacity: 0.55; pointer-events: none; }

.dd-done {
  display: inline-flex; align-items: center; gap: 8px; margin: 0;
  font-size: 0.85rem; font-weight: 700; color: var(--c-trade);
}
.dd-done .v-icon { color: currentColor; }

.dd-cost {
  margin: 0;
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.74rem; font-weight: 700;
  letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--c-muted);
}

/* ── The mix ──────────────────────────────────────── */
.dd-mix {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px 18px;
  margin: -8px 0 0;
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.72rem; font-weight: 700;
  letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--c-muted);
}
.dd-mix__item { display: inline-flex; align-items: center; gap: 7px; }
.dd-mix__item b { color: var(--c-text); font-weight: 700; }
.dd-mix__icon { width: 14px; height: 14px; object-fit: contain; }
.dd-mix__sep { color: color-mix(in srgb, var(--c-muted) 72%, transparent); }

/* ── Not found ────────────────────────────────────── */
.dd-missing { display: flex; flex-direction: column; align-items: flex-start; gap: 16px; padding: 64px 4px; }
.dd-missing__title {
  margin: 0;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: clamp(1.4rem, 3.4vw, 2rem);
  font-weight: 700; letter-spacing: -0.03em; color: var(--c-text);
}
.dd-primary {
  display: inline-flex; align-items: center; gap: 8px;
  min-height: 44px; padding: 0 20px; border-radius: 999px;
  background: var(--c-trade); color: var(--c-on-accent);
  font-size: 0.85rem; font-weight: 700; text-decoration: none; cursor: pointer;
  transition: filter 0.15s ease;
}
.dd-primary .v-icon { color: var(--c-on-accent); }
.dd-primary:hover { filter: brightness(1.08); }

/* ── Loading ──────────────────────────────────────── */
.dd-panel--sk { animation: dd-pulse 1.6s ease-in-out infinite; }
.dd-sk { border-radius: 8px; background: var(--c-skeleton); }
.dd-sk--name { height: 38px; width: 54%; }
.dd-sk--strip { height: 14px; width: 100%; }
.dd-sk--tally { height: 12px; width: 46%; }
@keyframes dd-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
@media (prefers-reduced-motion: reduce) { .dd-panel--sk { animation: none; } }

/* ── Toast ────────────────────────────────────────── */
.dd-toast {
  position: fixed; right: 20px; bottom: 20px; z-index: 50;
  max-width: min(380px, calc(100vw - 40px));
  padding: 13px 18px; border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--c-accent) 40%, transparent);
  background: var(--c-surface);
  box-shadow: var(--dk-lit), 0 14px 40px color-mix(in srgb, var(--c-accent) 20%, transparent);
  color: var(--c-text); font-size: 0.85rem; font-weight: 600;
}
.dd-toast[data-kind="error"] {
  border-color: color-mix(in srgb, var(--dk-danger) 45%, transparent);
  box-shadow: var(--dk-lit), 0 14px 40px color-mix(in srgb, var(--dk-danger) 20%, transparent);
  color: var(--dk-danger);
}

.dd-wish:focus-visible,
.dd-primary:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }
</style>
