<script setup>
// Events section on a community profile: upcoming list + a collapsed "Past
// events" disclosure. The owner gets Add / edit / delete controls here,
// independent of the profile's inline-edit mode. RLS returns the right rows per
// caller (published-of-published for the public, everything for the owner).
import { ref, computed, watch, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { fetchEvents, partitionEvents, deleteEvent, formatEventWhen, eventMapUrl, eventPlace } from "@/lib/communityEvents";
import PlatformIcon from "@/components/community/PlatformIcon.vue";
import CommunityEventDialog from "@/components/community/CommunityEventDialog.vue";

const props = defineProps({
  community: { type: Object, required: true },
  isOwner:   { type: Boolean, default: false },
});
const emit = defineEmits(["loaded"]);
const { t, locale } = useI18n();
const route = useRoute();

// Posting events needs a verified community (RLS, 20260806). Without this the
// owner would fill in the whole dialog and then be refused by the database,
// which is the worst possible moment to learn about it.
const canPost = computed(() => props.isOwner && !!props.community?.verified);
const localeParam = computed(() => route.params.locale || "en");

const events   = ref([]);
const loading  = ref(true);
const pastOpen = ref(false);

const dialogOpen   = ref(false);
const editingEvent = ref(null);
const confirmingId = ref(null);
const deletingId   = ref(null);

// Stale guard: only the latest load() for the current community may commit.
let reqId = 0;
async function load() {
  const id = props.community?.id;
  if (!id) { events.value = []; loading.value = false; return; }
  const myId = ++reqId;
  loading.value = true;
  try {
    const rows = await fetchEvents(id);
    if (myId !== reqId) return;
    events.value = rows;
  } catch (e) {
    if (myId !== reqId) return;
    console.error("CommunityEvents: load failed", e);
    events.value = [];
  } finally {
    if (myId === reqId) loading.value = false;
  }
}

onMounted(load);
watch(() => props.community?.id, load);

const parts    = computed(() => partitionEvents(events.value));
const upcoming  = computed(() => parts.value.upcoming);
const past      = computed(() => parts.value.past);

// Publish upcoming events upward so the profile can emit Event JSON-LD.
watch(upcoming, (u) => emit("loaded", u), { immediate: true });

// Show the section when there is anything to show, or to let an owner add one.
const visible = computed(() => props.isOwner || upcoming.value.length > 0 || past.value.length > 0);

function whenLabel(e) { return formatEventWhen(e, locale.value); }
function mapUrlFor(e) { return eventMapUrl(e, props.community); }
function placeFor(e)  { return eventPlace(e, props.community); }

function openCreate() { editingEvent.value = null; dialogOpen.value = true; }
function openEdit(e)  { editingEvent.value = e; dialogOpen.value = true; }

function onSaved(row) {
  const i = events.value.findIndex((e) => e.id === row.id);
  if (i >= 0) events.value.splice(i, 1, row);
  else events.value.push(row);
}

async function confirmDelete(e) {
  deletingId.value = e.id;
  try {
    await deleteEvent(e.id);
    events.value = events.value.filter((x) => x.id !== e.id);
  } catch (err) {
    console.error("CommunityEvents: delete failed", err);
  } finally {
    deletingId.value = null;
    confirmingId.value = null;
  }
}
</script>

<template>
  <section v-if="visible" class="cev">
    <header class="cev__head">
      <h2 class="cev__title">{{ t('community.eventsTitle') }}</h2>
      <button v-if="canPost" type="button" class="cev__add" @click="openCreate">
        <v-icon icon="mdi-plus" size="16" />
        {{ t('community.addEvent') }}
      </button>
      <!-- Not a disabled Add button: a control that looks like the real one but
           refuses is dishonest, and there is somewhere useful to send them. -->
      <router-link
        v-else-if="isOwner"
        class="cev__locked"
        :to="{ name: 'communityVerify', params: { locale: localeParam, slug: community.slug } }"
      >
        <v-icon icon="mdi-check-decagram-outline" size="15" />
        {{ t('community.addEventLocked') }}
      </router-link>
    </header>

    <!-- Upcoming -->
    <ul v-if="upcoming.length" class="cev-list">
      <li v-for="e in upcoming" :key="e.id" class="cev-item">
        <div v-if="e.cover_url" class="cev-item__cover">
          <img :src="e.cover_url" alt="" loading="lazy" decoding="async" />
        </div>

        <!-- Owner icon controls (top-right) -->
        <div v-if="isOwner && confirmingId !== e.id" class="cev-item__ctrls">
          <!-- Edit follows the RLS gate; delete deliberately does not, so an
               owner whose verification lapsed can still take down an event
               that is no longer happening. -->
          <button v-if="canPost" type="button" class="cev-ctrl" :aria-label="t('community.editEvent')" @click="openEdit(e)">
            <v-icon icon="mdi-pencil-outline" size="16" />
          </button>
          <button type="button" class="cev-ctrl" :aria-label="t('community.deleteEvent')" @click="confirmingId = e.id">
            <v-icon icon="mdi-trash-can-outline" size="16" />
          </button>
        </div>

        <div class="cev-item__body">
          <p class="cev-item__title">{{ e.title }}</p>
          <p class="cev-item__meta">
            <span class="cev-item__when"><v-icon icon="mdi-calendar-clock" size="14" />{{ whenLabel(e) }}</span>
            <!-- In-person locations link out to a map; online events are plain text. -->
            <a
              v-if="mapUrlFor(e)"
              :href="mapUrlFor(e)"
              target="_blank"
              rel="noopener noreferrer"
              class="cev-item__where cev-item__where--link"
              :title="t('community.openMap')"
              @click.stop
            >
              <v-icon icon="mdi-map-marker" size="14" />
              {{ placeFor(e) || t('community.eventInPerson') }}
              <v-icon icon="mdi-open-in-new" size="11" class="cev-item__extlink" />
            </a>
            <span v-else class="cev-item__where">
              <v-icon :icon="e.is_online ? 'mdi-web' : 'mdi-map-marker'" size="14" />
              {{ e.is_online ? t('community.eventOnline') : (placeFor(e) || t('community.eventInPerson')) }}
            </span>
          </p>
          <p v-if="e.description" class="cev-item__desc">{{ e.description }}</p>
          <div class="cev-item__foot">
            <a v-if="e.url" :href="e.url" target="_blank" rel="noopener noreferrer" class="cev-item__link">
              <PlatformIcon platform="other" :size="14" />
              {{ t('community.eventOpenLink') }}
            </a>
            <span v-if="e.status === 'hidden'" class="cev-item__badge">{{ t('community.eventHiddenBadge') }}</span>
          </div>

          <!-- Delete confirm -->
          <div v-if="isOwner && confirmingId === e.id" class="cev-confirmbar">
            <span class="cev-confirm">{{ t('community.confirmDeleteEvent') }}</span>
            <button type="button" class="cev-ctrl" :disabled="deletingId === e.id" @click="confirmDelete(e)">
              <v-progress-circular v-if="deletingId === e.id" indeterminate size="14" width="2" color="var(--cp-danger, #F2555A)" />
              <span v-else class="cev-ctrl--danger">{{ t('community.delete') }}</span>
            </button>
            <button type="button" class="cev-ctrl" @click="confirmingId = null">{{ t('community.cancel') }}</button>
          </div>
        </div>
      </li>
    </ul>

    <!-- Owner empty state -->
    <p v-else-if="isOwner && !loading" class="cev-empty">
      {{ canPost ? t('community.eventsEmptyOwner') : t('community.eventsEmptyUnverified') }}
    </p>

    <!-- Past (collapsed) -->
    <div v-if="past.length" class="cev-past">
      <button type="button" class="cev-past__toggle" :aria-expanded="pastOpen" @click="pastOpen = !pastOpen">
        <v-icon :icon="pastOpen ? 'mdi-chevron-down' : 'mdi-chevron-right'" size="18" />
        {{ t('community.pastEvents') }} ({{ past.length }})
      </button>
      <ul v-if="pastOpen" class="cev-list cev-list--past">
        <li v-for="e in past" :key="e.id" class="cev-item cev-item--past">
          <div v-if="isOwner && confirmingId !== e.id" class="cev-item__ctrls">
            <button v-if="canPost" type="button" class="cev-ctrl" :aria-label="t('community.editEvent')" @click="openEdit(e)">
              <v-icon icon="mdi-pencil-outline" size="16" />
            </button>
            <button type="button" class="cev-ctrl" :aria-label="t('community.deleteEvent')" @click="confirmingId = e.id">
              <v-icon icon="mdi-trash-can-outline" size="16" />
            </button>
          </div>
          <div class="cev-item__body">
            <p class="cev-item__title">{{ e.title }}</p>
            <p class="cev-item__meta">
              <span class="cev-item__when"><v-icon icon="mdi-calendar-check" size="14" />{{ whenLabel(e) }}</span>
            </p>
            <div v-if="isOwner && confirmingId === e.id" class="cev-confirmbar">
              <span class="cev-confirm">{{ t('community.confirmDeleteEvent') }}</span>
              <button type="button" class="cev-ctrl" :disabled="deletingId === e.id" @click="confirmDelete(e)">
                <span class="cev-ctrl--danger">{{ t('community.delete') }}</span>
              </button>
              <button type="button" class="cev-ctrl" @click="confirmingId = null">{{ t('community.cancel') }}</button>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <CommunityEventDialog
      v-if="canPost"
      v-model="dialogOpen"
      :community="community"
      :event="editingEvent"
      @saved="onSaved"
    />
  </section>
</template>

<style scoped>
.cev { display: flex; flex-direction: column; gap: 16px; }
.cev__head { display: flex; align-items: center; gap: 12px; }
.cev__title {
  margin: 0; font-size: 1.05rem; font-weight: 800; color: var(--c-text);
  letter-spacing: -0.01em; flex: 1;
}
.cev__add {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 40px; padding: 0 14px; border-radius: 11px;
  background: color-mix(in srgb, var(--c-trade) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--c-trade) 30%, transparent);
  color: var(--c-trade); font-size: 13px; font-weight: 700; cursor: pointer;
  transition: background 0.15s ease;
}
.cev__add:hover { background: color-mix(in srgb, var(--c-trade) 24%, transparent); }
.cev__add:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

/* The route to earning the Add button. Quieter than it on purpose: it is a
   detour, not the action the owner came here for. */
.cev__locked {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 40px; padding: 0 12px; border-radius: 11px;
  color: var(--c-muted); font-size: 12.5px; font-weight: 700; text-decoration: none;
  transition: color 0.15s ease, background 0.15s ease;
}
.cev__locked:hover { color: var(--c-trade); background: var(--c-surface-2); }
.cev__locked:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

@media (pointer: coarse) { .cev__locked { min-height: 44px; } }
@media (prefers-reduced-motion: reduce) {
  .cev__add, .cev__locked { transition: none; }
}

/* Same grid geometry as the community directory, so an event card and a
   community card read as the same object at the same size. */
.cev-list {
  list-style: none; margin: 0; padding: 0;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}
.cev-list--past { margin-top: 12px; }

.cev-item {
  position: relative;
  display: flex; flex-direction: column;
  border-radius: 16px; overflow: hidden;
  background: var(--c-surface); border: 1.5px solid var(--c-border);
  transition: border-color 0.15s ease;
}
.cev-item:hover { border-color: var(--c-trade); }
.cev-item--past { opacity: 0.8; }
/* Cover matches the directory card's banner strip. */
.cev-item__cover { width: 100%; height: 76px; background: var(--c-surface-2); }
.cev-item__cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cev-item__body { padding: 12px 14px 14px; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.cev-item__title {
  margin: 0; font-size: 14.5px; font-weight: 700; color: var(--c-text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cev-item__meta { margin: 0; display: flex; flex-wrap: wrap; gap: 3px 12px; font-size: 12px; font-weight: 600; color: var(--c-muted); }
.cev-item__when, .cev-item__where { display: inline-flex; align-items: center; gap: 5px; }
.cev-item__when .v-icon, .cev-item__where .v-icon { color: var(--c-trade); }
.cev-item__where--link { color: inherit; text-decoration: none; }
.cev-item__where--link:hover { color: var(--c-trade); text-decoration: underline; }
.cev-item__extlink { opacity: 0.6; }
.cev-item__desc {
  margin: 2px 0 0; font-size: 12.5px; color: var(--c-muted); line-height: 1.5;
  white-space: pre-wrap;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.cev-item__foot { display: flex; align-items: center; gap: 12px; margin-top: 2px; flex-wrap: wrap; }
.cev-item__link {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12.5px; font-weight: 700; color: var(--c-trade); text-decoration: none;
}
.cev-item__link:hover { text-decoration: underline; }
.cev-item__badge {
  font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--c-muted); padding: 2px 8px; border-radius: 6px;
  background: color-mix(in srgb, var(--c-bg) 40%, transparent);
}

/* Owner controls overlay the card's top-right, readable over the cover. */
.cev-item__ctrls {
  position: absolute; top: 8px; right: 8px; z-index: 2;
  display: flex; align-items: center; gap: 2px;
  padding: 2px; border-radius: 10px;
  background: color-mix(in srgb, var(--c-bg) 55%, transparent);
  border: 1px solid color-mix(in srgb, var(--c-border) 55%, transparent);
  backdrop-filter: blur(6px);
}
.cev-confirmbar {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  margin-top: 8px; padding-top: 10px;
  border-top: 1px solid var(--c-border);
}
.cev-ctrl {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 32px; height: 32px; padding: 0 8px; border-radius: 8px;
  color: var(--c-muted); background: transparent; border: none; cursor: pointer;
  font-size: 12.5px; font-weight: 700; transition: background 0.12s ease, color 0.12s ease;
}
.cev-ctrl:hover { background: var(--c-surface-2); color: var(--c-text); }
.cev-ctrl--danger { color: var(--cp-danger, #F2555A); }
.cev-confirm { font-size: 12px; font-weight: 600; color: var(--c-muted); align-self: center; }

.cev-empty { margin: 0; font-size: 13px; color: var(--c-muted); }

.cev-past { border-top: 1px solid var(--c-border); padding-top: 12px; }
.cev-past__toggle {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 40px; padding: 0 6px; border-radius: 8px;
  background: transparent; border: none; cursor: pointer;
  font-size: 13px; font-weight: 700; color: var(--c-muted);
}
.cev-past__toggle:hover { color: var(--c-text); }
.cev-past__toggle .v-icon { color: var(--c-trade); }

.cev__add:focus-visible, .cev-ctrl:focus-visible, .cev-past__toggle:focus-visible, .cev-item__link:focus-visible {
  outline: 2px solid var(--c-trade); outline-offset: 2px;
}
</style>
