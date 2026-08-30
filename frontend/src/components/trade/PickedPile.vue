<script setup>
// The cards you have pulled out of the binder, set down on the table.
//
// Before this, the only way to see your selection was to scroll the list back
// and read the ticks. The pile answers "what am I actually asking for" in one
// glance, and it is where quantity lives -- a stepper only makes sense for a
// card you have already chosen.
//
// Cards overlap by about a third. Overlapping them by two thirds was tried
// first and left a 24px sliver of each, which is a colour swatch rather than a
// card; the point of showing art here is that you can recognise it.
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { cardImage } from "@/lib/cardImage";

const props = defineProps({
  // [{ card, qty, side, tone }] -- tone is 'trade' or 'accent'.
  entries:   { type: Array, default: () => [] },
  emptyLabel: { type: String, default: "" },
  // Total across both sides, already formatted by the host: it owns the
  // locale and the band-vs-figure decision that cardmarketPrice.js makes.
  total:     { type: String, default: "" },
  totalLabel:{ type: String, default: "" },
  // 'bar' is the wide strip under a binder; 'panel' is the tall column in the
  // dialog's rail, where a horizontal strip would squeeze the label, the pile
  // and the total into 360px and leave the rest of the rail empty.
  layout:    { type: String, default: "bar" },   // 'bar' | 'panel'
});

const emit = defineEmits(["set", "remove"]);

const { t } = useI18n();

const toneVar = (tone) => (tone === "accent" ? "var(--c-accent)" : "var(--c-trade)");

/* The detail line follows whatever you are pointing at and holds still once
   you get there. It was a floating label over the pile first, which the
   pile's own overflow clipped, and which put a stepper inside a tooltip you
   had to chase with the mouse. */
const liveKey = ref(null);

const live = computed(() =>
  props.entries.find((e) => `${e.side}:${e.card.id}` === liveKey.value) ?? null
);

function point(entry) { liveKey.value = `${entry.side}:${entry.card.id}`; }
function unpoint()    { liveKey.value = null; }

function step(entry, by) {
  const next = Math.max(1, Math.min(entry.qty + by, entry.card.quantity ?? 99));
  emit("set", { side: entry.side, id: entry.card.id, qty: next });
}
</script>

<template>
  <div class="pp" :class="`pp--${layout}`">
    <div class="pp__row">
      <span class="pp__label">{{ t('proposeDialog.onTheTable') }}</span>

      <p v-if="!entries.length" class="pp__none">{{ emptyLabel }}</p>

      <div v-else class="pp__stack" @pointerleave="unpoint">
        <div
          v-for="entry in entries"
          :key="`${entry.side}:${entry.card.id}`"
          class="pp__card"
          :class="{ 'pp__card--live': liveKey === `${entry.side}:${entry.card.id}` }"
          :style="{ '--pp-tone': toneVar(entry.tone) }"
          tabindex="0"
          :aria-label="t('proposeDialog.pickedCardAria', { name: entry.card.name, count: entry.qty })"
          @pointerenter="point(entry)"
          @focus="point(entry)"
        >
          <img
            :src="cardImage(entry.card.image_id)"
            :alt="entry.card.name"
            loading="lazy"
            decoding="async"
          />
          <!-- A count only appears once there is more than one of something.
               An x1 on every card in the pile was noise. -->
          <span v-if="entry.qty > 1" class="pp__qty mono">×{{ entry.qty }}</span>
        </div>
      </div>

      <span v-if="total" class="pp__sum mono">
        <small>{{ totalLabel }}</small><span>{{ total }}</span>
      </span>
    </div>

    <div v-if="entries.length" class="pp__detail">
      <template v-if="live">
        <span class="pp__who">{{ live.card.name }}</span>
        <span class="pp__meta mono">{{
          [live.card.extension, live.card.rarity, live.card.condition].filter(Boolean).join(' · ') || '—'
        }}</span>

        <span class="pp__qtyrow">
          <button
            type="button" class="pp__step"
            :disabled="live.qty <= 1"
            :aria-label="t('proposeDialog.oneFewer', { name: live.card.name })"
            @click="step(live, -1)"
          ><v-icon icon="mdi-minus" size="15" /></button>

          <span class="pp__count mono">×{{ live.qty }}</span>

          <button
            type="button" class="pp__step"
            :disabled="live.qty >= (live.card.quantity ?? 99)"
            :aria-label="t('proposeDialog.oneMore', { name: live.card.name })"
            @click="step(live, 1)"
          ><v-icon icon="mdi-plus" size="15" /></button>

          <button
            type="button" class="pp__put"
            :aria-label="t('proposeDialog.putBackAria', { name: live.card.name })"
            @click="emit('remove', { side: live.side, id: live.card.id })"
          >{{ t('proposeDialog.putBack') }}</button>
        </span>
      </template>

      <p v-else class="pp__hint">{{ t('proposeDialog.pointAtACard') }}</p>
    </div>
  </div>
</template>

<style scoped>
.pp {
  border: 1px solid var(--c-border);
  border-radius: 12px;
  background: var(--c-surface);
  padding: 10px 12px;
  display: flex; flex-direction: column; gap: 8px;
  container-type: inline-size;
}
/* In a rail the pile is a panel, not a strip: the label sits on its own line,
   the cards take the height going spare, and the total drops to the bottom
   where it reads as a subtotal of what is above it. */
/* Panel is opt-in but width-decided. The prop says a host is willing to give
   the pile a column; the container query says whether it actually got one --
   below a thousand pixels the dialog stacks its rail under the binder, and a
   panel laid out for 360px would then stretch a two-card pile across the
   whole screen with the total marooned at the far end. */
.pp--panel { flex: 1; min-height: 0; }

@container (max-width: 520px) {
  .pp--panel .pp__row {
    flex: 1; min-height: 0;
    flex-direction: column; align-items: stretch; gap: 10px;
  }
  .pp--panel .pp__stack { align-content: flex-start; flex: 1; min-height: 0; overflow-y: auto; }
  .pp--panel .pp__label { order: -1; }
  .pp--panel .pp__sum {
    order: 1; margin-top: auto;
    display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
    padding-top: 6px;
  }
  .pp--panel .pp__sum small { display: inline; }
  .pp--panel .pp__none { flex: none; }
}

.mono { font-family: ui-monospace, SFMono-Regular, "Cascadia Code", Menlo, monospace; }

.pp__row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }

.pp__label {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--c-muted); white-space: nowrap;
}
.pp__none { margin: 0; font-size: 12.5px; color: var(--c-muted); flex: 1; }

.pp__stack {
  display: flex; align-items: flex-end; flex-wrap: wrap;
  flex: 1; min-width: 0; row-gap: 10px; padding: 4px 0 4px 19px;
}

.pp__card {
  position: relative; flex: 0 0 auto;
  width: 58px; aspect-ratio: 59 / 86;
  margin-left: -19px;
  border-radius: 5px; cursor: pointer;
  transition: transform 0.17s cubic-bezier(0.22, 1, 0.36, 1), margin 0.17s ease;
}
.pp__card:hover, .pp__card:focus-visible, .pp__card--live { transform: translateY(-8px); z-index: 5; }
.pp__card:focus-visible { outline: 2px solid var(--pp-tone); outline-offset: 2px; }
/* the pile opens a gap after whichever card you are pointing at */
.pp__card--live + .pp__card { margin-left: -6px; }

.pp__card img {
  width: 100%; height: 100%; display: block;
  border-radius: 5px; object-fit: contain;
  background: var(--c-surface-2);
  box-shadow: 0 3px 10px color-mix(in srgb, var(--c-text) 18%, transparent),
              0 0 0 1.5px var(--pp-tone);
}

.pp__qty {
  position: absolute; bottom: -6px; right: -6px; z-index: 6;
  min-width: 19px; height: 19px; padding: 0 4px; border-radius: 6px;
  background: var(--pp-tone); color: var(--c-on-accent);
  border: 2px solid var(--c-surface);
  font-size: 10px; font-weight: 700; line-height: 15px; text-align: center;
  font-variant-numeric: tabular-nums;
}

.pp__sum {
  font-size: 13.5px; font-weight: 800; color: var(--c-text);
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
.pp__sum small {
  display: block; font-size: 10px; font-weight: 700; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--c-muted);
}

/* The detail slot keeps its height whether or not anything is in it, so
   pointing along the pile does not make the dialog jump. */
.pp__detail {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  min-height: 34px;
  border-top: 1px solid color-mix(in srgb, var(--c-border) 55%, transparent);
  padding-top: 8px;
}
.pp__hint { margin: 0; font-size: 12px; color: var(--c-muted); }
.pp__who { font-size: 13px; font-weight: 700; color: var(--c-text); }
.pp__meta {
  font-size: 11px; color: var(--c-muted); font-variant-numeric: tabular-nums;
}

.pp__qtyrow { display: flex; align-items: center; gap: 5px; margin-left: auto; }
.pp__step {
  width: 28px; height: 28px; border-radius: 7px;
  border: 1.5px solid var(--c-border); background: transparent;
  color: var(--c-text); cursor: pointer; display: grid; place-items: center;
  transition: background 0.15s ease;
}
.pp__step:hover:not(:disabled) { background: var(--c-surface-2); }
.pp__step:disabled { opacity: 0.35; cursor: default; }
.pp__step:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

.pp__count {
  min-width: 28px; text-align: center;
  font-size: 12px; font-weight: 700; color: var(--c-text);
  font-variant-numeric: tabular-nums;
}

/* Pink, because putting a card back is undoing a want, and pink is the
   colour of wanting in this system. */
.pp__put {
  margin-left: 6px; height: 28px; padding: 0 11px; border-radius: 7px;
  border: 1px solid color-mix(in srgb, var(--c-accent) 42%, transparent);
  background: color-mix(in srgb, var(--c-accent) 12%, transparent);
  color: var(--c-accent); font-size: 11.5px; font-weight: 700; cursor: pointer;
}
.pp__put:hover { background: color-mix(in srgb, var(--c-accent) 20%, transparent); }
.pp__put:focus-visible { outline: 2px solid var(--c-accent); outline-offset: 2px; }

@media (pointer: coarse) {
  .pp__step { width: 44px; height: 44px; }
  .pp__put { height: 44px; }
}

@media (prefers-reduced-motion: reduce) {
  .pp__card { transition: none; }
  .pp__card:hover, .pp__card:focus-visible, .pp__card--live { transform: none; }
}
</style>
