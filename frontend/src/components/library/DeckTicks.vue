<script setup>
/**
 * A deck, drawn as one tick per copy.
 *
 * This replaces a two-segment progress bar. A percentage rounds — 13% of
 * forty-six cards is a number you cannot act on — but a deck is a countable
 * pile, forty and fifteen and fifteen, and what the reader actually wants to
 * know is how many cards short they are. So the strip draws one tick per copy
 * and they can be counted. Per copy, not per card: a deck asking for three of
 * something you hold one of draws one amethyst tick and two pink ones.
 *
 * Amethyst for the cards already in your trade pile, pink for the ones headed
 * for your wishlist, muted for the ones you have said are coming from
 * somewhere else, and an outline for an id the card database cannot read. No
 * teal: a decklist holds no agreements (DESIGN.md, The Agreement Rule). The
 * card grid below repeats exactly this colour code on the cards' bottom edges,
 * so the strip is the legend as well as the summary.
 *
 * Past `maxTicks` cards the strip stops counting and goes proportional — a
 * three-hundred-card cube would otherwise draw ticks a pixel wide, which is a
 * bar pretending to be a count.
 */
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { stateRuns } from "@/lib/deckStats";

const props = defineProps({
  /**
   * The deck's copy counts, from deckTally(): { total, owned, sourced,
   * missing, unknown }. The page allocates and passes the result in rather than
   * this component resolving ownership itself — a card can sit in the main deck
   * and the side deck, and only the page sees both entries drawing on one pile
   * of copies.
   */
  tally: { type: Object, default: () => ({ total: 0 }) },
  /** Smaller ticks and no written tally, for a list row. */
  compact: { type: Boolean, default: false },
  maxTicks: { type: Number, default: 80 },
});

const { t } = useI18n();

const tally = computed(() => props.tally ?? { total: 0 });
const runs = computed(() => stateRuns(tally.value));

/** Countable while the deck is a deck; proportional once it is a collection. */
const counted = computed(() => tally.value.total > 0 && tally.value.total <= props.maxTicks);

// Flattened to one entry per copy so the template can render ticks without a
// nested loop, capped at the total it is already known to be under.
const ticks = computed(() => {
  if (!counted.value) return [];
  const out = [];
  for (const run of runs.value) for (let i = 0; i < run.count; i++) out.push(run.state);
  return out;
});

// The written half. Zeroes are dropped rather than printed: "0 missing" on a
// finished deck is noise, and the strip already shows an unbroken amethyst run.
const parts = computed(() => {
  const t9 = tally.value;
  return [
    { state: "owned", n: t9.owned, label: t("decks.tallyOwned", { n: t9.owned }) },
    { state: "sourced", n: t9.sourced, label: t("decks.tallySourced", { n: t9.sourced }) },
    { state: "missing", n: t9.missing, label: t("decks.tallyMissing", { n: t9.missing }) },
    { state: "unknown", n: t9.unknown, label: t("decks.tallyUnknown", { n: t9.unknown }) },
  ].filter((p) => p.n > 0);
});

const ariaLabel = computed(() =>
  t("decks.tallyAria", { total: tally.value.total, owned: tally.value.owned, missing: tally.value.missing }));
</script>

<template>
  <div class="dt" :class="{ 'dt--compact': compact }">
    <div
      class="dt__strip"
      :class="{ 'dt__strip--proportional': !counted }"
      role="img"
      :aria-label="ariaLabel"
    >
      <template v-if="counted">
        <span v-for="(state, i) in ticks" :key="i" class="dt__tick" :data-state="state" />
      </template>
      <!-- Too many cards to count: the runs become widths instead. -->
      <span
        v-for="run in runs"
        v-else
        :key="run.state"
        class="dt__run"
        :data-state="run.state"
        :style="{ flexGrow: run.count }"
      />
    </div>

    <p v-if="!compact && parts.length" class="dt__tally">
      <span
        v-for="(part, i) in parts"
        :key="part.state"
        class="dt__part"
        :data-state="part.state"
        :data-last="i === parts.length - 1 || null"
      >{{ part.label }}</span>
    </p>
  </div>
</template>

<style scoped>
.dt { display: flex; flex-direction: column; gap: 9px; width: 100%; min-width: 0; }
.dt--compact { gap: 0; }

/* Gaps between ticks, not a divided bar: the point is that they are separate
   cards. flex-wrap stays off so a long deck compresses the ticks rather than
   spilling onto a second line and reading as two decks. */
.dt__strip {
  display: flex;
  align-items: stretch;
  gap: 2px;
  width: 100%;
  height: 14px;
  min-width: 0;
}
.dt--compact .dt__strip { height: 9px; gap: 1.5px; }

/* Capped as well as flexible. A tick stands for a card, and left to grow a
   seven-card deck drew seven hundred-pixel slabs — which reads as a bar chart
   of nothing rather than as a short deck. Below the cap it still shrinks, so a
   sixty-card list fits the same width. */
.dt__tick { flex: 1 1 0; min-width: 2px; max-width: 13px; border-radius: 2px; }
.dt__run { border-radius: 2px; min-width: 4px; }
.dt__strip:not(.dt__strip--proportional) { justify-content: flex-start; }
.dt__strip--proportional { gap: 3px; }

/* The two roles the app already has for these piles: a card you hold is a card
   you can offer, a card you lack is a card you want. */
.dt__tick[data-state="owned"],
.dt__run[data-state="owned"] { background: var(--c-trade); }
.dt__tick[data-state="missing"],
.dt__run[data-state="missing"] { background: var(--c-accent); }
/* Handled, so it neither counts against you nor claims to be yours. */
.dt__tick[data-state="sourced"],
.dt__run[data-state="sourced"] { background: color-mix(in srgb, var(--c-muted) 55%, transparent); }
/* An id nothing can be said about: an empty slot, drawn as one. */
.dt__tick[data-state="unknown"],
.dt__run[data-state="unknown"] {
  background: transparent;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c-muted) 45%, transparent);
}

.dt__tally {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 7px;
  margin: 0;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.76rem; font-weight: 700;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
}
/* The separator trails its own item rather than leading the next one, so a
   tally that wraps ends a line with "·" instead of starting one with it. */
.dt__part:not([data-last])::after {
  content: "·";
  margin-left: 7px;
  color: color-mix(in srgb, var(--c-muted) 72%, transparent);
}
.dt__part[data-state="owned"] { color: var(--c-trade); }
.dt__part[data-state="missing"] { color: var(--c-accent); }
.dt__part[data-state="sourced"] { color: var(--c-muted); }
.dt__part[data-state="unknown"] { color: var(--c-muted); }
</style>
