<script setup>
// A horizontal strip of upcoming community events, for surfaces that are not a
// community profile (today: the Announces tab). Events from communities the
// user follows lead the row and carry a badge; the rest fill in behind them so
// the strip is useful before anyone has followed anything.
//
// Renders nothing at all when there are no upcoming events. This sits above
// the announce grid, and an empty state there would cost every user vertical
// space to say "nothing".
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { fetchUpcomingEvents, mergeFollowedFirst, formatEventWhen, eventPlace } from "@/lib/communityEvents";
import { fetchFollowedIds } from "@/lib/communityFollow";

const props = defineProps({
  userId: { type: String, default: null },
  limit:  { type: Number, default: 24 },
});

const { t, locale: i18nLocale } = useI18n();
const route = useRoute();
const locale = computed(() => route.params.locale || "en");

const events = ref([]);

// Stale guard: only the most recent load may commit, so a fast sign-in/out
// cannot leave the previous user's followed ordering on screen.
let reqId = 0;
async function load() {
  const myId = ++reqId;
  try {
    const followedIds = await fetchFollowedIds(props.userId);
    // Two queries rather than one filtered client-side: a followed event far in
    // the future would otherwise fall outside the global limit.
    const [followed, all] = await Promise.all([
      fetchUpcomingEvents({ communityIds: followedIds, limit: 12 }),
      fetchUpcomingEvents({ limit: props.limit }),
    ]);
    if (myId !== reqId) return;
    events.value = mergeFollowedFirst(followed, all).slice(0, props.limit);
  } catch (e) {
    if (myId !== reqId) return;
    console.error("UpcomingEventsRow: load failed", e);
    events.value = [];
  }
}

watch(() => props.userId, load, { immediate: true });

function whenLabel(e) { return formatEventWhen(e, i18nLocale.value); }
function placeLabel(e) {
  if (e.is_online) return t("community.eventOnline");
  return eventPlace(e, e.community) || t("community.eventInPerson");
}
</script>

<template>
  <!-- No skeleton: most weeks have no upcoming events, so a placeholder would
       flash and vanish for nearly everyone. The row appears once it has
       something to show. -->
  <section v-if="events.length" class="uev">
    <div class="uev__head">
      <span class="uev__dot" />
      <span class="uev__label">{{ t('announces.eventsTitle') }}</span>
      <span class="uev__count">{{ events.length }}</span>
    </div>

    <div class="uev__row">
      <router-link
        v-for="e in events"
        :key="e.id"
        class="uev-card"
        :to="{ name: 'communityProfile', params: { locale, slug: e.community.slug } }"
      >
        <div class="uev-card__cover">
          <img v-if="e.cover_url" :src="e.cover_url" alt="" loading="lazy" decoding="async" />
          <span v-else class="uev-card__mark" aria-hidden="true">
            <v-icon icon="mdi-calendar-star" size="26" />
          </span>
          <span v-if="e.followed" class="uev-card__badge">{{ t('announces.eventsFollowing') }}</span>
        </div>

        <div class="uev-card__body">
          <p class="uev-card__title">{{ e.title }}</p>
          <p class="uev-card__meta">
            <v-icon icon="mdi-calendar-clock" size="13" />{{ whenLabel(e) }}
          </p>
          <p class="uev-card__meta">
            <v-icon :icon="e.is_online ? 'mdi-web' : 'mdi-map-marker'" size="13" />{{ placeLabel(e) }}
          </p>
          <p class="uev-card__host">
            <img v-if="e.community.avatar_url" :src="e.community.avatar_url" alt="" class="uev-card__avatar" />
            <span v-else class="uev-card__avatar uev-card__avatar--letter">{{ (e.community.name || '?')[0].toUpperCase() }}</span>
            <span class="uev-card__hostname">{{ e.community.name }}</span>
            <v-icon v-if="e.community.verified" icon="mdi-check-decagram" size="12" class="uev-card__verified" />
          </p>
        </div>
      </router-link>
    </div>
  </section>
</template>

<style scoped>
.uev { display: flex; flex-direction: column; }

.uev__head { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
.uev__dot { width: 8px; height: 8px; border-radius: 50%; background: var(--c-mutual); flex-shrink: 0; }
.uev__label {
  font-size: 13px; font-weight: 800; text-transform: uppercase;
  letter-spacing: 0.07em; color: var(--c-text);
}
.uev__count {
  font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 99px;
  background: var(--c-surface-2); color: var(--c-muted);
}

/* Same horizontal-scroll geometry as the My Announces row above the grid. */
.uev__row {
  display: flex; gap: 16px; overflow-x: auto; padding-bottom: 8px;
  scrollbar-width: thin; scrollbar-color: var(--c-border) transparent;
}
.uev__row::-webkit-scrollbar { height: 4px; }
.uev__row::-webkit-scrollbar-thumb { background: var(--c-border); border-radius: 99px; }

.uev-card {
  position: relative; flex-shrink: 0; width: 240px;
  display: flex; flex-direction: column;
  border: 1.5px solid var(--c-border); border-radius: 16px;
  background: var(--c-surface); color: var(--c-text); text-decoration: none;
  overflow: hidden;
  transition: border-color .15s ease, transform .15s ease;
}
.uev-card:hover { border-color: var(--c-trade); transform: translateY(-2px); }
.uev-card:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

.uev-card__cover {
  position: relative; height: 72px; width: 100%; overflow: hidden;
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--c-trade) 26%, var(--c-surface-2)),
    var(--c-surface-2));
}
.uev-card__cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.uev-card__mark {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: color-mix(in srgb, var(--c-trade) 55%, transparent);
}
.uev-card__badge {
  position: absolute; top: 8px; left: 8px;
  font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;
  padding: 3px 8px; border-radius: 7px;
  background: var(--c-mutual); color: var(--c-on-accent);
}

.uev-card__body { padding: 11px 13px 13px; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.uev-card__title {
  margin: 0; font-size: 14px; font-weight: 700; line-height: 1.3;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.uev-card__meta {
  margin: 0; display: flex; align-items: center; gap: 5px;
  font-size: 11.5px; font-weight: 600; color: var(--c-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.uev-card__meta .v-icon { color: var(--c-trade); flex-shrink: 0; }

.uev-card__host {
  margin: 6px 0 0; padding-top: 8px; border-top: 1px solid var(--c-border);
  display: flex; align-items: center; gap: 6px; min-width: 0;
}
.uev-card__avatar {
  width: 18px; height: 18px; border-radius: 50%; object-fit: cover; flex-shrink: 0;
  background: var(--c-surface-2);
}
.uev-card__avatar--letter {
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 800; color: var(--c-muted);
}
.uev-card__hostname {
  font-size: 11.5px; font-weight: 700; color: var(--c-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.uev-card__verified { color: var(--c-trade); flex-shrink: 0; }
</style>
