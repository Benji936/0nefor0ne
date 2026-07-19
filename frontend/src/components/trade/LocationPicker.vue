<script setup>
import { ref, watch, computed } from "vue";
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

async function ensureLoaded() {
  if (loaded.value) return;
  const places = await loadMeetupPlaces();
  allPlaces.value = places;
  if (places.length > 0) loaded.value = true;
}

// Preload the list when the picker is in location mode.
watch(() => props.deliveryMode, (m) => { if (m === "location") ensureLoaded(); }, { immediate: true });

const ranked = computed(() => searchPlaces(allPlaces.value, query.value, origin.value));
const stores = computed(() => ranked.value.filter((p) => p.source === "store").slice(0, 30));
const events = computed(() => ranked.value.filter((p) => p.source === "event").slice(0, 15));
const hasResults = computed(() => stores.value.length > 0 || events.value.length > 0);

async function useNearMe() {
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

function pick(place) { emit("update:modelValue", place); }
function clearPick() { emit("update:modelValue", null); }
function setMode(mode) {
  emit("update:deliveryMode", mode);
  if (mode === "mail") emit("update:modelValue", null);
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
        class="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer"
        :style="deliveryMode === 'location'
          ? { backgroundColor: 'var(--c-trade)', borderColor: 'var(--c-trade)', color: 'white' }
          : { backgroundColor: 'transparent', borderColor: 'var(--c-border)', color: 'var(--c-muted)' }"
        @click="setMode('location')"
      >
        <v-icon icon="mdi-map-marker-outline" size="14" />{{ t('proposeDialog.meetAtLocation') }}
      </button>
      <button
        type="button"
        class="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer"
        :style="deliveryMode === 'mail'
          ? { backgroundColor: 'var(--c-trade)', borderColor: 'var(--c-trade)', color: 'white' }
          : { backgroundColor: 'transparent', borderColor: 'var(--c-border)', color: 'var(--c-muted)' }"
        @click="setMode('mail')"
      >
        <v-icon icon="mdi-package-variant-closed" size="14" />{{ t('proposeDialog.shipByMail') }}
      </button>
    </div>

    <template v-if="deliveryMode === 'location'">
      <!-- Selected place -->
      <div
        v-if="modelValue"
        class="flex items-center gap-2 rounded-lg border px-3 py-2"
        style="border-color: var(--c-mutual); background-color: color-mix(in srgb, var(--c-mutual) 10%, transparent)"
      >
        <v-icon icon="mdi-map-marker-check" size="16" color="var(--c-mutual)" />
        <div class="flex flex-col grow min-w-0">
          <span class="text-xs font-semibold truncate" style="color: var(--c-text)">{{ modelValue.name }}</span>
          <span class="text-[11px] truncate" style="color: var(--c-muted)">{{ modelValue.address || modelValue.city }}</span>
        </div>
        <v-btn icon="mdi-close" size="x-small" variant="text" color="white" @click="clearPick" />
      </div>

      <template v-else>
        <!-- Search + near me -->
        <div class="flex gap-2 items-center">
          <div class="relative grow">
            <v-icon icon="mdi-magnify" size="16" class="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" color="var(--c-muted)" />
            <input
              v-model="query"
              :placeholder="t('proposeDialog.searchPlaces')"
              class="w-full rounded-lg pl-8 pr-3 py-2 text-sm outline-none border"
              :style="{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }"
              @focus="ensureLoaded"
            />
          </div>
          <v-btn
            size="small" variant="flat" prepend-icon="mdi-crosshairs-gps"
            :loading="loadingGeo"
            style="background-color: var(--c-surface-2); color: var(--c-text)"
            @click="useNearMe"
          >{{ t('proposeDialog.nearMe') }}</v-btn>
        </div>
        <p v-if="geoError" class="text-[11px]" style="color: var(--c-accent)">{{ geoError }}</p>

        <!-- Results -->
        <div class="max-h-56 overflow-y-auto flex flex-col gap-1 pr-1">
          <p v-if="loaded && !hasResults" class="text-xs text-center py-4" style="color: var(--c-muted)">
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
                <span class="text-[11px] truncate" style="color: var(--c-muted)">{{ [p.city, p.state].filter(Boolean).join(', ') }}</span>
              </span>
              <span v-if="distLabel(p)" class="text-[10px] shrink-0" style="color: var(--c-mutual)">{{ distLabel(p) }}</span>
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
                  {{ [p.city, p.state].filter(Boolean).join(', ') || p.address }}{{ p.event_date ? ' · ' + p.event_date : '' }}
                </span>
              </span>
            </button>
          </template>
        </div>
      </template>
    </template>
  </div>
</template>
