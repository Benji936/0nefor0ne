<script setup>
/**
 * Address input with place suggestions (ARIA combobox pattern).
 *
 * Free text is always allowed: the suggestions are a shortcut, never a
 * requirement, so the field stays usable if the geocoder is slow, blocked or
 * simply has no row for the venue.
 *
 * Nominatim's usage policy forbids a request per keystroke, so lookups are
 * debounced and any in-flight request is aborted when a newer one starts.
 */
import { ref, computed, watch, onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import { searchPlaces, MIN_QUERY } from "@/lib/geocode";

const DEBOUNCE_MS = 450;

const props = defineProps({
  modelValue: { type: String, default: "" },
  placeholder: { type: String, default: "" },
  id: { type: String, default: null },
});
const emit = defineEmits(["update:modelValue", "selected"]);
const { t, locale } = useI18n();

const results   = ref([]);
const open      = ref(false);
const loading   = ref(false);
const activeIdx = ref(-1);
const rootRef   = ref(null);
const inputRef  = ref(null);

let timer = null;
let controller = null;
// Set while we write the model ourselves, so committing a pick does not
// immediately re-open the list with a fresh search for the text we just chose.
let suppress = false;

const listId = computed(() => `${props.id || "place"}-listbox`);

function cancelPending() {
  clearTimeout(timer);
  if (controller) { controller.abort(); controller = null; }
}

async function run(q) {
  cancelPending();
  controller = new AbortController();
  loading.value = true;
  try {
    const rows = await searchPlaces(q, { signal: controller.signal, locale: locale.value });
    results.value = rows;
    open.value = rows.length > 0;
    activeIdx.value = -1;
  } catch (e) {
    if (e?.name !== "AbortError") { results.value = []; open.value = false; }
  } finally {
    // A newer request may already be in flight; only it may clear the spinner.
    if (controller?.signal.aborted !== true) loading.value = false;
  }
}

function onInput(e) {
  const v = e.target.value;
  emit("update:modelValue", v);
  cancelPending();
  if (v.trim().length < MIN_QUERY) {
    results.value = []; open.value = false; loading.value = false;
    return;
  }
  timer = setTimeout(() => run(v), DEBOUNCE_MS);
}

function choose(p) {
  suppress = true;
  emit("update:modelValue", p.value);
  emit("selected", p);
  cancelPending();
  open.value = false;
  results.value = [];
  activeIdx.value = -1;
  loading.value = false;
}

function onKeydown(e) {
  if (!open.value || !results.value.length) {
    // Re-open on ArrowDown when we already have results for the current text.
    if (e.key === "ArrowDown" && results.value.length) { open.value = true; e.preventDefault(); }
    return;
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeIdx.value = (activeIdx.value + 1) % results.value.length;
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    activeIdx.value = activeIdx.value <= 0 ? results.value.length - 1 : activeIdx.value - 1;
  } else if (e.key === "Enter") {
    // Only swallow Enter when a suggestion is actually highlighted, so Enter
    // with free text still submits the surrounding form.
    if (activeIdx.value >= 0) { e.preventDefault(); choose(results.value[activeIdx.value]); }
  } else if (e.key === "Escape") {
    open.value = false;
    activeIdx.value = -1;
  }
}

function onDocClick(ev) {
  if (rootRef.value && !rootRef.value.contains(ev.target)) open.value = false;
}
watch(open, (v) => {
  if (v) document.addEventListener("click", onDocClick);
  else document.removeEventListener("click", onDocClick);
});

// The parent may reset the field (dialog re-open); drop any stale list.
watch(() => props.modelValue, () => {
  if (suppress) { suppress = false; return; }
});

onBeforeUnmount(() => {
  cancelPending();
  document.removeEventListener("click", onDocClick);
});
</script>

<template>
  <div ref="rootRef" class="pa">
    <div class="pa__field">
      <input
        :id="id"
        ref="inputRef"
        :value="modelValue"
        type="text"
        class="field-input pa__input"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="open"
        :aria-controls="listId"
        :aria-activedescendant="activeIdx >= 0 ? `${listId}-${activeIdx}` : null"
        autocomplete="off"
        :placeholder="placeholder"
        @input="onInput"
        @keydown="onKeydown"
      />
      <v-progress-circular
        v-if="loading"
        class="pa__spin"
        indeterminate
        size="15"
        width="2"
        color="var(--c-trade)"
      />
      <v-icon v-else class="pa__spin" icon="mdi-map-search-outline" size="16" />

    <!-- Anchored to the field, not the component root, so the credit line
         below never pushes the dropdown away from the input. -->
    <ul v-if="open && results.length" :id="listId" class="pa__list" role="listbox">
      <li
        v-for="(p, i) in results"
        :id="`${listId}-${i}`"
        :key="p.id"
        class="pa__opt"
        :class="{ 'pa__opt--active': i === activeIdx }"
        role="option"
        :aria-selected="i === activeIdx"
        @mouseenter="activeIdx = i"
        @mousedown.prevent="choose(p)"
      >
        <v-icon icon="mdi-map-marker-outline" size="15" class="pa__opt-icon" />
        <span class="pa__opt-text">
          <span class="pa__opt-primary">{{ p.primary }}</span>
          <span v-if="p.secondary" class="pa__opt-secondary">{{ p.secondary }}</span>
        </span>
      </li>
    </ul>
    </div>

    <p class="pa__credit">{{ t('community.placeCredit') }}</p>
  </div>
</template>

<style scoped>
.pa { position: relative; }
.pa__field { position: relative; display: flex; align-items: center; }

/* The host dialog's .field-input is scoped to the dialog, so it cannot style
   this child's input. Mirror it here to keep the field visually identical. */
.pa__input {
  width: 100%;
  background: var(--c-surface);
  border: 1.5px solid var(--c-border);
  border-radius: 12px;
  padding: 10px 36px 10px 13px;  /* room for the trailing status icon */
  font-size: 13.5px;
  color: var(--c-text);
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.pa__input:focus {
  border-color: var(--c-trade);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-trade) 15%, transparent);
}
.pa__input::placeholder { color: var(--c-muted); opacity: 0.5; font-size: 13px; }
.pa__spin { position: absolute; right: 12px; color: var(--c-muted); pointer-events: none; }

.pa__list {
  position: absolute; top: calc(100% + 5px); left: 0; right: 0; z-index: 30;
  margin: 0; padding: 5px; list-style: none;
  max-height: 260px; overflow-y: auto;
  background: var(--c-surface);
  border: 1.5px solid var(--c-border); border-radius: 13px;
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.36);
  scrollbar-width: thin;
}
.pa__opt {
  display: flex; align-items: flex-start; gap: 9px;
  padding: 9px 10px; border-radius: 9px; cursor: pointer;
}
.pa__opt--active { background: color-mix(in srgb, var(--c-trade) 15%, transparent); }
.pa__opt-icon { color: var(--c-trade); flex-shrink: 0; margin-top: 1px; }
.pa__opt-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.pa__opt-primary { font-size: 13px; font-weight: 700; color: var(--c-text); }
.pa__opt-secondary {
  font-size: 11.5px; color: var(--c-muted); line-height: 1.35;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.pa__credit { margin: 5px 0 0; font-size: 10px; color: var(--c-muted); opacity: 0.65; }
</style>
