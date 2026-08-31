<script setup>
import CardPrice from '@/components/trade/CardPrice.vue';
import PrintingPicker from '@/components/trade/PrintingPicker.vue';
import { RANGE } from '@/lib/cardmarketPrice';
import { cardImage } from '@/lib/cardImage';
defineEmits(['deleted', 'move', 'printing-picked', 'edit']);
</script>

<template>
  <!-- Stable root so toggling layout swaps the inner content in place — keeps the
       parent TransitionGroup from running a leave/enter on the root (which flashed
       both layouts during a view switch). -->
  <div class="ce-root">
  <PrintingPicker v-model="pickerOpen" :card="wish" @picked="$emit('printing-picked', $event)" />

  <!-- ── Compact list row (basic view) ──────────────────────────────────────
       Two metadata lines, because a copy is two separate facts and only one of
       them is about the card. The first line says *which card object this is*
       — print code and rarity, the pair that decides what it is worth. The
       second says *what state your copy is in*. Filing them together, as one
       undifferentiated chip row, is what made a wrong entry invisible: a card
       recorded as unlimited when it is 1st Edition looked exactly like a card
       recorded correctly. -->
  <div
    v-if="layout === 'list'"
    class="card-row"
    :class="{ 'is-locked': wish.status === 'locked' }"
  >
    <!-- Thumbnail -->
    <div class="ce-thumb">
      <img :src="cardImage(wish.image_id)" :alt="wish.name" loading="lazy" class="ce-thumb__img" />
      <div v-if="wish.status === 'locked'" class="ce-thumb__lock">
        <v-icon icon="mdi-handshake" size="14" color="var(--c-mutual)" />
      </div>
    </div>

    <!-- Name, then the two lines -->
    <div class="ce-ident">
      <p class="ce-name">{{ wish.name }}</p>

      <p class="ce-print">
        <a
          :href="cardmarketUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="ce-print__code"
          :title="$t('cardElement.openOnCardmarket')"
        >{{ wish.extension || $t('cardElement.noPrinting') }}<v-icon icon="mdi-open-in-new" size="11" /></a>
        <span v-if="wish.rarity" class="ce-print__rarity">{{ wish.rarity }}</span>
      </p>

      <p class="ce-state">
        <span v-if="wish.condition">{{ wish.condition }}</span>
        <span v-if="wish.language">{{ wish.language }}</span>
        <!-- Stored since the beginning and displayed nowhere until now, which
             is why nobody could see the field they wanted to correct. It only
             appears when true: "Unlimited" on every other row would be noise. -->
        <span v-if="wish.first_edition" class="ce-state__first">{{ $t('cardElement.firstEdition') }}</span>
      </p>
    </div>

    <!-- What it is worth. When the printing is unknown the figure itself is the
         prompt: the wide range is the reason to answer, so the answer is offered
         on it rather than parked in a separate control somebody has to notice. -->
    <button
      v-if="price && price.kind === RANGE"
      type="button"
      class="ce-price ce-price--ask"
      :title="$t('price.whichPrinting')"
      @click.stop="pickerOpen = true"
    >
      <CardPrice :price="price" size="sm" />
      <span class="ce-ask">{{ $t('price.pickPrinting') }}</span>
    </button>
    <CardPrice v-else-if="price" :price="price" size="sm" class="ce-price" />

    <!-- Quantity. A stamp at rest and a stepper when wanted: the count is read
         far more often than it is changed, and a spinner on every row of a
         200-card binder made the page read as a form. The locked state has
         always rendered a static count; this makes the ordinary case agree
         with it. -->
    <div
      class="ce-qty"
      :class="{ 'is-open': qtyOpen }"
      @focusout="onQtyFocusOut"
    >
      <div v-if="wish.status === 'locked'" class="ce-qty__locked">
        <v-icon icon="mdi-lock-outline" size="13" color="var(--c-mutual)" />
        <span class="ce-qty__lockednum tabular-nums">{{ wish.quantity }}</span>
      </div>

      <template v-else>
        <button
          type="button"
          class="ce-qty__stamp tabular-nums"
          :aria-label="$t('cardElement.changeQuantity')"
          :title="$t('cardElement.changeQuantity')"
          @click="openQty"
          @focus="openQty"
        >×{{ wish.quantity }}</button>

        <div class="ce-qty__step">
          <v-number-input
            ref="qtyInput"
            hide-details
            density="compact"
            variant="outlined"
            control-variant="split"
            v-model="quantityCount"
            @update:model-value="onQuantityChange"
            :min="minQuantity"
          />
        </div>
      </template>
    </div>

    <!-- Correcting an entry and filing it are both occasional, so they share
         one quiet column rather than each taking a button on every row. -->
    <div class="ce-acts">
      <button
        v-if="wish.status !== 'locked'"
        type="button"
        class="ce-act"
        :title="$t('editCard.title')"
        :aria-label="$t('editCard.title')"
        @click="$emit('edit', wish)"
      >
        <v-icon icon="mdi-pencil-outline" size="16" />
      </button>

      <v-menu v-if="canFile" location="bottom end">
        <template #activator="{ props: menu }">
          <button
            v-bind="menu"
            class="ce-act"
            :title="$t('wishlists.moveTo')"
            :aria-label="$t('wishlists.moveTo')"
          >
            <v-icon icon="mdi-folder-move-outline" size="16" />
          </button>
        </template>
        <v-list density="compact" style="background: var(--c-surface); border: 1px solid var(--c-border)">
          <v-list-item
            v-for="opt in fileOptions"
            :key="opt.id ?? 'unsorted'"
            @click="$emit('move', { cardId: wish.id, listId: opt.id })"
          >
            <v-list-item-title class="text-sm" style="color: var(--c-text)">{{ opt.name }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </div>
  </div>

  <!-- ── Card tile (grid view) ── -->
  <div
    v-else
    class="card-element"
    :class="{ 'is-locked': wish.status === 'locked' }"
  >
    <div class="ce-tile__art">
      <img :src="cardImage(wish.image_id)" :alt="wish.name" loading="lazy" class="ce-tile__img" />

      <!-- The count rides on the art, where a binder shows it, instead of
           taking a control-sized row under every tile. -->
      <button
        v-if="wish.status !== 'locked'"
        type="button"
        class="ce-tile__qty tabular-nums"
        :aria-label="$t('cardElement.changeQuantity')"
        :title="$t('cardElement.changeQuantity')"
        @click="$emit('edit', wish)"
      >×{{ wish.quantity }}</button>

      <span v-if="wish.first_edition" class="ce-tile__first">{{ $t('cardElement.firstEditionShort') }}</span>

      <div v-if="wish.status === 'locked'" class="ce-tile__lock">
        <v-icon icon="mdi-handshake" size="22" color="var(--c-mutual)" />
        <span class="ce-tile__locktext">{{ $t('cardElement.acceptedTrade') }}</span>
      </div>
    </div>

    <div class="ce-tile__data">
      <div class="ce-tile__top">
        <p class="ce-name ce-name--tile">{{ wish.name }}</p>
        <button
          v-if="price && price.kind === RANGE"
          type="button"
          class="ce-price--ask ce-price--tile"
          :title="$t('price.whichPrinting')"
          @click.stop="pickerOpen = true"
        ><CardPrice :price="price" size="sm" /></button>
        <CardPrice v-else-if="price" :price="price" size="sm" class="shrink-0" />
      </div>

      <p class="ce-print ce-print--tile">
        <span class="ce-print__code">{{ wish.extension || $t('cardElement.noPrinting') }}</span>
        <span v-if="wish.rarity" class="ce-print__rarity">{{ shortRarity }}</span>
      </p>

      <p class="ce-state ce-state--tile">
        <span v-if="wish.condition">{{ wish.condition }}</span>
        <span v-if="wish.language">{{ languageShort }}</span>
      </p>

      <div class="ce-tile__acts">
        <button
          v-if="wish.status !== 'locked'"
          type="button"
          class="ce-act ce-act--wide"
          @click="$emit('edit', wish)"
        >
          <v-icon icon="mdi-pencil-outline" size="13" />
          {{ $t('editCard.edit') }}
        </button>

        <v-menu v-if="canFile" location="bottom end">
          <template #activator="{ props: menu }">
            <button v-bind="menu" class="ce-act" :title="$t('wishlists.moveTo')" :aria-label="$t('wishlists.moveTo')">
              <v-icon icon="mdi-folder-move-outline" size="13" />
            </button>
          </template>
          <v-list density="compact" style="background: var(--c-surface); border: 1px solid var(--c-border)">
            <v-list-item
              v-for="opt in fileOptions"
              :key="opt.id ?? 'unsorted'"
              @click="$emit('move', { cardId: wish.id, listId: opt.id })"
            >
              <v-list-item-title class="text-sm" style="color: var(--c-text)">{{ opt.name }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
      </div>
    </div>
  </div>
  </div>
</template>

<script>
import { getClient } from "@/lib/supabaseClient";
import { shortenRarity, languageTag } from "@/lib/cardCopy";
// Aliased: the computed below is also called cardmarketUrl, and it is the name
// the template already uses.
import { cardmarketUrl as buildCardmarketUrl } from "@/lib/cardmarketLink";

export default {
  props: {
    wish:   { required: true },
    layout: { default: 'list' },
    // What Cardmarket says this printing is worth, already resolved by the
    // page. Passed in rather than fetched here: a binder renders hundreds of
    // these, and one request per row would be hundreds of requests.
    price:  { type: Object, default: null },
    // Named wishlists this card could be filed under. Empty for a trade-pile
    // card, which has no lists — the control hides itself rather than offering
    // somewhere to put something that cannot go there.
    lists:  { type: Array, default: () => [] },
  },
  data() {
    return {
      pickerOpen: false,
      qtyOpen: false,
      quantityCount: this.wish.quantity,
      reservedQty: 0,
      loadingReserved: false,
    };
  },
  computed: {
    /** Only a wished card can be filed, and only when there is a list to file
     *  it under. Mirrors the card_wishlist_only_when_wish CHECK. */
    canFile() {
      return !!this.wish?.wish && this.lists.length > 0;
    },
    /** The lists, plus the way back out to unsorted. */
    fileOptions() {
      return [
        ...this.lists.map(l => ({ id: l.id, name: l.name })),
        { id: null, name: this.$t('wishlists.unsorted') },
      ].filter(o => o.id !== (this.wish?.wishlist ?? null));
    },
    /**
     * The lowest value the quantity input allows.
     * Always derived from the live reservedQty count, not from wish.status —
     * so cards in accepted trades are protected even if the status column
     * wasn't updated server-side.
     */
    minQuantity() {
      return this.reservedQty;
    },
    /** A tile has no room for "Quarter Century Secret Rare". */
    shortRarity() {
      return shortenRarity(this.wish.rarity);
    },
    languageShort() {
      return languageTag(this.wish.language);
    },
    /**
     * The row's Cardmarket link.
     *
     * No expansion route: a list row is one of several hundred on screen and
     * is not worth a lookup each. The copy's own language and condition still
     * reach the URL, which is the half that needs no request — the binder's
     * link sheet is where a reader who wants the printing itself goes.
     */
    cardmarketUrl() {
      return buildCardmarketUrl(this.wish);
    },
  },
  watch: {
    // The edit dialog writes the same row, so a saved quantity has to reach the
    // stepper's own copy of it or the next nudge starts from a stale number.
    'wish.quantity'(next) {
      this.quantityCount = next;
    },
  },
  async mounted() {
    // Always check for active-trade reservations, regardless of wish.status.
    // wish.status drives the visual "Reserved" overlay; minQuantity drives
    // the edit floor — they must be independent.
    await this.fetchReservedQty();
  },
  methods: {
    /** Open the stepper, and put the caret in it so a keyboard reaches the
     *  control the stamp stands for rather than skipping past it. */
    openQty() {
      this.qtyOpen = true;
      this.$nextTick(() => {
        this.$refs.qtyInput?.$el?.querySelector('input')?.focus();
      });
    },
    /** Close again once focus leaves the whole quantity cell. */
    onQtyFocusOut(event) {
      if (!event.currentTarget.contains(event.relatedTarget)) this.qtyOpen = false;
    },

    /**
     * Fetch how many copies of this card are committed in active trades.
     * Now uses locked Card copies as the source of truth — one locked row
     * is created per trade_item when a trade is accepted, so summing their
     * quantities gives the exact reserved floor.
     */
    async fetchReservedQty() {
      this.loadingReserved = true;
      try {
        const { data } = await getClient()
          .from('Card')
          .select('quantity')
          .eq('locked_original_card_id', this.wish.id)
          .eq('status', 'locked');

        this.reservedQty = (data ?? []).reduce((sum, r) => sum + (r.quantity ?? 0), 0);
      } catch {
        this.reservedQty = 0;
      } finally {
        this.loadingReserved = false;
      }
    },

    async onQuantityChange() {
      if (this.quantityCount < this.minQuantity) {
        this.quantityCount = this.minQuantity;
        return;
      }

      const supabase_client = getClient();
      if (this.quantityCount > 0) {
        await supabase_client.from('Card').update({ quantity: this.quantityCount }).eq('id', this.wish.id);
      } else {
        await supabase_client.from('Card').delete().eq('id', this.wish.id);
        this.$emit('deleted', this.wish.id);
      }
    },
  },
};
</script>

<style scoped>
/* ── The row ─────────────────────────────────────────────────────────────── */
.card-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--c-border);
  background: var(--c-surface);
  transition: background-color 0.15s ease, border-color 0.15s ease;
}
.card-row:hover { background: var(--c-surface-2); }
.card-row.is-locked {
  border-color: color-mix(in srgb, var(--c-mutual) 60%, transparent);
  opacity: 0.85;
}
@media (prefers-reduced-motion: reduce) { .card-row { transition: none; } }

.ce-thumb { position: relative; flex-shrink: 0; }
.ce-thumb__img {
  display: block;
  width: 38px;
  aspect-ratio: 59 / 86;
  object-fit: cover;
  border-radius: 4px;
}
.ce-thumb__lock {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 4px;
  background: rgb(0 0 0 / 0.55);
}

.ce-ident { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }

.ce-name {
  margin: 0;
  font-weight: 600;
  font-size: 0.875rem;
  line-height: 1.25;
  color: var(--c-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* Line one: which card object this is. Monospace because a print code is an
   identifier (DESIGN.md, The Mono Identifier Rule) — and because it lets the
   eye find the code without reading the row. */
.ce-print {
  display: flex; align-items: center; gap: 8px;
  margin: 0; min-width: 0;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.7rem;
  letter-spacing: 0.05em;
  color: var(--c-muted);
}
.ce-print__code {
  display: inline-flex; align-items: center; gap: 3px;
  color: var(--c-muted);
  text-decoration: none;
  white-space: nowrap;
  transition: color 0.15s ease;
}
a.ce-print__code:hover { color: var(--c-trade); }
a.ce-print__code:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; border-radius: 3px; }
.ce-print__rarity {
  min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: color-mix(in srgb, var(--c-muted) 82%, transparent);
}

/* Line two: the state of your copy, in the register a collector says it in.
   Full words, not NM/EN chips behind tooltips — a tooltip is not a label, and
   the whole point of this line is that a wrong value should be readable. */
.ce-state {
  display: flex; align-items: center; flex-wrap: wrap;
  gap: 0 8px;
  margin: 0;
  font-size: 0.72rem;
  color: var(--c-muted);
}
.ce-state > span + span::before {
  content: "·";
  margin-right: 8px;
  opacity: 0.55;
}
/* The one fact on this line that changes what the copy is worth. */
.ce-state__first {
  font-weight: 700;
  color: var(--c-trade);
}

.ce-price { margin-left: auto; flex-shrink: 0; }

/* The unknown-printing price is a control, so it looks like one on hover and
   carries the question under the figure. Dashed, not solid: the number inside
   it is provisional, and a solid button would present a range as an answer
   rather than as the reason to give one. */
.ce-price--ask {
  display: flex; flex-direction: column; align-items: flex-end; gap: 1px;
  padding: 3px 8px; border-radius: 9px; cursor: pointer;
  background: transparent;
  border: 1px dashed color-mix(in srgb, var(--c-trade) 40%, transparent);
  transition: background 0.15s ease, border-color 0.15s ease;
}
.ce-price--ask:hover {
  background: color-mix(in srgb, var(--c-trade) 8%, transparent);
  border-color: color-mix(in srgb, var(--c-trade) 65%, transparent);
}
.ce-price--ask:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }
.ce-ask {
  font-size: 10px; font-weight: 700; color: var(--c-trade);
  text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap;
}
@media (prefers-reduced-motion: reduce) { .ce-price--ask { transition: none; } }

/* ── Quantity: stamp, then stepper ───────────────────────────────────────── */
.ce-qty { flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; min-width: 52px; }

.ce-qty__stamp {
  padding: 3px 9px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--c-text);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
/* Only announces itself as a control once you are on the row, so a scrolled
   binder is a column of counts rather than a column of buttons. */
.card-row:hover .ce-qty__stamp {
  border-color: var(--c-border);
  background: var(--c-surface);
}
.ce-qty__stamp:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .ce-qty__stamp { transition: none; } }

.ce-qty__step { display: none; width: 124px; }
.ce-qty.is-open .ce-qty__step { display: block; }
.ce-qty.is-open .ce-qty__stamp { display: none; }

/* A pointer that can hover gets the stepper by hovering the row; touch taps
   the stamp instead, which is what .is-open above is for. */
@media (hover: hover) and (pointer: fine) {
  .card-row:hover .ce-qty__step { display: block; }
  .card-row:hover .ce-qty__stamp { display: none; }
}

.ce-qty__locked {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 8px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--c-mutual) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--c-mutual) 30%, transparent);
}
.ce-qty__lockednum { font-size: 0.75rem; font-weight: 600; color: var(--c-mutual); }

/* ── The quiet action column ─────────────────────────────────────────────── */
.ce-acts { flex-shrink: 0; display: flex; align-items: center; gap: 4px; }

.ce-act {
  display: flex; align-items: center; justify-content: center; gap: 5px;
  width: 30px; height: 30px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--c-muted);
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease, border-color 0.15s ease;
}
.card-row:hover .ce-act { border-color: var(--c-border); }
.ce-act:hover { color: var(--c-text); background: var(--c-surface-2); border-color: var(--c-border); }
.ce-act:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }
.ce-act--wide { width: auto; flex: 1; height: 26px; font-size: 11px; font-weight: 700; border-color: var(--c-border); }
@media (prefers-reduced-motion: reduce) { .ce-act { transition: none; } }

/* ── Narrow rows ─────────────────────────────────────────────────────────── */
@media (max-width: 620px) {
  .card-row { flex-wrap: wrap; row-gap: 8px; }
  /* Thumbnail and the identity block take the first line whole, so the name
     never has to compete with a figure for width. Price, count and actions
     then share the second line — the things you act on, side by side. */
  .ce-ident { flex: 1 1 calc(100% - 62px); }
  .ce-price { order: 5; margin-left: 50px; }
  .ce-qty   { order: 10; margin-left: auto; }
  .ce-acts  { order: 15; }
  /* A touch row has no hover to reveal the stepper, so the stamp stays put
     and opens on tap. */
  .ce-qty__stamp { border-color: var(--c-border); background: var(--c-surface); }
}

/* ── The tile ────────────────────────────────────────────────────────────── */
.card-element {
  display: flex;
  flex-direction: column;
  width: 100%;
  border-radius: 10px;
  border: 1px solid var(--c-border);
  overflow: hidden;
  background: var(--c-surface);
  transition: border-color 0.15s ease;
}
.card-element.is-locked {
  border-color: color-mix(in srgb, var(--c-mutual) 60%, transparent);
  opacity: 0.8;
}
@media (prefers-reduced-motion: reduce) { .card-element { transition: none; } }

.ce-tile__art { position: relative; }
.ce-tile__img { display: block; width: 100%; aspect-ratio: 59 / 86; object-fit: cover; }

/* The count sits on the art the way a sleeve label does, which buys the tile
   a whole row back. Tapping it opens the full edit form — on a tile there is
   no room for a stepper that is only ever used occasionally. */
.ce-tile__qty {
  position: absolute; right: 6px; bottom: 6px;
  padding: 2px 8px;
  border-radius: 7px;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--c-text);
  background: color-mix(in srgb, var(--c-surface) 88%, transparent);
  border: 1px solid var(--c-border);
  backdrop-filter: blur(3px);
  cursor: pointer;
}
.ce-tile__qty:hover { background: var(--c-surface); }
.ce-tile__qty:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

.ce-tile__first {
  position: absolute; left: 6px; top: 6px;
  padding: 2px 6px;
  border-radius: 6px;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--c-on-accent);
  background: var(--c-trade);
}

.ce-tile__lock {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  background: rgb(0 0 0 / 0.6);
}
.ce-tile__locktext {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.05em; text-align: center; line-height: 1.2;
  padding: 0 8px;
  color: var(--c-mutual);
}

.ce-tile__data { display: flex; flex-direction: column; gap: 4px; padding: 8px 10px 10px; }
.ce-tile__top { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.ce-name--tile { font-size: 0.78rem; flex: 1; }
.ce-price--tile { padding: 1px 6px; }
.ce-print--tile { font-size: 0.66rem; }
.ce-state--tile { font-size: 0.68rem; }
.ce-tile__acts { display: flex; align-items: center; gap: 4px; margin-top: 2px; }
</style>
