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
 */
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { cardImage } from "@/lib/cardImage";
import { cardState, deckTally, MISSING, SOURCED, UNKNOWN } from "@/lib/deckStats";

const props = defineProps({
  entries: { type: Array, default: () => [] },        // [{ id, qty }]
  cardMap: { type: Object, required: true },
  ownedIds: { type: Object, required: true },          // Set<number>
  ignoredIds: { type: Object, default: () => new Set() },
  title: { type: String, default: "" },
});

defineEmits(["toggle-ignore"]);

const { t } = useI18n();
const route = useRoute();
const locale = computed(() => route.params.locale || "en");

const ctx = computed(() => ({
  cardMap: props.cardMap,
  ownedIds: props.ownedIds,
  ignoredIds: props.ignoredIds,
}));

const tally = computed(() => deckTally(props.entries, ctx.value));

// One row per entry, with everything the template needs already decided. Doing
// it here rather than through four methods in the markup keeps the state
// decision in one place — the same helper the strip and the tally use.
const cards = computed(() =>
  props.entries.map((entry) => {
    const state = cardState(entry.id, ctx.value);
    const card = props.cardMap[entry.id];
    return {
      id: entry.id,
      qty: entry.qty,
      state,
      name: card?.name ?? String(entry.id),
      src: state === UNKNOWN ? null : cardImage(entry.id),
      // Only a card you do not have can be marked as coming from elsewhere;
      // offering it on one you own would be offering to un-own it.
      togglable: state === MISSING || state === SOURCED,
    };
  }));
</script>

<template>
  <section v-if="entries.length" class="ds">
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

          <!-- The state, on the edge, never over the art. -->
          <span class="ds-card__edge" aria-hidden="true" />

          <button
            v-if="card.togglable"
            type="button"
            class="ds-card__mark"
            :aria-pressed="card.state === 'sourced'"
            :aria-label="card.state === 'sourced'
              ? t('deckIgnore.countAgain', { name: card.name })
              : t('deckIgnore.markSourced', { name: card.name })"
            @click="$emit('toggle-ignore', card.id)"
          >
            <v-icon :icon="card.state === 'sourced' ? 'mdi-cart-check' : 'mdi-cart-outline'" size="15" />
          </button>
        </div>

        <p class="ds-card__name">
          <span v-if="card.qty > 1" class="ds-card__qty tabular-nums">{{ card.qty }}×</span>{{ card.name }}
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

/* The state, as a rule along the bottom edge. At 84px wide a 4px rule is read
   instantly, and unlike the old badge it covers none of the art. */
.ds-card__edge {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 2;
  height: 5px;
  pointer-events: none;
}
.ds-card[data-state="owned"] .ds-card__edge { background: var(--c-trade); }
.ds-card[data-state="missing"] .ds-card__edge { background: var(--c-accent); }
.ds-card[data-state="sourced"] .ds-card__edge { background: color-mix(in srgb, var(--c-muted) 55%, transparent); }
.ds-card[data-state="unknown"] .ds-card__edge { background: transparent; }

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
.ds-card[data-state="sourced"] .ds-card__mark { opacity: 1; }
.ds-card__mark:hover { color: var(--c-trade); border-color: var(--c-trade); }
.ds-card[data-state="sourced"] .ds-card__mark { color: var(--c-trade); }
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
