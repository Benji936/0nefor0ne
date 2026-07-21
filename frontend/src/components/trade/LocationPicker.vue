<script setup>
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { loadMeetupPlaces, searchPlaces, getMyPosition, distanceKm } from "@/lib/otsLocations";

const props = defineProps({
  modelValue:       { type: Object, default: null },        // chosen Place or null
  deliveryMode:     { type: String, default: "location" },  // 'location' | 'mail'
  counterpartyName: { type: String, default: "" },
});
const emit = defineEmits(["update:modelValue", "update:deliveryMode"]);
const { t } = useI18n();

const allPlaces = ref([]);
const loaded = ref(false);
const query = ref("");
const origin = ref(null);      // {lat,lng} once "near me" used
const geoError = ref("");
const loadingGeo = ref(false);
const geoAsked = ref(false);   // we only ever auto-request position once
const pickerOpen = ref(false); // controls the search modal

async function ensureLoaded() {
  if (loaded.value) return;
  const places = await loadMeetupPlaces();
  allPlaces.value = places;
  if (places.length > 0) loaded.value = true;
}

// Warm the list as soon as we're in location mode so the modal opens instantly.
watch(() => props.deliveryMode, (m) => { if (m === "location") ensureLoaded(); }, { immediate: true });

const ranked = computed(() => searchPlaces(allPlaces.value, query.value, origin.value));
const stores = computed(() => ranked.value.filter((p) => p.source === "store").slice(0, 30));
const events = computed(() => ranked.value.filter((p) => p.source === "event").slice(0, 15));
const hasResults = computed(() => stores.value.length > 0 || events.value.length > 0);

async function useNearMe() {
  geoAsked.value = true;
  geoError.value = "";
  loadingGeo.value = true;
  try {
    await ensureLoaded();
    origin.value = await getMyPosition();
  } catch {
    geoError.value = t("proposeDialog.locationDenied");
  } finally {
    loadingGeo.value = false;
  }
}

function openPicker() {
  ensureLoaded();
  pickerOpen.value = true;
  // Nearest-first is the default way to pick a place, so ask for position as
  // soon as the picker opens. Only once per session: if the user denies it,
  // reopening shouldn't re-prompt them. The near-me button stays as the retry.
  if (!geoAsked.value) useNearMe();
}
function pick(place) {
  emit("update:modelValue", place);
  pickerOpen.value = false;   // selecting a place closes the modal
}
function clearPick() { emit("update:modelValue", null); }
function setMode(mode) {
  emit("update:deliveryMode", mode);
  if (mode === "mail") emit("update:modelValue", null);
}
// Locality line under a place name. Asian store addresses have no consistent
// city/state format, so the scraper leaves those fields null rather than guess;
// falling back to country keeps the row from rendering a blank second line.
function placeSubtitle(place) {
  return [place.city, place.state].filter(Boolean).join(", ")
    || place.country
    || place.address
    || "";
}
function distLabel(place) {
  const d = origin.value ? distanceKm(origin.value, place) : null;
  return d == null ? null : t("proposeDialog.kmAway", { km: Math.round(d) });
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <p class="text-[11px] font-bold uppercase tracking-widest" style="color: var(--c-muted)">
      {{ t('proposeDialog.meetupLocation') }}
    </p>

    <!-- Mode toggle -->
    <div class="flex gap-2">
      <button
        type="button"
        class="flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-lg text-xs font-semibold border transition-all cursor-pointer"
        :style="deliveryMode === 'location'
          ? { backgroundColor: 'var(--c-trade)', borderColor: 'var(--c-trade)', color: 'white' }
          : { backgroundColor: 'transparent', borderColor: 'var(--c-border)', color: 'var(--c-muted)' }"
        @click="setMode('location')"
      >
        <v-icon icon="mdi-map-marker-outline" size="14" />{{ t('proposeDialog.meetAtLocation') }}
      </button>
      <button
        type="button"
        class="flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-lg text-xs font-semibold border transition-all cursor-pointer"
        :style="deliveryMode === 'mail'
          ? { backgroundColor: 'var(--c-trade)', borderColor: 'var(--c-trade)', color: 'white' }
          : { backgroundColor: 'transparent', borderColor: 'var(--c-border)', color: 'var(--c-muted)' }"
        @click="setMode('mail')"
      >
        <v-icon icon="mdi-package-variant-closed" size="14" />{{ t('proposeDialog.shipByMail') }}
      </button>
    </div>

    <!-- Compact trigger / selected summary (heavy UI lives in the modal below) -->
    <template v-if="deliveryMode === 'location'">
      <!-- Selected place: click to change, x to clear -->
      <div
        v-if="modelValue"
        role="button"
        tabindex="0"
        class="flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer"
        style="border-color: var(--c-mutual); background-color: color-mix(in srgb, var(--c-mutual) 10%, transparent)"
        @click="openPicker"
        @keydown.enter="openPicker"
        @keydown.space.prevent="openPicker"
      >
        <v-icon icon="mdi-map-marker-check" size="16" color="var(--c-mutual)" />
        <div class="flex flex-col grow min-w-0">
          <span class="text-xs font-semibold truncate" style="color: var(--c-text)">{{ modelValue.name }}</span>
          <span class="text-[11px] truncate" style="color: var(--c-muted)">{{ modelValue.address || modelValue.city }}</span>
        </div>
        <v-btn icon="mdi-close" size="x-small" variant="text" color="white" @click.stop="clearPick" />
      </div>

      <!-- No selection yet: single-line trigger -->
      <button
        v-else
        type="button"
        class="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors hover:bg-[var(--c-surface-2)]"
        style="border-color: var(--c-border); color: var(--c-muted)"
        @click="openPicker"
      >
        <v-icon icon="mdi-map-marker-plus-outline" size="16" color="var(--c-trade)" />
        <span class="grow text-left">{{ t('proposeDialog.chooseLocation') }}</span>
        <v-icon icon="mdi-chevron-right" size="16" />
      </button>
    </template>

    <!-- Search modal -->
    <v-dialog v-model="pickerOpen" max-width="560" scrollable>
      <v-card theme="dark" style="background-color: var(--c-surface); color: var(--c-text)">
        <!-- Header -->
        <div class="flex items-center gap-2 px-4 py-3 border-b" style="border-color: var(--c-border)">
          <v-icon icon="mdi-map-marker-radius-outline" size="18" color="var(--c-trade)" />
          <span class="font-bold text-sm grow" style="color: var(--c-text)">{{ t('proposeDialog.meetupLocation') }}</span>
          <v-btn icon="mdi-close" size="small" variant="text" color="white" @click="pickerOpen = false" />
        </div>

        <!-- px-/py- rather than p-: Vuetify's global reset is unlayered, so it
             beats Tailwind's @layer utilities. Only the Tailwind classes Vuetify
             also ships (px-*, py-*, pt-* … integers) survive; p-* and .5 steps
             silently collapse to 0. -->
        <div class="px-4 py-4 flex flex-col gap-3">
          <!-- Search + near me -->
          <div class="flex gap-2 items-center">
            <div class="grow">
              <input
                v-model="query"
                :placeholder="t('proposeDialog.searchPlaces')"
                class="w-full rounded-lg px-3 py-2 text-sm outline-none border"
                :style="{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }"
                @focus="ensureLoaded"
              />
            </div>
            <v-btn
              size="small" variant="flat"
              :prepend-icon="origin ? 'mdi-crosshairs-gps' : 'mdi-crosshairs-gps-off'"
              :loading="loadingGeo"
              :style="origin
                ? { backgroundColor: 'color-mix(in srgb, var(--c-trade) 18%, transparent)', color: 'var(--c-trade)' }
                : { backgroundColor: 'var(--c-surface-2)', color: 'var(--c-text)' }"
              @click="useNearMe"
            >{{ t('proposeDialog.nearMe') }}</v-btn>
          </div>
          <p v-if="geoError" class="text-[11px]" style="color: var(--c-accent)">{{ geoError }}</p>

          <!-- Contextual hint: prompt before any input, confirm once sorting by distance -->
          <p v-if="origin" class="flex items-center gap-1 text-[11px] font-semibold" style="color: var(--c-trade)">
            <v-icon icon="mdi-sort-ascending" size="12" />{{ t('proposeDialog.sortedByDistance') }}
          </p>
          <p v-else-if="!query" class="text-[11px]" style="color: var(--c-muted)">
            {{ t('proposeDialog.searchHint') }}
          </p>

          <!-- Results -->
          <div class="max-h-[55vh] overflow-y-auto flex flex-col gap-1 pr-1">
            <p v-if="loaded && !hasResults" class="text-xs text-center py-6" style="color: var(--c-muted)">
              {{ t('proposeDialog.noPlaces') }}
            </p>

            <template v-if="stores.length">
              <p class="text-[10px] font-bold uppercase tracking-widest pt-1" style="color: var(--c-muted)">
                {{ t('proposeDialog.stores') }}
              </p>
              <button
                v-for="p in stores" :key="'s' + p.ref_id" type="button"
                class="flex items-center gap-2 text-left rounded-lg px-2 py-2 border transition-colors cursor-pointer hover:bg-[var(--c-surface-2)]"
                style="border-color: var(--c-border)"
                @click="pick(p)"
              >
                <v-icon icon="mdi-store-outline" size="14" color="var(--c-muted)" />
                <span class="flex flex-col grow min-w-0">
                  <span class="text-xs font-semibold truncate" style="color: var(--c-text)">{{ p.name }}</span>
                  <span class="text-[11px] truncate" style="color: var(--c-muted)">{{ placeSubtitle(p) }}</span>
                </span>
                <span v-if="distLabel(p)" class="text-[10px] font-semibold shrink-0" style="color: var(--c-trade)">{{ distLabel(p) }}</span>
              </button>
            </template>

            <template v-if="events.length">
              <p class="text-[10px] font-bold uppercase tracking-widest pt-2" style="color: var(--c-muted)">
                {{ t('proposeDialog.events') }}
              </p>
              <button
                v-for="p in events" :key="'e' + p.ref_id" type="button"
                class="flex items-center gap-2 text-left rounded-lg px-2 py-2 border transition-colors cursor-pointer hover:bg-[var(--c-surface-2)]"
                style="border-color: var(--c-border)"
                @click="pick(p)"
              >
                <v-icon icon="mdi-calendar-star" size="14" color="var(--c-muted)" />
                <span class="flex flex-col grow min-w-0">
                  <span class="text-xs font-semibold truncate" style="color: var(--c-text)">{{ p.name }}</span>
                  <span class="text-[11px] truncate" style="color: var(--c-muted)">
                    {{ placeSubtitle(p) }}{{ p.event_date ? ' · ' + p.event_date : '' }}
                  </span>
                </span>
                <span v-if="distLabel(p)" class="text-[10px] font-semibold shrink-0" style="color: var(--c-trade)">{{ distLabel(p) }}</span>
              </button>
            </template>
          </div>
        </div>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
/* Visible keyboard focus on every custom interactive element (DESIGN.md: focus states). */
button:focus-visible,
[role="button"]:focus-visible,
input:focus-visible {
  outline: 2px solid var(--c-trade);
  outline-offset: 2px;
}
</style>
