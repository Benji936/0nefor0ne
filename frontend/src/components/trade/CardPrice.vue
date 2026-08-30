<script setup>
// One price, drawn the way we actually know it.
//
// Three shapes, because there are three states of knowledge and flattening them
// into one number is the bug this feature exists to fix:
//
//   0.09          the printing is identified, this is its price
//   57.82-368.69  the set is known but it printed the card at two rarities and
//                 Cardmarket labels neither product
//   nothing       Cardmarket prices nothing by that name
//
// A price is not one of the three roles, so it is not amethyst, pink or teal
// (DESIGN.md, The Three-Role Rule). Money here is a fact about a card, not a
// claim about who wants it, and colouring it would say something untrue. It is
// text and muted text, with tabular figures so a column of prices lines up.
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { EXACT, NARROWED, RANGE, NONE, formatMoney } from "@/lib/cardmarketPrice";

const props = defineProps({
  price: { type: Object, default: null },
  // "sm" for a row in a list, "md" for a total or a card page.
  size: { type: String, default: "sm" },
  // Whether to spell out how many printings a band spans. Off in dense lists,
  // where the band itself already says "we do not know which one".
  detail: { type: Boolean, default: false },
});

const { t, locale } = useI18n();

const kind = computed(() => props.price?.kind ?? NONE);
const isBand = computed(() => kind.value === NARROWED || kind.value === RANGE);

const money = (v) => formatMoney(v, locale.value);

const label = computed(() => {
  if (kind.value === EXACT) return money(props.price.value);
  if (isBand.value) return `${money(props.price.low)} – ${money(props.price.high)}`;
  return "";
});

// Says which question is still open, so a band is never mistaken for volatility.
// "in this set" is the narrower, more useful state and worth naming as such.
const hint = computed(() => {
  if (!props.detail || !isBand.value) return "";
  const count = props.price.printings;
  return kind.value === NARROWED
    ? t("price.inThisSet", { count }, count)
    : t("price.acrossPrintings", { count }, count);
});

const metricHint = computed(() => {
  if (props.price?.metric === "trend") return t("price.trendMetric");
  if (props.price?.metric === "low") return t("price.lowMetric");
  if (props.price?.metric === "mixed") return t("price.mixedMetric");
  return "";
});
</script>

<template>
  <span
    v-if="kind !== NONE"
    class="cp"
    :class="[`cp--${size}`, { 'cp--band': isBand }]"
    :title="metricHint"
  >
    <span class="cp__value tabular-nums">{{ label }}</span>
    <span v-if="hint" class="cp__hint">{{ hint }}</span>
  </span>
</template>

<style scoped>
.cp {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.cp__value {
  font-weight: 700;
  color: var(--c-text);
  white-space: nowrap;
}

/* A band is a wider claim than a figure, so it is set at the weight of one.
   Dropping it to muted would read as "less important" when it is the same fact
   held less precisely. */
.cp--band .cp__value { font-weight: 600; }

.cp--sm .cp__value { font-size: 12.5px; }
.cp--md .cp__value { font-size: 15px; }

.cp__hint {
  font-size: 11px;
  font-weight: 600;
  color: var(--c-muted);
  white-space: nowrap;
}
</style>
