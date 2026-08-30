<script setup>
// Somebody's cards, in a binder.
//
// This replaces two things that had drifted apart: the read-only wall of
// thumbnails on a trader's profile, and the checkbox list inside the proposal
// dialog. They were the same question asked twice -- "what does this person
// have, and which of it do I want" -- so they are one component now, and a fix
// to either lands on both.
//
// The binder is paged rather than scrolled, opened to a facing spread of two
// nine-pocket pages. Filtering is client-side on purpose: the whole pile
// already arrives in one query, so a round trip per keystroke would be slower
// and would break while offline. If piles ever outgrow that, the swap is to
// server-side search here and nowhere else.
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import { cardImage } from "@/lib/cardImage";
import CardPrice from "@/components/trade/CardPrice.vue";
import BinderControls from "@/components/trade/BinderControls.vue";
import { applyFilters, hasWishlistMatches, isFiltering, NO_FILTERS } from "@/lib/binderFilters";
import {
  POCKETS_PER_PAGE,
  pageCount as countPages,
  viewCount as countViews,
  clampView,
  openPages as pagesFor,
  nextView,
} from "@/lib/binderPaging";

const props = defineProps({
  cards: { type: Array, default: () => [] },
  // Shown when the collection itself is empty, as opposed to filtered to zero.
  emptyLabel: { type: String, default: "" },
  // Selection map, card_id -> quantity. Absent means a read-only binder.
  modelValue: { type: Object, default: null },
  // Which semantic role selection paints in: cards you would receive are
  // amethyst, cards you would give are pink. Never both in one binder.
  //
  // Null on purpose: the trader profile tints its wishlist panel by setting
  // --cb-tone in its own CSS, and an inline style here would outrank that
  // rule and repaint the wishlist amethyst. Unset means "whatever the host
  // said", which is what the profile relies on.
  tone: { type: String, default: null },      // 'trade' | 'accent' | null
  // Cards whose status is 'locked' cannot be picked; they still show.
  lockedLabel: { type: String, default: "" },
  // Whether right-click raises the market-links sheet. Opt-in, because
  // swallowing the native context menu is only defensible when the host has
  // a sheet to put in its place -- the trader profile has none.
  linksOnContext: { type: Boolean, default: false },
  // Drops the binder's own board, so a host that has already painted itself
  // as the board (the proposal dialog) does not frame a frame.
  frameless: { type: Boolean, default: false },
  // The filter set. Left unset, the binder owns it and draws its own controls;
  // the proposal dialog owns it instead and draws them in its side rail.
  filters: { type: Object, default: null },
  // Whether to draw the control bar above the pages.
  controls: { type: Boolean, default: true },
  // Which dimension the spread is measured from.
  //
  // 'height' suits a host that owns the window and wants the whole spread on
  // screen at once -- the dialog. 'width' suits a page you scroll: the binder
  // takes the column it is given and grows as tall as that makes it, which is
  // how a binder open on a desk actually behaves.
  fit: { type: String, default: "height" },   // 'height' | 'width'
  // Makes a read-only binder clickable without making it selectable: a pocket
  // becomes a button that raises `activate` with its card, and the host decides
  // what that means. The collection uses it to open the edit form on your own
  // copy. Opt-in, because a trader's profile must stay a wall you cannot press.
  activate: { type: Boolean, default: false },
  // Turns the empty pockets of a page into "put a card here" buttons. The
  // label is the opt-in as well as the accessible name: a binder nobody owns
  // has nothing to offer an empty pocket, so there is no default.
  addLabel: { type: String, default: "" },
});

const emit = defineEmits(["update:modelValue", "update:filters", "links", "activate", "add"]);

const { t } = useI18n();

const COLS = 3;
const PER_PAGE = POCKETS_PER_PAGE;

const selectable = computed(() => props.modelValue !== null);
/* Whether a pocket is a control at all — picked from, or opened. */
const pressable = computed(() => selectable.value || props.activate);
/* Whether the gaps on the last page are controls too. */
const addable = computed(() => !!props.addLabel);
const toneStyle = computed(() => {
  if (props.tone === "accent") return { "--cb-tone": "var(--c-accent)" };
  if (props.tone === "trade")  return { "--cb-tone": "var(--c-trade)" };
  return {};
});

/* ── filters ───────────────────────────────────────────────────────────
   Owned here only when nobody outside claims them. The dialog claims them
   so its rail can hold the search box while the binder holds the pages. */
const ownFilters = ref({ ...NO_FILTERS });
const activeFilters = computed({
  get: () => props.filters ?? ownFilters.value,
  set: (v) => {
    if (props.filters) emit("update:filters", v);
    else ownFilters.value = v;
  },
});

const hasWanted = computed(() => hasWishlistMatches(props.cards));
const filtered  = computed(() => applyFilters(props.cards, activeFilters.value));
const filtering = computed(() => isFiltering(activeFilters.value));

/* ── the spread ────────────────────────────────────────────────────────
   A page is always nine pockets. How many pages you can see at once is a
   question about the viewport, not about the binder, so the page count
   never changes when the dialog is resized -- only how many of them are
   open in front of you. */
const root         = ref(null);
const pagesPerView = ref(2);

const fitPages = (w) => { pagesPerView.value = w >= 720 ? 2 : 1; };

let ro = null;
onMounted(() => {
  // Measured once up front as well as observed: ResizeObserver's first
  // callback lands after paint, so a phone would otherwise open on a
  // two-page spread and reflow to one in front of the user.
  if (root.value) fitPages(root.value.clientWidth);
  if (typeof ResizeObserver === "undefined" || !root.value) return;
  ro = new ResizeObserver(([entry]) => fitPages(entry.contentRect.width));
  ro.observe(root.value);
});
onBeforeUnmount(() => { if (ro) ro.disconnect(); ro = null; });

const pageCount = computed(() => countPages(filtered.value.length));
const viewCount = computed(() => countViews(pageCount.value, pagesPerView.value));

const view = ref(0);

// Any change to the filters re-opens at the front, or the user would turn
// pages looking for results that were never hidden from this filter.
watch([activeFilters, () => props.cards.length], () => { view.value = 0; }, { deep: true });
// A narrower window folds two pages into one, which can leave you past the end.
watch(viewCount, (n) => { view.value = clampView(view.value, n); });

/** The pages open right now, each padded out to nine pockets. */
const openPages = computed(() => pagesFor(filtered.value, view.value, pagesPerView.value));

const firstOpen = computed(() => openPages.value[0]?.number ?? 1);
const lastOpen  = computed(() => openPages.value[openPages.value.length - 1]?.number ?? firstOpen.value);

/* ── the turn ──────────────────────────────────────────────────────────
   Flat, and the rings never move. The leaf travels the way you sent it,
   the next arrives from the other edge; the spine staying nailed down is
   what separates a page from a carousel. A 3D curl was tried and cut --
   it reads once, then it is a delay on every turn. */
const turnState = ref("");     // '' | 'out-left' | 'out-right' | 'in'
let turning = false;

function reducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** A frame, or a timer if frames are not coming.
 *
 *  requestAnimationFrame does not fire in a hidden or backgrounded tab. The
 *  first version cleared the `turning` lock inside a double rAF, so a tab
 *  switched away from mid-turn came back with the binder latched and every
 *  later turn silently refused. Racing a timer against the frame means the
 *  sequence always finishes, and the lock always lifts. */
function nextFrame() {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(finish);
    setTimeout(finish, 32);
  });
}

async function turn(dir) {
  if (turning) return;
  const target = nextView(view.value, viewCount.value, dir);
  if (target === null) return;

  if (reducedMotion()) { view.value = target; return; }

  turning = true;
  try {
    // The leaf leaves the way you sent it...
    turnState.value = dir > 0 ? "out-left" : "out-right";
    await wait(190);

    // ...and the next one is placed at the far edge before it travels back.
    view.value = target;
    turnState.value = dir > 0 ? "out-right" : "out-left";
    await nextTick();
    await nextFrame();
    await nextFrame();

    turnState.value = "in";
    await wait(280);
  } finally {
    turnState.value = "";
    turning = false;
  }
}

/* ── picking ───────────────────────────────────────────────────────────
   The pocket keeps the checkbox semantics the row had -- role, aria-checked,
   space and enter -- so nothing about how this is operated by keyboard or
   read by a screen reader changed when it stopped looking like a list. */
// A local mirror of the selection, because props do not update within the tick
// that emitted them. Reading props.modelValue straight back meant two picks in
// the same tick both started from the same map and the second overwrote the
// first -- three rapid clicks landed one card. The mirror is written
// synchronously, so each toggle builds on the one before it.
const local = ref({ ...(props.modelValue ?? {}) });
watch(() => props.modelValue, (v) => { local.value = { ...(v ?? {}) }; }, { deep: true });

const qty = (card) => (local.value[card.id] ?? 0);
const isPicked = (card) => qty(card) > 0;
const isLocked = (card) => card?.status === "locked";

function toggle(card) {
  // Selection and activation are exclusive: a binder is either being picked
  // from or being worked on, never both, so one click can never mean two things.
  if (props.activate && !selectable.value) {
    if (!isLocked(card)) emit("activate", card);
    return;
  }
  if (!selectable.value || isLocked(card)) return;
  local.value = { ...local.value, [card.id]: isPicked(card) ? 0 : 1 };
  emit("update:modelValue", local.value);
}

/* Arrows walk the pockets and carry you across the page break; PageUp and
   PageDown turn without moving the cursor. */
function onGridKey(ev) {
  // Empty pockets join the walk only where they are buttons; everywhere else
  // arrowing into a gap would be arrowing into nothing.
  const live = [...root.value.querySelectorAll(
    addable.value ? ".cb__pocket" : ".cb__pocket:not(.cb__pocket--empty)"
  )];
  if (ev.key === "PageDown") { ev.preventDefault(); turn(1);  return; }
  if (ev.key === "PageUp")   { ev.preventDefault(); turn(-1); return; }

  const i = live.indexOf(document.activeElement);
  if (i < 0) return;
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLS, ArrowUp: -COLS }[ev.key];
  if (!step) return;
  ev.preventDefault();
  const j = i + step;
  if (j >= 0 && j < live.length) { live[j].focus(); return; }
  turn(j < 0 ? -1 : 1);
}

/* Right-click, long-press, and the context key all raise the same request:
   the host owns the sheet, because it owns the link list. */
function onContext(ev, card) {
  if (!card || !props.linksOnContext) return;
  ev.preventDefault();
  emit("links", card);
}

function shortenRarity(rarity) {
  return rarity ? rarity.split(" ").map((w) => w[0]).join("") : "";
}

function label(card) {
  const bits = [card.name];
  if (card.extension) bits.push(card.extension);
  const base = bits.join(" · ");
  return card.condition ? `${base} (${card.condition})` : base;
}
</script>

<template>
  <div
    ref="root"
    class="cb"
    :class="{ 'cb--frameless': frameless, 'cb--fitwidth': fit === 'width', 'cb--twoup': pagesPerView > 1 }"
    :style="toneStyle"
  >
    <!-- An empty binder you can fill is still a binder, so it opens on a blank
         page of nine offered pockets rather than a sentence explaining that
         there is nothing here. Everywhere else — a trader's profile — the
         sentence is still the right answer. -->
    <p v-if="!cards.length && !addable" class="cb__empty">{{ emptyLabel }}</p>

    <template v-else>
      <!-- Controls only appear once there is enough to warrant them, and only
           when nobody outside has taken them: the proposal dialog draws its own
           in the side rail, bound to the same filter set. -->
      <BinderControls
        v-if="controls && (cards.length > PER_PAGE || hasWanted)"
        v-model="activeFilters"
        :cards="cards"
        class="cb__controls"
      />

      <!-- Live so a screen reader hears the result count change as you type,
           rather than typing into silence. -->
      <p v-if="controls && (cards.length > PER_PAGE || hasWanted)" class="cb__count" role="status" aria-live="polite">
        {{ t('traderProfile.binderCount', { count: filtered.length }, filtered.length) }}
      </p>

      <!-- A filter that matches nothing still says so: the gap is the filter's
           doing, and offering to add a card would answer a question nobody
           asked. -->
      <p v-if="!filtered.length && (filtering || !addable)" class="cb__empty">
        {{ filtering ? t('traderProfile.binderNoResults') : emptyLabel }}
      </p>

      <template v-else>
        <!-- The binder itself: rings down the hinge, then the open pages. -->
        <div class="cb__binder" :class="{ 'cb__binder--spread': openPages.length > 1 }">
          <!-- A box that shrink-wraps the open spread, so "the edge of the page"
               is a real coordinate rather than an estimate. The arrows hang on
               its edges and the hinge sits in its middle; neither is inside the
               element the turn animates, so the spine and the controls stay put
               while the leaf travels. -->
          <div class="cb__spread">
            <!-- The hinge only exists with two pages open. With one, the page's
                 left edge is where the prev arrow goes, and two things cannot
                 both own that line. -->
            <div v-if="openPages.length > 1" class="cb__rings" aria-hidden="true">
              <span v-for="i in 7" :key="i" class="cb__ring" />
            </div>

            <!-- Centred on the borderline, half on the page and half off it,
                 so the target sits exactly where the page edge is. -->
            <button
              v-if="viewCount > 1"
              type="button" class="cb__turnbtn cb__turnbtn--prev"
              :disabled="view === 0"
              :aria-label="t('traderProfile.binderPrevPage')"
              @click="turn(-1)"
            ><v-icon icon="mdi-chevron-left" size="22" /></button>
            <button
              v-if="viewCount > 1"
              type="button" class="cb__turnbtn cb__turnbtn--next"
              :disabled="view >= viewCount - 1"
              :aria-label="t('traderProfile.binderNextPage')"
              @click="turn(1)"
            ><v-icon icon="mdi-chevron-right" size="22" /></button>

            <div class="cb__leaf">
              <div
                class="cb__pages"
                :data-turn="turnState || null"
                role="group"
                :aria-label="t('traderProfile.binderPagesOf', { first: firstOpen, last: lastOpen, total: pageCount })"
                @keydown="onGridKey"
              >
                <div v-for="page in openPages" :key="page.number" class="cb__page">
                  <div class="cb__grid">
                      <component
                        :is="(card ? pressable : addable) ? 'button' : 'div'"
                        v-for="(card, i) in page.pockets"
                        :key="card ? card.id : `empty-${page.number}-${i}`"
                        :type="(card ? pressable : addable) ? 'button' : null"
                        class="cb__pocket"
                        :class="{
                          'cb__pocket--empty': !card,
                          'cb__pocket--add': !card && addable,
                          'cb__pocket--wanted': card && card.matchesMyWishlist,
                          'cb__pocket--picked': card && isPicked(card),
                          'cb__pocket--locked': card && isLocked(card),
                        }"
                        :role="card && selectable ? 'checkbox' : null"
                        :aria-checked="card && selectable ? String(isPicked(card)) : null"
                        :aria-disabled="card && isLocked(card) ? 'true' : null"
                        :aria-hidden="!card && !addable ? 'true' : null"
                        :aria-label="card ? label(card) : (addable ? addLabel : null)"
                        :tabindex="card && pressable && isLocked(card) ? -1 : null"
                        @click="card ? toggle(card) : (addable && emit('add'))"
                        @keydown.space.prevent="card ? toggle(card) : (addable && emit('add'))"
                        @keydown.enter="card ? toggle(card) : (addable && emit('add'))"
                        @contextmenu="onContext($event, card)"
                      >
                        <!-- A gap on the last page is where the next card goes,
                             so in your own binder it says so. Quiet until the
                             pocket is under the pointer: nine of these lit at
                             once would read as nine pending actions. -->
                        <span v-if="!card && addable" class="cb__add" aria-hidden="true">+</span>

                        <template v-if="card">
                          <img
                            :src="cardImage(card.image_id)"
                            :alt="card.name"
                            class="cb__art"
                            loading="lazy"
                            decoding="async"
                          />
                          <span class="cb__sheen" aria-hidden="true" />

                          <!-- The lip. Name and price stay legible without hover,
                               because a binder you are shopping from is read on a
                               touch screen as often as with a mouse. -->
                          <span class="cb__lip">
                            <span class="cb__lipcode mono">{{ [card.extension, shortenRarity(card.rarity)].filter(Boolean).join(' · ') || '—' }}</span>
                            <CardPrice v-if="card.price" :price="card.price" size="sm" class="cb__lipprice" />
                          </span>

                          <span v-if="selectable && isPicked(card)" class="cb__tick" aria-hidden="true">
                            <v-icon icon="mdi-check" size="13" />
                          </span>
                          <span v-if="card.matchesMyWishlist" class="cb__flag" :title="t('proposeDialog.onYourWishlist')">
                            <v-icon icon="mdi-star-four-points" size="10" aria-hidden="true" />
                            <span class="sr-only">{{ t('proposeDialog.onYourWishlist') }}</span>
                          </span>
                          <span v-if="isLocked(card) && lockedLabel" class="cb__locked">{{ lockedLabel }}</span>
                        </template>
                      </component>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- The page label and the leaf marks, which say how much binder
             sits either side of where you are. -->
        <p v-if="viewCount > 1" class="cb__pageno mono" role="status" aria-live="polite">
          {{ pagesPerView > 1 && firstOpen !== lastOpen
            ? t('traderProfile.binderPagesOf', { first: firstOpen, last: lastOpen, total: pageCount })
            : t('traderProfile.binderPageOf', { page: firstOpen, total: pageCount }) }}
          <span class="cb__leaves" aria-hidden="true">
            <span
              v-for="i in viewCount" :key="i"
              class="cb__leafmark"
              :class="{ 'cb__leafmark--here': i - 1 === view }"
            />
          </span>
        </p>

      </template>
    </template>
  </div>
</template>

<style scoped>
/* --cb-tone is the one colour this component spends, and the host sets it:
   cards you could receive are amethyst, cards you would give are pink. Read
   through a fallback at every use rather than declared with a default on .cb
   -- a declaration here would win over a value inherited from the host, and
   a wishlist panel could never tint anything. */
.cb { display: flex; flex-direction: column; min-height: 0; }

.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
.mono { font-family: ui-monospace, SFMono-Regular, "Cascadia Code", Menlo, monospace; }

/* ── controls ──────────────────────────────────────────────────────── */
/* The control bar's own styling lives in BinderControls.vue. */
.cb__controls { margin-bottom: 12px; }

.cb__count {
  margin: 0 0 12px; font-size: 12.5px; font-weight: 600; color: var(--c-muted);
  font-variant-numeric: tabular-nums;
}

/* ── the binder ────────────────────────────────────────────────────────
   The board, the hinge and the pockets are the three places this component
   spends depth. DESIGN.md's Flat-By-Default Rule governs UI surfaces --
   panels, cards, rows -- and this is a depicted object rather than a panel,
   so the pocket carries an inset. Nothing outside .cb does. */
/* The board fills the height it is given and the pockets divide it, rather
   than the pockets setting a height and the board growing past the screen. A
   spread is meant to be a spread: everything on it visible at once, however
   many cards the pile holds. Height is the host's to give: the dialog hands
   over what is left of the window, the profile names one below. */
.cb__binder {
  position: relative;
  flex: 1; min-height: 0; min-width: 0;
  /* Hugs the spread rather than stretching. A full-bleed board with a small
     spread floating in the middle of it reads as a box the binder is sitting
     in; the binder is meant to be the object you are looking at, not the
     contents of a panel. */
  width: fit-content; max-width: 100%; margin-inline: auto;
  display: flex; align-items: stretch; justify-content: center;
  background: var(--c-board);
  border: 1px solid var(--tpb-line, var(--c-border));
  border-radius: 14px;
  /* Room for the arrows, which hang half outside the spread. */
  padding: 10px 26px;
}
.cb--frameless .cb__binder {
  background: none; border: none; border-radius: 0; padding: 4px 26px;
}

/* Shrink-wraps the open spread. Width comes from the pages, which take theirs
   from the row height and the card's ratio -- so this box's edges are the page
   edges, which is what the arrows and the hinge are positioned against. */
.cb__spread {
  position: relative;
  height: 100%; min-width: 0; max-width: 100%;
  display: flex;
}

.cb__rings {
  position: absolute; top: 8px; bottom: 8px;
  left: 50%; transform: translateX(-50%);
  width: 26px; z-index: 3;
  display: flex; flex-direction: column;
  align-items: center; justify-content: space-around;
  padding: 12px 0;
  pointer-events: none;
}
.cb__ring {
  width: 14px; height: 9px;
  border: 1.5px solid var(--tpb-line, var(--c-border));
  border-radius: 999px;
  background: var(--c-board);
}

.cb__leaf { flex: 1; min-width: 0; min-height: 0; overflow: hidden; }

.cb__pages {
  display: flex; gap: 0; height: 100%; min-height: 0;
  justify-content: center;
  transition: transform 0.19s cubic-bezier(0.4, 0, 1, 1), opacity 0.19s ease-out;
}
.cb__pages[data-turn="out-left"]  { transform: translateX(-26px); opacity: 0; }
.cb__pages[data-turn="out-right"] { transform: translateX(26px);  opacity: 0; }
.cb__pages[data-turn="in"] {
  transform: translateX(0); opacity: 1;
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease-in;
}

/* A page is as wide as the nine pockets on it, not as wide as the window.
   Sizing it 1fr stretched the columns and left the cards floating in gutters;
   taking the width from the height through the card's own ratio keeps the
   spread tight and pushes the slack to the outside, where it belongs.
   max-width lets a tall, narrow window fall back to width-driven sizing. */
.cb__page {
  flex: 0 1 auto; min-width: 0; min-height: 0;
  height: 100%; width: auto; max-width: 100%;
  aspect-ratio: 177 / 258;
  display: flex; flex-direction: column;
  background: var(--c-page);
  border: 1px solid var(--tpb-line, var(--c-border));
  border-radius: 10px;
  padding: 10px;
}
/* The gutter between two open pages is the channel the hinge runs down, so
   it is wide enough for the rings rather than a decorative gap. */
.cb__page + .cb__page { margin-left: 40px; }

/* Width-driven, for a host that hands over a column rather than a window.
   Every rule here inverts one of the three above: the pages divide the width
   they are given, the ratio turns that into a height, and the board and the
   spread stop asking their parent how tall they may be. The binder then ends
   up as tall as its column is wide, which is why the dialog does not use it --
   there, the window is the constraint. */
.cb--fitwidth .cb__binder { flex: none; width: 100%; }
.cb--fitwidth .cb__spread { height: auto; width: 100%; }
.cb--fitwidth .cb__pages  { height: auto; width: 100%; }
.cb--fitwidth .cb__page {
  flex: 1 1 0; height: auto; width: auto; max-width: none;
}
/* A page keeps its half of the spread even when it is the only one open. The
   last leaf of an odd binder faces nothing, and a page that grew to fill the
   gap would be twice the size of every other page and, through the ratio,
   twice as tall -- the binder would change shape on the final turn. Keyed on
   how many pages fit rather than how many are open, so a phone, where one
   page IS the spread, still gets the full width. */
.cb--fitwidth.cb--twoup .cb__page {
  flex: 0 1 auto; width: calc((100% - 40px) / 2);
}

.cb__grid {
  flex: 1; min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(3, minmax(0, 1fr));
  gap: 9px;
  justify-items: center;
}

/* ── the pocket ────────────────────────────────────────────────────── */
.cb__pocket {
  position: relative;
  /* Height first, width from the card's ratio: the row already knows how tall
     it may be, and a pocket that took its width from the column instead would
     push the spread past the bottom of the screen. max-width keeps a short,
     wide window from stretching the pockets past their column. */
  height: 100%; width: auto; max-width: 100%;
  aspect-ratio: 59 / 86;
  /* The pocket is its own container, so the lip can be sized against the card
     rather than against the window. A spread that fits a short screen makes
     the pockets small, and fixed 10px type on a 56px card is mostly ellipsis. */
  container-type: inline-size;
  display: block; padding: 4px; border: none;
  border-radius: 7px; text-align: left; font: inherit;
  background: var(--c-well);
  box-shadow:
    inset 0 1px 3px color-mix(in srgb, var(--c-text) 12%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--c-border) 40%, transparent);
  transition: box-shadow 0.18s ease, transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
}
button.cb__pocket { cursor: pointer; }
.cb__pocket:focus-visible { outline: 2px solid var(--cb-tone, var(--c-trade)); outline-offset: 3px; }

.cb__pocket--empty { cursor: default; }

/* An empty pocket you can fill. The dashed outline the gap already wears is
   the affordance; this only makes it reachable and gives it a mark. */
.cb__pocket--add { cursor: pointer; }
.cb__pocket--add::before {
  border-color: color-mix(in srgb, var(--cb-tone, var(--c-trade)) 30%, transparent);
}
.cb__add {
  position: absolute; inset: 4px;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.4rem; font-weight: 300; line-height: 1;
  color: color-mix(in srgb, var(--cb-tone, var(--c-trade)) 45%, transparent);
  opacity: 0;
  transition: opacity 0.15s ease;
}
.cb__pocket--add:hover .cb__add,
.cb__pocket--add:focus-visible .cb__add { opacity: 1; }
.cb__pocket--add:hover::before {
  border-style: solid;
  border-color: color-mix(in srgb, var(--cb-tone, var(--c-trade)) 55%, transparent);
  background: color-mix(in srgb, var(--cb-tone, var(--c-trade)) 6%, transparent);
}
.cb__pocket--add:focus-visible { outline: 2px solid var(--cb-tone, var(--c-trade)); outline-offset: -2px; }
/* Touch has no hover to reveal the mark, so it stays visible and faint. */
@media (hover: none) {
  .cb__add { opacity: 0.55; }
}
@media (prefers-reduced-motion: reduce) { .cb__add { transition: none; } }
.cb__pocket--empty::before {
  content: ""; position: absolute; inset: 4px; border-radius: 4px;
  border: 1px dashed color-mix(in srgb, var(--c-border) 45%, transparent);
}

.cb__pocket--locked { opacity: 0.5; cursor: not-allowed; }

.cb__art {
  position: absolute; inset: 4px;
  width: calc(100% - 8px); height: calc(100% - 8px);
  border-radius: 4px; object-fit: contain;
  background: var(--c-surface-2);
  transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.18s ease;
}

/* The plastic. One diagonal band, low opacity, never animated. */
.cb__sheen {
  position: absolute; inset: 4px; border-radius: 4px; pointer-events: none;
  background: linear-gradient(104deg,
    transparent 34%,
    color-mix(in srgb, #fff 12%, transparent) 44%,
    transparent 55%);
}

/* The lip: one line, the print code and the price. The card's own art is the
   name, so repeating it here only covered the art up. */
.cb__lip {
  position: absolute; left: 4px; right: 4px; bottom: 4px; z-index: 2;
  border-radius: 0 0 4px 4px;
  background: color-mix(in srgb, var(--c-bg) 82%, transparent);
  padding: 3px 5px 4px;
  display: flex; align-items: baseline; gap: 5px;
}
.cb__lipcode {
  flex: 1 1 auto; min-width: 0;
  font-size: clamp(7px, 11cqw, 9.5px); font-weight: 700; color: var(--c-text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cb__lipprice { margin-left: auto; flex-shrink: 0; }

/* Picked: the pocket lights in the role colour and the card rides proud,
   the way it sits when you half-pull it out of the sleeve. */
.cb__pocket--picked {
  background: color-mix(in srgb, var(--cb-tone, var(--c-trade)) 22%, var(--c-well));
  box-shadow:
    inset 0 0 0 2px var(--cb-tone, var(--c-trade)),
    0 0 0 3px color-mix(in srgb, var(--cb-tone, var(--c-trade)) 20%, transparent),
    0 8px 20px color-mix(in srgb, var(--cb-tone, var(--c-trade)) 30%, transparent);
}
.cb__pocket--picked .cb__art { transform: translateY(-5px); }
.cb__pocket--picked .cb__lip { background: var(--cb-tone, var(--c-trade)); }
.cb__pocket--picked .cb__lipcode { color: var(--c-on-accent); }

button.cb__pocket:not(.cb__pocket--locked):hover { transform: translateY(-2px); }

/* Repeats the pile's own signal. A ring rather than a badge: the pocket
   leaves no room for chrome, and a seat reads across a wall of art. */
.cb__pocket--wanted {
  box-shadow:
    inset 0 1px 3px color-mix(in srgb, var(--c-text) 12%, transparent),
    inset 0 0 0 2px var(--c-accent);
}
.cb__flag {
  position: absolute; top: -5px; right: -5px; z-index: 3;
  width: 19px; height: 19px; border-radius: 50%;
  background: var(--c-accent); color: var(--c-on-accent);
  border: 2px solid var(--c-page);
  display: grid; place-items: center;
}
.cb__tick {
  position: absolute; top: -6px; left: -6px; z-index: 3;
  width: 21px; height: 21px; border-radius: 50%;
  background: var(--cb-tone, var(--c-trade)); color: var(--c-on-accent);
  border: 2px solid var(--c-page);
  display: grid; place-items: center;
}
.cb__locked {
  position: absolute; top: 6px; left: 6px; z-index: 3;
  font-size: 9px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  padding: 2px 5px; border-radius: 5px;
  background: color-mix(in srgb, var(--c-bg) 80%, transparent);
  color: var(--c-muted);
}

/* ── turning ───────────────────────────────────────────────────────── */
.cb__turnbtn {
  position: absolute; top: 50%; z-index: 4;
  width: 38px; height: 62px; border-radius: 12px;
  border: 1.5px solid var(--tpb-line, var(--c-border));
  background: var(--c-board);
  color: var(--c-muted); cursor: pointer;
  display: grid; place-items: center;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}
/* The translate is the point: the button's centre lands exactly on the page's
   edge, half over the leaf and half over the board. */
.cb__turnbtn--prev { left: 0;  transform: translate(-50%, -50%); }
.cb__turnbtn--next { right: 0; transform: translate(50%, -50%); }
.cb--frameless .cb__turnbtn { background: var(--c-page); }
.cb__turnbtn:hover:not(:disabled) {
  color: var(--c-text);
  border-color: color-mix(in srgb, var(--cb-tone, var(--c-trade)) 55%, transparent);
  background: color-mix(in srgb, var(--cb-tone, var(--c-trade)) 16%, var(--c-board));
}
.cb__turnbtn:disabled { opacity: 0.28; cursor: default; }
.cb__turnbtn:focus-visible { outline: 2px solid var(--cb-tone, var(--c-trade)); outline-offset: 2px; }

.cb__pageno {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  margin: 8px 0 0;
  font-size: 10.5px; font-weight: 700; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--c-muted);
  font-variant-numeric: tabular-nums; white-space: nowrap;
}

.cb__leaves { display: flex; gap: 2px; align-items: center; }
.cb__leafmark {
  width: 3px; height: 11px; border-radius: 1px;
  background: color-mix(in srgb, var(--c-border) 75%, transparent);
  transition: background 0.18s ease, height 0.18s ease;
}
.cb__leafmark--here { background: var(--cb-tone, var(--c-trade)); height: 17px; }

.cb__empty { margin: 0; padding: 24px 0; text-align: center; font-size: 13.5px; color: var(--c-muted); }

@media (pointer: coarse) {
  .cb__turnbtn { width: 44px; height: 74px; }
}

@media (max-width: 420px) {
  .cb__binder, .cb--frameless .cb__binder { padding: 4px 18px; }
  .cb__rings { width: 16px; }
  .cb__turnbtn { width: 30px; height: 54px; }
  .cb__page { padding: 7px; }
  .cb__grid { gap: 6px; }
}

@media (prefers-reduced-motion: reduce) {
  .cb__pocket, .cb__art, .cb__pages, .cb__leafmark { transition: none; }
  button.cb__pocket:not(.cb__pocket--locked):hover { transform: none; }
  .cb__pocket--picked .cb__art { transform: none; }
  .cb__pages[data-turn] { transform: none; opacity: 1; }
}
</style>
