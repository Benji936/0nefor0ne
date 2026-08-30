<script setup>
/**
 * Correct a copy already in the collection.
 *
 * Deliberately the same five fields, in the same order, as AddCard's second
 * step: the form that recorded the mistake is the form that fixes it, so there
 * is nothing new to learn at the moment you have just noticed you were wrong.
 * What it adds is the two things the add form has no reason to know — how many
 * copies are already committed to accepted trades, and that moving a printing
 * has to release the Cardmarket product the old printing was pinned to.
 *
 * Removing lives here too. Until now the only way out of the collection was to
 * decrement the quantity to zero and let the page notice, which is a deletion
 * disguised as arithmetic.
 */
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { cardImage } from "@/lib/cardImage";
import { searchById } from "@/api";
import { getClient } from "@/lib/supabaseClient";
import {
  CONDITIONS, LANGUAGES, printingOptions, parsePrinting,
  buildCopyPatch, isCopyUnchanged, printingLabel,
} from "@/lib/cardCopy";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  card:       { type: Object,  default: null },
});
const emit = defineEmits(["update:modelValue", "saved", "deleted"]);

const { t } = useI18n();

const printing  = ref(null);
const language  = ref("English");
const condition = ref("Near Mint");
const firstEd   = ref(false);
const quantity  = ref(1);

const printings = ref([]);
const loadingPrintings = ref(false);
const reserved = ref(0);
const saving   = ref(false);
const removing = ref(false);
const confirmRemove = ref(false);
const errorMessage  = ref("");

/** The half of the binder this copy sits in decides the dialog's colour. */
const tone = computed(() => (props.card?.wish ? "var(--c-accent)" : "var(--c-trade)"));

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v),
});

/** Reserved copies are a floor, not a warning: below it a card would be
 *  promised twice. Mirrors CardElement's own minQuantity. */
async function loadReserved(cardId) {
  reserved.value = 0;
  try {
    const { data } = await getClient()
      .from("Card").select("quantity")
      .eq("locked_original_card_id", cardId).eq("status", "locked");
    reserved.value = (data ?? []).reduce((sum, r) => sum + (r.quantity ?? 0), 0);
  } catch { reserved.value = 0; }
}

/** Every printing this card was ever released in, so a wrong one can be
 *  swapped for the right one rather than deleted and re-added. */
async function loadPrintings(card) {
  loadingPrintings.value = true;
  printings.value = [];
  try {
    const res = await searchById(card.image_id);
    const found = res?.data?.data?.[0] ?? (Array.isArray(res?.data) ? res.data[0] : null);
    printings.value = printingOptions(found);
    // Keep whatever the copy already claims, even when YGOPRODeck does not
    // list it — a bulk-added row can carry a code this lookup never returns,
    // and dropping it would silently blank the field.
    const current = card.extension
      ? printingLabel({ set_code: card.extension, set_rarity: card.rarity ?? "" }).replace(/ \|\s*$/, "")
      : null;
    if (current && !printings.value.includes(current)) printings.value.unshift(current);
    printing.value = current;
  } finally {
    loadingPrintings.value = false;
  }
}

watch(() => [props.modelValue, props.card?.id], ([isOpen]) => {
  if (!isOpen || !props.card) return;
  const c = props.card;
  language.value  = c.language  ?? "English";
  condition.value = c.condition ?? "Near Mint";
  firstEd.value   = !!c.first_edition;
  quantity.value  = c.quantity ?? 1;
  errorMessage.value = "";
  confirmRemove.value = false;
  loadPrintings(c);
  loadReserved(c.id);
}, { immediate: true });

const errorFor = {
  printing: () => t("editCard.needPrinting"),
  quantity: () => t("editCard.needQuantity"),
  reserved: () => t("editCard.reservedFloor", { count: reserved.value }),
};

async function save() {
  if (saving.value || !props.card) return;
  errorMessage.value = "";

  const { extension, rarity } = parsePrinting(printing.value ?? "");
  const { patch, errors } = buildCopyPatch(
    props.card,
    { extension, rarity, language: language.value, condition: condition.value,
      first_edition: firstEd.value, quantity: Number(quantity.value) },
    reserved.value,
  );

  if (errors.length) { errorMessage.value = errorFor[errors[0]](); return; }
  if (isCopyUnchanged(props.card, patch)) { open.value = false; return; }

  saving.value = true;
  const { data, error } = await getClient()
    .from("Card").update(patch).eq("id", props.card.id).select().single();
  saving.value = false;

  if (error) { errorMessage.value = error.message ?? t("editCard.saveFailed"); return; }
  emit("saved", data);
  open.value = false;
}

async function remove() {
  if (removing.value || !props.card) return;
  if (reserved.value > 0) { errorMessage.value = t("editCard.reservedRemove"); return; }
  removing.value = true;
  const { error } = await getClient().from("Card").delete().eq("id", props.card.id);
  removing.value = false;
  if (error) { errorMessage.value = error.message ?? t("editCard.saveFailed"); return; }
  emit("deleted", props.card.id);
  open.value = false;
}
</script>

<template>
  <v-dialog v-model="open" max-width="520" scrollable>
    <div v-if="card" class="ec">
      <!-- Banner in the colour of the half this copy sits in, so the dialog
           never leaves you unsure which pile you are editing. -->
      <header class="ec__head" :style="{ background: tone }">
        <v-icon :icon="card.wish ? 'mdi-heart' : 'mdi-cards-outline'" size="20" />
        <div class="ec__headtext">
          <p class="ec__title">{{ t('editCard.title') }}</p>
          <p class="ec__sub">{{ card.name }}</p>
        </div>
        <button type="button" class="ec__x" :aria-label="t('common.cancel')" @click="open = false">
          <v-icon icon="mdi-close" size="20" />
        </button>
      </header>

      <div class="ec__body">
        <div class="ec__card">
          <img :src="cardImage(card.image_id)" :alt="card.name" class="ec__art" />
          <div class="ec__facts">
            <p class="ec__name">{{ card.name }}</p>
            <p class="ec__code">{{ card.extension }}</p>
          </div>
        </div>

        <v-select
          v-model="printing"
          :items="printings"
          :loading="loadingPrintings"
          :label="t('addCard.extensionRarity')"
          density="comfortable"
          variant="outlined"
          hide-details
        />

        <v-select
          v-model="language"
          :items="LANGUAGES"
          :label="t('addCard.language')"
          density="comfortable"
          variant="outlined"
          hide-details
        />

        <div class="ec__row">
          <v-select
            v-model="condition"
            :items="CONDITIONS"
            :label="t('addCard.condition')"
            density="comfortable"
            variant="outlined"
            hide-details
            class="grow"
          />
          <v-checkbox
            v-model="firstEd"
            label="1st Ed."
            density="comfortable"
            hide-details
            :color="tone"
          />
        </div>

        <v-number-input
          v-model="quantity"
          :label="t('addCard.quantity')"
          :min="Math.max(1, reserved)"
          density="comfortable"
          variant="outlined"
          control-variant="split"
          hide-details
        />

        <!-- Says why the floor is where it is, rather than letting a stepper
             refuse to go lower without explaining itself. -->
        <p v-if="reserved > 0" class="ec__note">
          <v-icon icon="mdi-lock-outline" size="13" />
          {{ t('editCard.reservedFloor', { count: reserved }) }}
        </p>

        <p v-if="errorMessage" class="ec__err">{{ errorMessage }}</p>
      </div>

      <footer class="ec__foot">
        <button
          v-if="!confirmRemove"
          type="button"
          class="ec__remove"
          :disabled="reserved > 0"
          :title="reserved > 0 ? t('editCard.reservedRemove') : ''"
          @click="confirmRemove = true"
        >
          <v-icon icon="mdi-trash-can-outline" size="15" />
          {{ t('editCard.remove') }}
        </button>
        <button v-else type="button" class="ec__remove ec__remove--armed" :disabled="removing" @click="remove">
          {{ removing ? t('editCard.removing') : t('editCard.removeConfirm') }}
        </button>

        <span class="ec__spacer" />

        <button type="button" class="ec__btn" @click="open = false">{{ t('common.cancel') }}</button>
        <button
          type="button"
          class="ec__btn ec__btn--go"
          :style="{ background: tone }"
          :disabled="saving"
          @click="save"
        >{{ saving ? t('editCard.saving') : t('editCard.save') }}</button>
      </footer>
    </div>
  </v-dialog>
</template>

<style scoped>
.ec {
  background: var(--c-surface);
  color: var(--c-text);
  border-radius: 16px;
  overflow: hidden;
}

.ec__head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  /* Never a literal white: the brand colours invert between themes
     (DESIGN.md, The Label Contrast Rule). */
  color: var(--c-on-accent);
}
.ec__headtext { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.ec__title { margin: 0; font-weight: 700; font-size: 0.95rem; line-height: 1.2; }
.ec__sub {
  margin: 0; font-size: 0.75rem; opacity: 0.85;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ec__x {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 8px;
  color: var(--c-on-accent); background: transparent; cursor: pointer;
}
.ec__x:hover { background: rgb(0 0 0 / 0.15); }
.ec__x:focus-visible { outline: 2px solid var(--c-on-accent); outline-offset: 2px; }

.ec__body { display: flex; flex-direction: column; gap: 14px; padding: 18px 16px; }

.ec__card {
  display: flex; align-items: center; gap: 12px;
  padding: 10px; border-radius: 12px;
  background: var(--c-surface-2);
  border: 1px solid var(--c-border);
}
.ec__art { width: 46px; aspect-ratio: 59 / 86; object-fit: contain; border-radius: 4px; flex-shrink: 0; }
.ec__facts { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.ec__name {
  margin: 0; font-weight: 700; font-size: 0.85rem; line-height: 1.25;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* A set code is an identifier (DESIGN.md, The Mono Identifier Rule). */
.ec__code {
  margin: 0;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.7rem; letter-spacing: 0.06em;
  color: var(--c-muted);
}

.ec__row { display: flex; align-items: center; gap: 14px; }

.ec__note {
  display: flex; align-items: center; gap: 6px;
  margin: 0; font-size: 0.72rem; color: var(--c-muted);
}
.ec__err {
  margin: 0; font-size: 0.78rem; font-weight: 600;
  color: var(--c-accent);
}

.ec__foot {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--c-border);
  background: var(--c-surface);
  flex-wrap: wrap;
}
.ec__spacer { flex: 1; }

.ec__btn {
  padding: 8px 16px; border-radius: 10px;
  font-size: 0.82rem; font-weight: 700;
  color: var(--c-muted); background: transparent; cursor: pointer;
}
.ec__btn:hover { color: var(--c-text); background: var(--c-surface-2); }
.ec__btn--go { color: var(--c-on-accent); }
.ec__btn--go:hover { color: var(--c-on-accent); filter: brightness(1.08); }
.ec__btn:disabled { opacity: 0.6; cursor: default; }
.ec__btn:focus-visible,
.ec__remove:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

/* Removal is pink, the colour this system already gives to cancellation
   (DESIGN.md, The Three-Role Rule), and quiet until it is armed. */
.ec__remove {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 12px; border-radius: 10px;
  font-size: 0.78rem; font-weight: 700;
  color: var(--c-muted); background: transparent; cursor: pointer;
}
.ec__remove:hover:not(:disabled) {
  color: var(--c-accent);
  background: color-mix(in srgb, var(--c-accent) 10%, transparent);
}
.ec__remove:disabled { opacity: 0.45; cursor: not-allowed; }
.ec__remove--armed {
  color: var(--c-on-accent);
  background: var(--c-accent);
}
.ec__remove--armed:hover:not(:disabled) { color: var(--c-on-accent); filter: brightness(1.08); }
</style>
