<script setup>
// Where a card's market links live now.
//
// They used to sit under every row, three links per card, on every card in the
// pile. In a binder there is no room for that and no reason for it: the links
// matter for the one card you are weighing up, not for all two hundred. Right
// click, long press, or the context key raises this sheet for that card.
//
// Long press fires `contextmenu` on both iOS and Android, so the binder's one
// handler covers finger and pointer without a touch-specific path.
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { cardImage } from "@/lib/cardImage";
import CardPrice from "@/components/trade/CardPrice.vue";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  card:       { type: Object, default: null },
});

const emit = defineEmits(["update:modelValue"]);

const { t } = useI18n();

const meta = computed(() => {
  const c = props.card;
  if (!c) return "";
  return [c.extension, c.rarity, c.condition, c.language].filter(Boolean).join(" · ");
});

const links = computed(() => {
  const c = props.card;
  if (!c?.name) return [];
  const q = encodeURIComponent(c.name);
  // Cardmarket is searched by print code when we have one: a set code lands on
  // the exact product, where the card name lands on every printing of it.
  return [
    {
      label: "Cardmarket",
      icon: "mdi-currency-eur",
      url: c.extension
        ? `https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=${encodeURIComponent(c.extension)}`
        : `https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=${q}`,
    },
    { label: "TCGPlayer", icon: "mdi-cards-outline", url: `https://www.tcgplayer.com/search/yugioh/product?q=${q}` },
    { label: "eBay",      icon: "mdi-tag-outline",   url: `https://www.ebay.com/sch/i.html?_nkw=${q}+yugioh` },
  ];
});
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    max-width="360"
  >
    <v-card v-if="card" class="ls" style="background-color: var(--c-surface); color: var(--c-text)">
      <div class="ls__in">
        <div class="ls__head">
          <img
            :src="cardImage(card.image_id)"
            :alt="card.name"
            class="ls__art"
            loading="lazy"
            decoding="async"
          />
          <div class="ls__title">
            <p class="ls__name">{{ card.name }}</p>
            <p class="ls__meta mono">{{ meta || '—' }}</p>
            <CardPrice v-if="card.price" :price="card.price" size="sm" class="ls__price" />
          </div>
          <v-btn
            icon="mdi-close" variant="text" density="compact"
            :aria-label="t('common.close')"
            @click="emit('update:modelValue', false)"
          />
        </div>

        <p class="ls__lead">{{ t('proposeDialog.checkThePrice') }}</p>

        <div class="ls__links">
          <a
            v-for="l in links" :key="l.label"
            :href="l.url" target="_blank" rel="noopener noreferrer"
            class="ls__link"
          >
            <v-icon :icon="l.icon" size="16" aria-hidden="true" />
            {{ l.label }}
            <v-icon icon="mdi-open-in-new" size="13" class="ls__out" aria-hidden="true" />
          </a>
        </div>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.ls { border: 1px solid var(--c-border); border-radius: 14px; }
.mono { font-family: ui-monospace, SFMono-Regular, "Cascadia Code", Menlo, monospace; }

.ls__in { display: flex; flex-direction: column; gap: 12px; padding: 14px; }

.ls__head { display: flex; gap: 12px; align-items: flex-start; }

.ls__art {
  width: 54px; aspect-ratio: 59 / 86; height: auto; flex-shrink: 0;
  border-radius: 5px; object-fit: contain;
  background: var(--c-surface-2);
  outline: 1px solid color-mix(in srgb, var(--c-border) 45%, transparent);
}

.ls__title { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
.ls__name { margin: 0; font-size: 15px; font-weight: 700; line-height: 1.25; color: var(--c-text); }
.ls__meta { margin: 0; font-size: 11px; color: var(--c-muted); }
.ls__price { margin-top: 2px; }

.ls__lead { margin: 0; font-size: 12.5px; color: var(--c-muted); }

.ls__links { display: flex; flex-direction: column; gap: 6px; }
.ls__link {
  display: flex; align-items: center; gap: 9px;
  min-height: 42px; padding: 0 12px; border-radius: 10px;
  border: 1px solid var(--c-border);
  background: var(--c-surface-2);
  color: var(--c-text); text-decoration: none;
  font-size: 13.5px; font-weight: 600;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.ls__link:hover {
  border-color: color-mix(in srgb, var(--c-trade) 55%, transparent);
  background: color-mix(in srgb, var(--c-trade) 10%, transparent);
}
.ls__link:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }
.ls__out { margin-left: auto; color: var(--c-muted); }

@media (prefers-reduced-motion: reduce) { .ls__link { transition: none; } }
</style>
