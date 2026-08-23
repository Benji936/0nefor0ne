<script setup>
// What is happening near you, at the places that proved they are real.
//
// Deliberately not the cover-card strip the Announces tab uses. That row sells
// events to someone browsing; this one answers a question someone just asked,
// sits above a grid of cards, and would be a second row of cards competing with
// the first. Flat rows read faster and stack better under a search.
//
// It renders nothing when empty. An empty near-me is already answered once, by
// the grid below; saying it twice would be noise.
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { formatEventWhen, eventPlace } from "@/lib/communityEvents";
import { formatDistance } from "@/lib/near";

const props = defineProps({
  /** Rows from events_near: flattened community_* columns, plus km. */
  events: { type: Array, default: () => [] },
});

const { t, locale: i18nLocale } = useI18n();
const route = useRoute();
const locale = computed(() => route.params.locale || "en");

// events_near does not return the event's own timezone, so these render in the
// reader's. For an event within a hundred kilometres those are the same clock
// in all but a handful of border cases, and the alternative is a wider return
// type on the SQL function for a difference nobody here would see.
function whenLabel(e) { return formatEventWhen(e, i18nLocale.value); }

function placeLabel(e) {
  if (e.is_online) return t("community.eventOnline");
  return eventPlace(e, { city: e.city, country: e.country }) || t("community.eventInPerson");
}
</script>

<template>
  <section v-if="events.length" class="ne">
    <div class="ne__head">
      <h2 class="ne__label">{{ t('community.nearEventsTitle') }}</h2>
      <span class="ne__count tabular-nums">{{ events.length }}</span>
    </div>

    <ul class="ne__list">
      <li v-for="e in events" :key="e.id" class="ne__item">
        <router-link
          class="ne__link"
          :to="{ name: 'communityProfile', params: { locale, slug: e.community_slug } }"
        >
          <!-- Distance leads the row rather than ending it. It is the sort key,
               so as a fixed column it can be read straight down; pushed to the
               far edge of a full-width row it ends up a thousand pixels from
               the title it belongs to. -->
          <span class="ne__km">{{ formatDistance(e.km) }}</span>

          <span class="ne__main">
            <span class="ne__title">{{ e.title }}</span>
            <!-- The separators are drawn by CSS as part of the clause that
                 follows them, not as items of their own. On a narrow screen
                 this line wraps to three, and a standalone middot would be
                 left hanging at the end of every one of them. -->
            <span class="ne__meta">
              <span class="ne__when">{{ whenLabel(e) }}</span>
              <span class="ne__place">
                <v-icon :icon="e.is_online ? 'mdi-web' : 'mdi-map-marker'" size="12" />{{ placeLabel(e) }}
              </span>
              <span class="ne__host">
                <img v-if="e.community_avatar_url" :src="e.community_avatar_url" alt="" class="ne__avatar" loading="lazy" decoding="async" />
                <span v-else class="ne__avatar ne__avatar--letter" aria-hidden="true">{{ (e.community_name || '?')[0].toUpperCase() }}</span>
                {{ e.community_name }}
              </span>
            </span>
          </span>
        </router-link>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.ne { display: flex; flex-direction: column; }

/* The same monospace eyebrow the directory's own header uses (DESIGN.md, The
   Mono Identifier Rule). The amethyst dot that used to lead it is gone: the
   label was already saying what this is. */
.ne__head {
  display: flex; align-items: center; gap: 9px;
  padding-bottom: 10px; margin-bottom: 4px;
  border-bottom: 1px solid var(--cd-line-soft, var(--c-border));
}
.ne__label {
  margin: 0;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.16em; color: var(--c-text);
}
.ne__count {
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.68rem; font-weight: 700; padding: 2px 8px; border-radius: 999px;
  background: color-mix(in srgb, var(--c-trade) 15%, transparent); color: var(--c-trade);
}

.ne__list { list-style: none; margin: 0; padding: 0; }
.ne__item + .ne__item { border-top: 1px solid var(--cd-line-soft, var(--c-border)); }

.ne__link {
  display: flex; align-items: center; gap: 16px;
  padding: 11px 4px;
  text-decoration: none; color: var(--c-text);
  border-radius: 10px;
  transition: background .15s ease;
}
.ne__link:hover { background: var(--cd-panel, var(--c-surface)); }
.ne__link:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

.ne__main { min-width: 0; display: flex; flex-direction: column; gap: 3px; flex: 1; }
.ne__title {
  font-size: 14px; font-weight: 700; line-height: 1.3;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ne__meta {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  font-size: 11.5px; font-weight: 600; color: var(--c-muted);
}
.ne__when { color: var(--c-text); }
.ne__meta > * + *::before { content: "·"; opacity: 0.5; }
.ne__place, .ne__host { display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
.ne__place .v-icon { color: var(--c-trade); flex-shrink: 0; }
.ne__avatar {
  width: 16px; height: 16px; border-radius: 50%; object-fit: cover; flex-shrink: 0;
  background: var(--c-surface-2);
}
.ne__avatar--letter {
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 800; color: var(--c-muted);
}

.ne__km {
  flex-shrink: 0;
  width: 66px;
  font-size: 12.5px; font-weight: 800; color: var(--c-text);
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .ne__link { transition: none; }
}
</style>
