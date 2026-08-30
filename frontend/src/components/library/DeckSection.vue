<script setup>
/**
 * One pile of a decklist — main, extra or side — drawn as cards.
 *
 * It used to draw them as evidence against you. Every card the reader did not
 * own was dropped to 35% opacity and stamped with a red MISSING label, which on
 * a near-black page meant a deck you had just imported was forty invisible
 * rectangles under forty red stickers. The stickers were also the only way to
 * read the grid, and they were 9px of white text on raw red, raw green and a
 * flat grey — three colours the design system does not have.
 *
 * The inversion this rests on: on a trading app the cards you are missing are
 * the point of the page. They are the shopping list, the reason the wishlist
 * button underneath exists. So nothing is dimmed away and nothing is stamped —
 * every card is drawn as a card, and its state is read off a rule along its
 * bottom edge, in the same colours the completion strip above uses. A run of
 * pink edges across the grid is the list.
 *
 * That rule is divided, because a card is not one thing you either have or do
 * not. A deck asking for three and a collection holding one is two copies
 * short, and the tile says so twice: the rule runs a third amethyst and two
 * thirds pink, and the count reads 1/3 instead of 3×.
 *
 * The page allocates the copies and hands down `alloc` — this section never
 * decides ownership itself. It cannot: the same card can sit in the main deck
 * and the side deck, and those entries draw on one shared pile of copies that
 * only the page can see all of.
 */
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { cardImage } from "@/lib/cardImage";
import { entryState, stateRuns, UNKNOWN } from "@/lib/deckStats";
import { nextSourcedCount } from "@/lib/deckIgnore";

const props = defineProps({
  // One row per entry: { id, qty, owned, sourced, missing, unknown }.
  alloc: { type: Array, default: () => [] },
  cardMap: { type: Object, required: true },
  title: { type: String, default: "" },
});

defineEmits(["mark-sourced"]);

const { t } = useI18n();
const route = useRoute();
const locale = computed(() => route.params.locale || "en");

const tally = computed(() => props.alloc.reduce(
  (out, a) => ({ total: out.total + a.qty, missing: out.missing + a.missing }),
  { total: 0, missing: 0 },
));

// One row per entry, with everything the template needs already decided. Doing
// it here rather than through four methods in the markup keeps the state
// decision in one place — the same helper the strip and the tally use.
const cards = computed(() =>
  props.alloc.map((a) => {
    const state = entryState(a);
    const card = props.cardMap[a.id];
    const name = card?.name ?? String(a.id);
    return {
      id: a.id,
      qty: a.qty,
      owned: a.owned,
      state,
      // The rule under the art, as one segment per run of copies. For the
      // ordinary single-copy card this is one full-width segment, exactly the
      // undivided rule it has always been.
      runs: stateRuns(a),
      // Only worth writing a fraction when there is a fraction to write.
      partial: a.owned > 0 && a.owned < a.qty,
      name,
      src: state === UNKNOWN ? null : cardImage(a.id),
      // The colours are the whole story here and no screen reader can see them,
      // so the split is also written out where only a reader will find it. The
      // written form is the one exposed: "1/2" spoken aloud is not a sentence,
      // which is why the visible fraction is hidden from the accessibility tree
      // and this stands in for it, right after the card's name.
      note: a.qty > 1
        ? t("decks.copiesNote", { owned: a.owned, qty: a.qty })
        : null,
      // How many copies the mark can reach: the ones you do not already hold.
      // Offering to source a copy that is in your trade pile would be offering
      // to un-own it, so those are out of the control's range entirely.
      markMax: a.qty - a.owned,
      sourced: a.sourced,
    };
  }));

/**
 * What the next click will do, written out.
 *
 * Three sentences rather than one, because a cycling control has to say where
 * it is as well as what it does: the last click on a marked card clears it, and
 * a reader who cannot see the number needs to be told that before pressing.
 */
function markLabel(card) {
  if (card.sourced >= card.markMax) return t("deckIgnore.countAgain", { name: card.name });
  if (card.markMax === 1) return t("deckIgnore.markSourced", { name: card.name });
  return t("deckIgnore.markCopy", { name: card.name, n: card.sourced, max: card.markMax });
}
</script>

<template>
  <section v-if="alloc.length" class="ds">
    <header class="ds__head">
      <h2 class="ds__title">{{ title }}</h2>
      <span class="ds__count tabular-nums">{{ tally.total }}</span>
      <span v-if="tally.missing > 0" class="ds__missing tabular-nums">
        {{ t('decks.tallyMissing', { n: tally.missing }) }}
      </span>
    </header>

    <ul class="ds__grid">
      <li v-for="card in cards" :key="card.id" class="ds-card" :data-state="card.state">
        <!--
          An <article> with one real link over the art rather than an <a> around
          the lot: the sourced toggle is interactive content, and nesting it
          inside a link is invalid and reads to a keyboard as one confusing stop.
        -->
        <div class="ds-card__frame">
          <img
            v-if="card.src"
            :src="card.src"
            :alt="card.name"
            class="ds-card__art"
            loading="lazy"
            decoding="async"
          />
          <!-- An id the card database cannot read: an empty slot, drawn as one,
               with the passcode in mono because that is the only fact we have. -->
          <span v-else class="ds-card__slot">
            <span class="ds-card__code">{{ card.id }}</span>
          </span>

          <router-link
            v-if="card.src"
            class="ds-card__hit"
            :to="`/${locale}/card/${card.id}`"
            :aria-label="card.name"
          />

          <!-- The state, on the edge, never over the art — and divided by
               copy, so one of three reads as one of three. -->
          <span class="ds-card__edge" aria-hidden="true">
            <span
              v-for="run in card.runs"
              :key="run.state"
              class="ds-card__seg"
              :data-state="run.state"
              :style="{ flexGrow: run.count }"
            />
          </span>

          <!--
            Marking copies as coming from elsewhere. One click marks one more,
            and the click after the last one clears them all — so on a three-of
            you can say one is handled, which the old on/off version could not.
            A card the deck asks for once still behaves exactly as a toggle.
          -->
          <button
            v-if="card.markMax > 0"
            type="button"
            class="ds-card__mark"
            :class="{ 'is-on': card.sourced > 0, 'is-counted': card.markMax > 1 }"
            :aria-pressed="card.markMax === 1 ? card.sourced > 0 : null"
            :aria-label="markLabel(card)"
            @click="$emit('mark-sourced', { id: card.id, count: nextSourcedCount(card.sourced, card.markMax) })"
          >
            <v-icon :icon="card.sourced > 0 ? 'mdi-cart-check' : 'mdi-cart-outline'" size="15" />
            <!-- The count rides with the icon only where there is a count to
                 tell: a one-of is marked or it is not. -->
            <span v-if="card.markMax > 1 && card.sourced > 0" class="ds-card__markn tabular-nums"
              >{{ card.sourced }}</span>
          </button>
        </div>

        <p class="ds-card__name">
          <!-- How many of the copies you already hold, when it is not all or
               none. "1/3" rather than "3×", which said only what the deck wants
               and nothing about what is left to find. -->
          <span v-if="card.partial" class="ds-card__have tabular-nums" aria-hidden="true"
            ><b>{{ card.owned }}</b>/{{ card.qty }} </span
          ><span v-else-if="card.qty > 1" class="ds-card__qty tabular-nums">{{ card.qty }}×</span>{{ card.name }}
          <span v-if="card.note" class="sr-only">{{ card.note }}</span>
        </p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.ds { display: flex; flex-direction: column; gap: 12px; }

.ds__head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
/* The collector's register, matching every other section label in this pass
   (DESIGN.md, The Uppercase Section Rule). */
.ds__title {
  margin: 0;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.7rem; font-weight: 700;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--c-muted);
}
.ds__count {
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.72rem; font-weight: 700; color: var(--c-text);
}
.ds__missing {
  margin-left: auto;
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.72rem; font-weight: 700; color: var(--c-accent);
}

.ds__grid {
  list-style: none; margin: 0; padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
  gap: 14px 12px;
}

.ds-card { display: flex; flex-direction: column; gap: 6px; min-width: 0; }

.ds-card__frame {
  position: relative;
  aspect-ratio: 59 / 86;
  border-radius: 8px;
  overflow: hidden;
  background: var(--c-surface-2);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.ds-card__art { display: block; width: 100%; height: 100%; object-fit: cover; }

/* Handled elsewhere, so it steps back — the one state that is allowed to fade,
   because it is the one the reader has already dealt with. */
.ds-card[data-state="sourced"] .ds-card__art { opacity: 0.34; }

.ds-card__slot {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  border: 1px dashed color-mix(in srgb, var(--c-muted) 45%, transparent);
  border-radius: 8px;
}
.ds-card__code {
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.68rem; font-weight: 700; color: var(--c-muted);
  word-break: break-all; text-align: center; padding: 0 4px;
}

/* Stretches the link over the whole card so the art is the target, while the
   mark button lifts above it. */
.ds-card__hit { position: absolute; inset: 0; z-index: 1; }

/* The state, as a rule along the bottom edge. At 84px wide a 5px rule is read
   instantly, and unlike the old badge it covers none of the art.

   Divided by copy, in the proportions of the entry: a card the deck asks for
   three times and you hold one of runs a third amethyst and two thirds pink.
   It is the completion strip above, one entry wide — same colours, same
   ordering, so the grid and the strip are read the same way. The single-copy
   card, which is most of them, still draws one undivided rule. */
.ds-card__edge {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 2;
  display: flex;
  gap: 1.5px;
  height: 5px;
  pointer-events: none;
}
.ds-card__seg { flex: 0 1 0; min-width: 0; }
.ds-card__seg[data-state="owned"] { background: var(--c-trade); }
.ds-card__seg[data-state="missing"] { background: var(--c-accent); }
.ds-card__seg[data-state="sourced"] { background: color-mix(in srgb, var(--c-muted) 55%, transparent); }
.ds-card__seg[data-state="unknown"] { background: transparent; }

/* A ring as well as the edge on the one state the page exists for, so a
   shopping list is legible at a glance and not only on close reading. */
.ds-card[data-state="missing"] .ds-card__frame {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c-accent) 55%, transparent);
}

/* How many copies, on the name line rather than in a black disc on the artwork.
   The quantity is a fact about the entry, and the name line is where the entry's
   facts live. */
.ds-card__qty {
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-weight: 700;
  color: var(--c-text);
  margin-right: 3px;
}
.ds-card[data-state="missing"] .ds-card__qty { color: var(--c-accent); }

/* Partly held: how many you have, over how many the deck wants. The two halves
   are coloured for what they mean rather than uniformly — the numerator is a
   card in your trade pile, so it is amethyst, and the denominator is only the
   deck talking. */
.ds-card__have {
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-weight: 700;
  color: var(--c-muted);
  margin-right: 3px;
  white-space: nowrap;
}
.ds-card__have b { color: var(--c-trade); font-weight: 700; }

.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

/* Marking a card as coming from somewhere else. A real 28px control with a
   name, in place of an 18px unlabelled black disc that no keyboard could reach.
   Quiet until the card is hovered or the button is focused, and always visible
   once a card is actually marked, because then it is state and not an offer. */
.ds-card__mark {
  position: absolute; top: 4px; right: 4px; z-index: 3;
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 999px;
  border: 1px solid var(--dk-line, var(--c-border));
  background: color-mix(in srgb, var(--c-bg) 78%, transparent);
  backdrop-filter: blur(4px);
  color: var(--c-muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.14s ease, color 0.14s ease, border-color 0.14s ease;
}
.ds-card__frame:hover .ds-card__mark,
.ds-card__mark:focus-visible,
.ds-card__mark.is-on { opacity: 1; }
.ds-card__mark:hover { color: var(--c-trade); border-color: var(--c-trade); }
.ds-card__mark.is-on { color: var(--c-trade); border-color: color-mix(in srgb, var(--c-trade) 45%, transparent); }

/* Carrying a number, the control grows from a disc into a pill. It only does so
   once some but not all of the copies are marked, so the ordinary card keeps
   the 28px circle it has always had. */
.ds-card__mark.is-counted.is-on { width: auto; min-width: 28px; padding: 0 7px 0 5px; gap: 3px; }
.ds-card__markn {
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.68rem; font-weight: 700; line-height: 1;
}
/* No pointer means no hover, so the control cannot live behind one. */
@media (hover: none) { .ds-card__mark { opacity: 1; } }

/* Amethyst glow for a card you can go and look at, never a black drop shadow
   (DESIGN.md, The Flat-By-Default Rule). */
.ds-card__frame:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px color-mix(in srgb, var(--c-trade) 22%, transparent);
}
.ds-card[data-state="missing"] .ds-card__frame:hover {
  box-shadow: inset 0 0 0 1px var(--c-accent), 0 10px 24px color-mix(in srgb, var(--c-accent) 22%, transparent);
}
.ds-card__hit:focus-visible,
.ds-card__mark:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

/* Two lines at a readable size, rather than one line of 9px cut mid-word: at
   68px "Nibiru, the Primal Being" rendered as "Nibiru, the Pri…". */
.ds-card__name {
  margin: 0;
  font-size: 0.68rem; font-weight: 600; line-height: 1.3;
  color: var(--c-muted);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.ds-card[data-state="missing"] .ds-card__name { color: var(--c-text); }

@media (prefers-reduced-motion: reduce) {
  .ds-card__frame, .ds-card__mark { transition: none; }
  .ds-card__frame:hover { transform: none; }
}
</style>
