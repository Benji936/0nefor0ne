<script setup>
// The two plans, wherever a plan gets picked.
//
// It exists as a component because it was written twice and then missed a
// third time: the pay step and the claim dialog each got a copy, and the
// lapsed step, which is also a checkout, kept a lone button that silently
// bought a year. Three places asking the same question have to ask it the
// same way, and the way to guarantee that is for there to be one of them.
//
// Rows divided by rules rather than two pricing cards: two options differing
// in two numbers is a comparison, and a comparison wants alignment more than
// it wants containers. The radio is a real radio, so grouping, keyboard and
// screen reader come for free.
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { INTERVALS } from "@/lib/communityPricing";

const props = defineProps({
  /** 'year' | 'month' */
  modelValue: { type: String, default: "year" },
  /** A communityPricing() result: { currency, year, month } */
  pricing: { type: Object, required: true },
  /** Tighter type for the claim dialog, which has less room. */
  compact: { type: Boolean, default: false },
});
const emit = defineEmits(["update:modelValue"]);
const { t } = useI18n();

// A name unique to the instance, so two choosers on one page could never end
// up in the same radio group and fight over the selection.
const groupName = `plan-${Math.random().toString(36).slice(2, 8)}`;

const plans = computed(() => INTERVALS.map((i) => ({
  interval: i,
  name: t(`communityVerify.plans.${i}.name`),
  free: t(`communityVerify.plans.${i}.free`),
  then: t(`communityVerify.plans.${i}.then`, { price: props.pricing[i].display }),
})));
</script>

<template>
  <div class="pc" :class="{ 'pc--compact': compact }">
    <fieldset class="pc__set">
      <legend v-if="!compact" class="pc__legend">{{ t('communityVerify.plansLegend') }}</legend>
      <label
        v-for="p in plans"
        :key="p.interval"
        class="pc__plan"
        :class="{ 'pc__plan--on': modelValue === p.interval }"
      >
        <input
          class="pc__radio"
          type="radio"
          :name="groupName"
          :value="p.interval"
          :checked="modelValue === p.interval"
          @change="emit('update:modelValue', p.interval)"
        />
        <span class="pc__body">
          <span class="pc__name">{{ p.name }}</span>
          <!-- The free period is what this screen is selling, so it takes the
               scale step rather than sitting in a bullet underneath. -->
          <span class="pc__free">{{ p.free }}</span>
        </span>
        <span class="pc__then">{{ p.then }}</span>
      </label>
    </fieldset>

    <!-- Monthly is dearer over a year AND gets half the free time. Both are
         deliberate, so both are said out loud: an advantage the reader has to
         discover at month seven reads as a trick. -->
    <p class="pc__why">{{ t('communityVerify.plansWhy') }}</p>
  </div>
</template>

<style scoped>
.pc { max-width: 460px; width: 100%; }
.pc__set { border: none; padding: 0; margin: 0; }
.pc__legend {
  padding: 0; margin: 0 0 10px;
  font-size: 0.75rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--c-muted);
}

.pc__plan {
  display: flex; align-items: center; gap: 12px;
  padding: 15px 12px 15px 2px;
  border-top: 1px solid var(--c-border);
  cursor: pointer;
  transition: background-color .15s ease;
}
.pc__plan:last-of-type { border-bottom: 1px solid var(--c-border); }
/* Selection is a tint plus the radio itself. Nothing louder is needed: there
   are two rows and one of them is filled in. */
.pc__plan--on { background: var(--c-surface-2); }
.pc__plan:hover:not(.pc__plan--on) { background: var(--c-surface-2); }
.pc__plan:focus-within { outline: 2px solid var(--c-trade); outline-offset: -2px; }

.pc__radio { accent-color: var(--c-trade); width: 17px; height: 17px; flex-shrink: 0; margin: 0 0 0 10px; cursor: pointer; }
.pc__body { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
.pc__name {
  font-size: 11px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--c-muted);
}
.pc__free { font-size: 15.5px; font-weight: 700; line-height: 1.25; color: var(--c-text); }
.pc__then { font-size: 13px; color: var(--c-muted); text-align: right; flex-shrink: 0; }

.pc__why {
  margin: 14px 0 0;
  font-size: 13.5px; line-height: 1.65; color: var(--c-muted); max-width: 62ch;
}

/* In a dialog everything steps down one notch; the hierarchy between the two
   lines in a row is what has to survive, not the absolute sizes. */
.pc--compact .pc__plan { gap: 11px; padding: 13px 10px 13px 2px; }
.pc--compact .pc__radio { width: 16px; height: 16px; margin-left: 8px; }
.pc--compact .pc__name { font-size: 10.5px; }
.pc--compact .pc__free { font-size: 14.5px; }
.pc--compact .pc__then { font-size: 12.5px; }
.pc--compact .pc__why { margin-top: 12px; font-size: 12.5px; line-height: 1.55; }
</style>
