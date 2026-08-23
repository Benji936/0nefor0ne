<script setup>
// "Which one is yours?"
//
// The question a name-only card row cannot answer for itself. 78% of rows in
// this database have no print code, because bulk add writes extension '' -- so
// they price as a range across every printing the card has ever had, which for
// Albion the Sanctifire Dragon is 0.21 to 30.47 euros. Answering this once
// turns that into 0.21 to 6.52, and usually into a single figure.
//
// The prices are the point of the list, not decoration on it. Somebody looking
// for their own copy recognises it faster by what it is worth than by a set
// name they may never have learned -- a 40 cent Common and a 30 euro Collector's
// Rare are obviously different objects, where "Maze of Millennia" and "Rarity
// Collection II" are two phrases.
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { fetchPrintings, setCardPrinting } from "@/lib/printings";
import CardPrice from "@/components/trade/CardPrice.vue";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  card: { type: Object, default: null },
});
const emit = defineEmits(["update:modelValue", "picked"]);

const { t } = useI18n();

const printings = ref([]);
const loading = ref(false);
const saving = ref(null);

watch(() => props.modelValue, async (open) => {
  if (!open || !props.card?.name) return;
  loading.value = true;
  printings.value = [];
  try {
    printings.value = await fetchPrintings(props.card.name);
  } finally {
    loading.value = false;
  }
});

async function pick(printing) {
  if (saving.value) return;
  saving.value = printing.printCode;
  const ok = await setCardPrinting(props.card.id, printing);
  saving.value = null;
  if (!ok) return;
  emit("picked", { cardId: props.card.id, printing });
  emit("update:modelValue", false);
}

const close = () => emit("update:modelValue", false);
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="520"
    scrollable
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="pp">
      <header class="pp__head">
        <div class="min-w-0">
          <p class="pp__eyebrow">{{ t('price.whichPrinting') }}</p>
          <h2 class="pp__title">{{ card?.name }}</h2>
        </div>
        <button type="button" class="pp__close" :aria-label="t('common.close')" @click="close">
          <v-icon icon="mdi-close" size="18" />
        </button>
      </header>

      <div v-if="loading" class="pp__body">
        <div v-for="i in 4" :key="i" class="pp__sk" />
      </div>

      <!-- Neither catalogue knows this card. Saying so beats a list of blanks
           that implies the answer is in there somewhere. -->
      <p v-else-if="!printings.length" class="pp__empty">{{ t('price.noPrintings') }}</p>

      <div v-else class="pp__body" role="list">
        <button
          v-for="p in printings"
          :key="p.printCode"
          type="button"
          role="listitem"
          class="pp__row"
          :disabled="saving !== null"
          @click="pick(p)"
        >
          <span class="pp__code">{{ p.printCode }}</span>
          <span class="pp__meta">
            <span class="pp__set">{{ p.setName }}</span>
            <span v-if="p.rarity" class="pp__rarity">{{ p.rarity }}</span>
          </span>
          <CardPrice v-if="p.price" :price="p.price" size="sm" class="shrink-0" />
          <span v-else class="pp__noprice">{{ t('price.noPrice') }}</span>
        </button>
      </div>
    </div>
  </v-dialog>
</template>

<style scoped>
.pp {
  display: flex; flex-direction: column; min-height: 0;
  background: var(--c-surface); color: var(--c-text);
  border: 1px solid var(--c-border); border-radius: 16px; overflow: hidden;
}

.pp__head {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 16px 16px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--c-border) 55%, transparent);
}
.pp__eyebrow {
  margin: 0 0 3px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.16em; color: var(--c-muted);
}
.pp__title { margin: 0; font-size: 17px; font-weight: 700; line-height: 1.25; }
.pp__close {
  margin-left: auto; flex-shrink: 0;
  width: 32px; height: 32px; border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
  background: transparent; border: 1px solid transparent;
  color: var(--c-muted); cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.pp__close:hover { background: var(--c-surface-2); color: var(--c-text); }
.pp__close:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

.pp__body { display: flex; flex-direction: column; padding: 8px; gap: 2px; overflow-y: auto; }

/* One row per printing: the print code first because that is the identifier a
   collector reads off the card in their hand (DESIGN.md, The Mono Identifier
   Rule), then what it is, then what it is worth. */
.pp__row {
  display: flex; align-items: center; gap: 12px;
  width: 100%; min-height: 46px; padding: 8px 10px;
  border-radius: 10px; border: 1px solid transparent;
  background: transparent; text-align: left; cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.pp__row:hover:not(:disabled) {
  background: color-mix(in srgb, var(--c-trade) 7%, transparent);
  border-color: color-mix(in srgb, var(--c-trade) 35%, transparent);
}
.pp__row:focus-visible { outline: 2px solid var(--c-trade); outline-offset: -2px; }
.pp__row:disabled { opacity: 0.5; cursor: default; }

.pp__code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px; font-weight: 700; color: var(--c-text);
  white-space: nowrap; flex-shrink: 0;
}
.pp__meta { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
.pp__set    { font-size: 12px; color: var(--c-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pp__rarity { font-size: 10.5px; font-weight: 600; color: var(--c-muted); }
.pp__noprice { font-size: 11px; font-weight: 600; color: var(--c-muted); white-space: nowrap; }

.pp__empty { margin: 0; padding: 28px 16px; text-align: center; font-size: 13px; color: var(--c-muted); }

.pp__sk {
  height: 46px; border-radius: 10px; background: var(--c-skeleton);
  animation: pp-pulse 1.2s ease-in-out infinite;
}
@keyframes pp-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.55 } }

@media (pointer: coarse) { .pp__row { min-height: 52px; } .pp__close { width: 44px; height: 44px; } }
@media (prefers-reduced-motion: reduce) {
  .pp__row, .pp__close { transition: none; }
  .pp__sk { animation: none; }
}
</style>
