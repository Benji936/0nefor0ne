<script setup>
// Tournaments on a community profile: what is running or coming, then what is
// over, with the owner's Create control in the header.
//
// Deliberately the same shape as CommunityEvents.vue, down to the locked-state
// link: an unverified owner gets a route to verification rather than a disabled
// button, because a control that looks real and refuses is dishonest and there
// is somewhere useful to send them.
import { ref, computed, watch, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { fetchTournaments, partitionTournaments, deleteTournament } from "@/lib/tournaments";
import TournamentDialog from "@/components/community/TournamentDialog.vue";

const props = defineProps({
  community: { type: Object, required: true },
  isOwner:   { type: Boolean, default: false },
});
const { t } = useI18n();
const route = useRoute();

// Running a tournament needs a verified community (RLS, 20260904141735). Same
// reason CommunityEvents checks: filling in the whole dialog and then being
// refused by the database is the worst possible moment to find out.
const canCreate = computed(() => props.isOwner && !!props.community?.verified);
const localeParam = computed(() => route.params.locale || "en");

const rows        = ref([]);
const loading     = ref(true);
const dialogOpen  = ref(false);
const editing     = ref(null);
const confirmingId = ref(null);
const pastOpen    = ref(false);

// Stale guard: only the latest load() for the current community may commit.
let reqId = 0;
async function load() {
  const id = props.community?.id;
  if (!id) { rows.value = []; loading.value = false; return; }
  const myId = ++reqId;
  loading.value = true;
  try {
    const data = await fetchTournaments(id);
    if (myId !== reqId) return;
    rows.value = data;
  } catch (e) {
    if (myId !== reqId) return;
    console.error("TournamentsSection: load failed", e);
    rows.value = [];
  } finally {
    if (myId === reqId) loading.value = false;
  }
}

onMounted(load);
watch(() => props.community?.id, load);

const parts = computed(() => partitionTournaments(rows.value));
const live  = computed(() => parts.value.live);
const past  = computed(() => parts.value.past);

const visible = computed(() => props.isOwner || live.value.length > 0 || past.value.length > 0);

function statusLabel(status) {
  const key = {
    draft: "statusDraft", registration: "statusRegistration", check_in: "statusCheckIn",
    active: "statusActive", completed: "statusCompleted", cancelled: "statusCancelled",
  }[status];
  return key ? t(`tournament.${key}`) : status;
}

/** Where a tournament is up to, in one line under its name. */
function progressLabel(x) {
  if (x.status !== "active") return null;
  if (!x.current_round) return t("tournament.notStarted");
  return x.total_rounds
    ? t("tournament.roundOf", { n: x.current_round, total: x.total_rounds })
    : t("tournament.round", { n: x.current_round });
}

function whenLabel(x) {
  if (!x.starts_at) return "";
  const d = new Date(x.starts_at);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium", timeStyle: "short",
      ...(x.timezone ? { timeZone: x.timezone } : {}),
    }).format(d);
  } catch {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(d);
  }
}

function openCreate() { editing.value = null; dialogOpen.value = true; }
function openEdit(x)  { editing.value = x; dialogOpen.value = true; }

function onSaved(row) {
  const i = rows.value.findIndex((x) => x.id === row.id);
  if (i >= 0) rows.value.splice(i, 1, row);
  else rows.value.push(row);
}

async function doDelete(x) {
  try {
    await deleteTournament(x.id);
    rows.value = rows.value.filter((r) => r.id !== x.id);
  } catch (e) {
    console.error("TournamentsSection: delete failed", e);
  } finally {
    confirmingId.value = null;
  }
}
</script>

<template>
  <section v-if="visible" class="tsec">
    <header class="tsec__head">
      <h2 class="tsec__title">{{ t('tournament.title') }}</h2>
      <button v-if="canCreate" type="button" class="tsec__add" @click="openCreate">
        <v-icon icon="mdi-plus" size="16" />
        {{ t('tournament.add') }}
      </button>
      <router-link
        v-else-if="isOwner"
        class="tsec__locked"
        :to="{ name: 'communityVerify', params: { locale: localeParam, slug: community.slug } }"
      >
        <v-icon icon="mdi-check-decagram-outline" size="15" />
        {{ t('tournament.addLocked') }}
      </router-link>
    </header>

    <ul v-if="live.length" class="tlist">
      <li v-for="x in live" :key="x.id" class="titem">
        <div v-if="isOwner && confirmingId !== x.id" class="titem__ctrls">
          <button
            v-if="canCreate"
            type="button"
            class="tctrl"
            :aria-label="t('tournament.edit')"
            @click.prevent="openEdit(x)"
          >
            <v-icon icon="mdi-pencil-outline" size="16" />
          </button>
          <!-- Delete is not gated on verified, matching the events section: an
               owner whose verification lapsed must still be able to take down
               something that is not happening. -->
          <button
            type="button"
            class="tctrl"
            :aria-label="t('tournament.delete')"
            @click.prevent="confirmingId = x.id"
          >
            <v-icon icon="mdi-trash-can-outline" size="16" />
          </button>
        </div>

        <div v-if="confirmingId === x.id" class="titem__confirm">
          <p class="titem__confirm-q">{{ t('tournament.confirmDelete') }}</p>
          <div class="titem__confirm-row">
            <button type="button" class="btn-quiet" @click="confirmingId = null">{{ t('tournament.cancel') }}</button>
            <button type="button" class="btn-danger" @click="doDelete(x)">{{ t('tournament.delete') }}</button>
          </div>
        </div>

        <router-link
          v-else
          class="titem__link"
          :to="{ name: 'tournament', params: { locale: localeParam, slug: community.slug, id: x.id } }"
        >
          <span class="titem__status" :class="`titem__status--${x.status}`">{{ statusLabel(x.status) }}</span>
          <span class="titem__name">{{ x.name }}</span>
          <span class="titem__meta">
            <span v-if="whenLabel(x)" class="titem__when">
              <v-icon icon="mdi-calendar-clock" size="14" />{{ whenLabel(x) }}
            </span>
            <span class="titem__fmt">{{ t('tournament.bestOf', { n: x.match_format }) }}</span>
            <span v-if="progressLabel(x)" class="titem__round">{{ progressLabel(x) }}</span>
          </span>
        </router-link>
      </li>
    </ul>

    <p v-else-if="!loading && isOwner" class="tsec__empty">
      {{ canCreate ? t('tournament.emptyOwner') : t('tournament.emptyUnverified') }}
    </p>

    <div v-if="past.length" class="tpast">
      <button type="button" class="tpast__toggle" :aria-expanded="pastOpen" @click="pastOpen = !pastOpen">
        <v-icon :icon="pastOpen ? 'mdi-chevron-down' : 'mdi-chevron-right'" size="16" />
        {{ t('tournament.pastTitle') }} ({{ past.length }})
      </button>
      <ul v-if="pastOpen" class="tlist tlist--past">
        <li v-for="x in past" :key="x.id" class="titem">
          <router-link
            class="titem__link"
            :to="{ name: 'tournament', params: { locale: localeParam, slug: community.slug, id: x.id } }"
          >
            <span class="titem__status" :class="`titem__status--${x.status}`">{{ statusLabel(x.status) }}</span>
            <span class="titem__name">{{ x.name }}</span>
            <span class="titem__meta">
              <span v-if="whenLabel(x)" class="titem__when">
                <v-icon icon="mdi-calendar-clock" size="14" />{{ whenLabel(x) }}
              </span>
            </span>
          </router-link>
        </li>
      </ul>
    </div>

    <TournamentDialog
      v-if="canCreate"
      v-model="dialogOpen"
      :community="community"
      :tournament="editing"
      @saved="onSaved"
    />
  </section>
</template>

<style scoped>
.tsec { display: flex; flex-direction: column; gap: 16px; }
.tsec__head { display: flex; align-items: center; gap: 12px; }

/* The Uppercase Section Rule, matching "Events" and "Other places within 40 km"
   on the same page. */
.tsec__title {
  margin: 0; flex: 1;
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.7rem; font-weight: 700;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--c-muted);
}

.tsec__add {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 38px; padding: 0 15px; border-radius: 999px;
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--c-trade) 45%, transparent);
  color: var(--c-trade); font-size: 0.8rem; font-weight: 700; cursor: pointer;
  transition: background 0.15s ease;
}
.tsec__add:hover { background: color-mix(in srgb, var(--c-trade) 12%, transparent); }
.tsec__add:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

.tsec__locked {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 38px; padding: 0 12px; border-radius: 999px;
  color: var(--c-muted); font-size: 0.78rem; font-weight: 700; text-decoration: none;
  transition: color 0.15s ease, background 0.15s ease;
}
.tsec__locked:hover { color: var(--c-trade); background: var(--c-surface-2); }
.tsec__locked:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

.tsec__empty { margin: 0; color: var(--c-muted); font-size: 0.85rem; }

.tlist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.tlist--past { margin-top: 10px; }

/* --cp-panel / --cp-line / --cp-lit are declared on the profile page's root and
   inherit through this scoped boundary, so a tournament row sits on the same
   ground as the event cards above it. */
.titem {
  position: relative;
  border-radius: 14px;
  background: var(--cp-panel, var(--c-surface));
  border: 1px solid var(--cp-line, var(--c-border));
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.titem:hover { border-color: color-mix(in srgb, var(--c-trade) 45%, transparent); }

.titem__link {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-areas: "status name" "status meta";
  column-gap: 12px; row-gap: 4px;
  padding: 13px 15px; text-decoration: none; color: inherit;
  border-radius: 14px;
}
.titem__link:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

.titem__status {
  grid-area: status; align-self: center;
  display: inline-flex; align-items: center;
  padding: 4px 10px; border-radius: 999px;
  font-size: 0.65rem; font-weight: 800;
  letter-spacing: 0.08em; text-transform: uppercase;
  background: var(--c-surface-2); color: var(--c-muted);
  white-space: nowrap;
}
/* Amethyst is the colour of offering: registration is the invitation. */
.titem__status--registration,
.titem__status--check_in { background: color-mix(in srgb, var(--c-trade) 18%, transparent); color: var(--c-trade); }
.titem__status--active   { background: color-mix(in srgb, var(--c-trade) 28%, transparent); color: var(--c-trade); }

.titem__name { grid-area: name; font-size: 0.95rem; font-weight: 700; color: var(--c-text); }
.titem__meta {
  grid-area: meta; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px;
  font-size: 0.75rem; color: var(--c-muted);
}
.titem__when { display: inline-flex; align-items: center; gap: 4px; }
.titem__fmt, .titem__round { font-weight: 600; }

.titem__ctrls { position: absolute; top: 8px; right: 8px; display: flex; gap: 4px; z-index: 1; }
.tctrl {
  width: 30px; height: 30px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--c-bg) 70%, transparent);
  color: var(--c-muted); cursor: pointer; transition: background 0.15s ease, color 0.15s ease;
}
.tctrl:hover { background: var(--c-surface-2); color: var(--c-text); }
.tctrl:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

.titem__confirm { padding: 13px 15px; display: flex; flex-direction: column; gap: 10px; }
.titem__confirm-q { margin: 0; font-size: 0.85rem; color: var(--c-text); }
.titem__confirm-row { display: flex; gap: 8px; justify-content: flex-end; }

.btn-quiet {
  padding: 7px 14px; border-radius: 999px; font-size: 0.78rem; font-weight: 700;
  color: var(--c-muted); cursor: pointer; transition: background 0.15s ease;
}
.btn-quiet:hover { background: var(--c-surface-2); }
.btn-danger {
  padding: 7px 14px; border-radius: 999px; font-size: 0.78rem; font-weight: 700;
  background: color-mix(in srgb, #ef4444 14%, transparent); color: #ef4444; cursor: pointer;
  transition: background 0.15s ease;
}
.btn-danger:hover { background: color-mix(in srgb, #ef4444 24%, transparent); }

.tpast__toggle {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 34px; padding: 0 4px;
  background: transparent; color: var(--c-muted);
  font-size: 0.78rem; font-weight: 700; cursor: pointer;
}
.tpast__toggle:hover { color: var(--c-text); }
.tpast__toggle:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

@media (pointer: coarse) {
  .tsec__locked, .tpast__toggle { min-height: 44px; }
  .tctrl { width: 36px; height: 36px; }
}
@media (prefers-reduced-motion: reduce) {
  .tsec__add, .tsec__locked, .titem, .tctrl, .btn-quiet, .btn-danger { transition: none; }
}
</style>
