<script setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import UserCard from "@/components/trade/UserCard.vue";

const { t } = useI18n();
const route = useRoute();
const locale = computed(() => route.params.locale || "en");

const props = defineProps({
  login:             { type: Object,  default: null },
  loading:           { type: Boolean, default: false },
  allMatchesCount:   { type: Number,  default: 0 },
  locationCountry:   { type: String,  default: "" },
  locationCity:      { type: String,  default: "" },
  availableCountries:{ type: Array,   default: () => [] },
  filterCardName:    { type: String,  default: "" },
  // Where the viewer says they are, off their own Trader row. Traders carry a
  // city and a country and no coordinates, so "near me" can only be the place
  // they wrote down — which is also exactly what the two filters below match
  // on, so the button fills them rather than introducing a second notion of
  // nearness that could disagree with them.
  myCountry:         { type: String,  default: "" },
  myCity:            { type: String,  default: "" },
  buckets:           { type: Object,  required: true },
  totalMatches:      { type: Number,  default: 0 },
});

const emit = defineEmits([
  "update:locationCountry",
  "update:locationCity",
  "clearFilter",
  "openTrade",
  "openProfile",
]);

/**
 * The three groups, in the order a trade gets easier to make: both directions
 * live, then one direction each way. That order is the reason they are grouped
 * at all, so the page states it once, at the top of each group, rather than
 * numbering them.
 */
const groups = computed(() => [
  {
    key:   "mutual",
    users: props.buckets.mutual,
    title: t("matches.mutualMatches"),
    note:  t("matches.mutualDesc"),
    color: "var(--c-mutual)",
  },
  {
    key:   "theyHave",
    users: props.buckets.theyHave,
    title: t("matches.theyHave"),
    note:  "",
    color: "var(--c-trade)",
  },
  {
    key:   "theyWant",
    users: props.buckets.theyWant,
    title: t("matches.theyWant"),
    note:  "",
    color: "var(--c-accent)",
  },
].filter((g) => g.users.length > 0));

const filtered = computed(() => !!(props.locationCountry || props.locationCity));

// ── Near me ─────────────────────────────────────────────────────────────────
/** The whole place, for the tooltip and the accessible name. */
const myPlace = computed(() =>
  [props.myCity, props.myCountry].filter(Boolean).join(", "));

/**
 * The place as the button shows it: the city alone where there is one.
 *
 * "Geneva, Switzerland" is what the filter will actually apply, but on a
 * control this size it truncated to "Geneva, Switze…" — which is longer than
 * the city and says less. The country stays in the title and the label.
 */
const myPlaceShort = computed(() => props.myCity || props.myCountry);

/** Nothing to fill the filters with until the profile says where you are. */
const canNearMe = computed(() => !!(props.myCity || props.myCountry));

/** Already showing your own place, so the next press is a way back out. */
const nearMeOn = computed(() =>
  canNearMe.value
  && props.locationCountry === props.myCountry
  && props.locationCity === props.myCity);

function toggleNearMe() {
  const on = nearMeOn.value;
  emit("update:locationCountry", on ? "" : props.myCountry);
  emit("update:locationCity", on ? "" : props.myCity);
}

/**
 * The countries to offer, which is the ones the matches are in plus whichever
 * is currently chosen.
 *
 * Without that second half a country that filters everything out would vanish
 * from its own select: near me can pick a country no match is in, and the
 * control would then sit blank next to an empty list, reading as broken rather
 * than as an honest "nobody here yet".
 */
const countryOptions = computed(() =>
  [...new Set([...props.availableCountries, props.locationCountry].filter(Boolean))].sort());
</script>

<template>
  <!-- Not logged in -->
  <div v-if="!login" class="mt-blank">
    <v-icon icon="mdi-lock-outline" size="34" color="var(--c-muted)" />
    <p class="mt-blank__body">{{ t('matches.loginRequired') }}</p>
  </div>

  <div v-else class="mt">
    <!-- Where you can actually meet. P2P trading ends in a handover, so this is
         a real constraint on the list rather than a nicety. -->
    <div v-if="!loading && allMatchesCount > 0" class="mt-filters">
      <span class="mt-filters__label">{{ t('matches.near') }}</span>

      <select
        :value="locationCountry"
        class="mt-field mt-field--select"
        :aria-label="t('matches.allCountries')"
        @change="emit('update:locationCountry', $event.target.value)"
      >
        <option value="">{{ t('matches.allCountries') }}</option>
        <option v-for="c in countryOptions" :key="c" :value="c">{{ c }}</option>
      </select>

      <input
        :value="locationCity"
        :placeholder="t('matches.city')"
        :aria-label="t('matches.city')"
        class="mt-field"
        @input="emit('update:locationCity', $event.target.value)"
      />

      <!-- Your own place, in one press. It names the place it will fill in
           rather than only saying "near me", because a filter that changes what
           the page shows should say what it is about to do. -->
      <button
        v-if="canNearMe"
        type="button"
        class="mt-near"
        :aria-pressed="nearMeOn"
        :title="myPlace"
        :aria-label="`${t('matches.nearMe')} — ${myPlace}`"
        @click="toggleNearMe"
      >
        <v-icon icon="mdi-map-marker-outline" size="13" />
        {{ t('matches.nearMe') }}
        <span class="mt-near__place">{{ myPlaceShort }}</span>
      </button>
      <!-- No location on the profile means nothing to be near. A link to go and
           say so beats a button that would do nothing. -->
      <router-link v-else class="mt-near mt-near--empty" :to="{ name: 'account', params: { locale } }">
        <v-icon icon="mdi-map-marker-plus-outline" size="13" />{{ t('matches.setLocation') }}
      </router-link>

      <button
        v-if="filtered"
        type="button"
        class="mt-clear"
        @click="emit('update:locationCountry', ''); emit('update:locationCity', '')"
      >
        <v-icon icon="mdi-close" size="13" />{{ t('matches.clearFilters') }}
      </button>
    </div>

    <!-- Arrived from a single card's "see traders" flow. -->
    <p v-if="filterCardName" class="mt-cardfilter">
      <v-icon icon="mdi-magnify" size="15" class="shrink-0" />
      <span>{{ t('matches.tradersWith') }}</span>
      <span class="mt-cardfilter__name">{{ filterCardName }}</span>
      <button type="button" class="mt-clear" @click="emit('clearFilter')">
        <v-icon icon="mdi-close" size="13" />{{ t('matches.clear') }}
      </button>
    </p>

    <!-- Skeleton: the shape of a match row, so nothing jumps when it lands. -->
    <div v-if="loading" class="mt-list">
      <div
        v-for="i in 4" :key="i"
        class="mt-sk"
        :style="{ opacity: 1 - (i - 1) * 0.18 }"
      >
        <div class="mt-sk__head">
          <div class="mt-sk__bar animate-pulse motion-reduce:animate-none" style="width: 42px; height: 42px; border-radius: 999px" />
          <div class="flex flex-col gap-2 grow">
            <div class="mt-sk__bar animate-pulse motion-reduce:animate-none" style="width: 34%; height: 15px" />
            <div class="mt-sk__bar animate-pulse motion-reduce:animate-none" style="width: 22%; height: 11px" />
          </div>
          <div class="mt-sk__bar animate-pulse motion-reduce:animate-none" style="width: 104px; height: 42px; border-radius: 11px" />
        </div>
        <div class="mt-sk__axis">
          <div class="mt-sk__side animate-pulse motion-reduce:animate-none" />
          <div class="mt-sk__side animate-pulse motion-reduce:animate-none" />
        </div>
      </div>
    </div>

    <!-- Empty: nobody overlaps yet, which is a thing you can fix. -->
    <div v-else-if="totalMatches === 0" class="mt-blank">
      <div class="mt-blank__mark">
        <v-icon icon="mdi-account-search-outline" size="26" color="var(--c-muted)" />
      </div>
      <p class="mt-blank__title">{{ filtered ? t('matches.noneHereTitle') : t('matches.noMatchesTitle') }}</p>
      <p class="mt-blank__body">{{ filtered ? t('matches.noneHereDesc') : t('matches.noMatchesDesc') }}</p>
      <button v-if="filtered" type="button" class="mt-clear" @click="emit('update:locationCountry', ''); emit('update:locationCity', '')">
        <v-icon icon="mdi-close" size="13" />{{ t('matches.clearFilters') }}
      </button>
      <router-link v-else to="/library" class="mt-blank__cta">
        <v-icon icon="mdi-cards-outline" size="14" />{{ t('matches.goToCollection') }}
      </router-link>
    </div>

    <!-- The groups -->
    <template v-else>
    <section v-for="g in groups" :key="g.key" class="mt-group">
      <div class="mt-group__head" :style="{ '--kind': g.color }">
        <h2 class="mt-group__title">
          <span class="mt-group__dot" />{{ g.title }}
          <span class="mt-group__n tabular-nums">{{ g.users.length }}</span>
        </h2>
        <p v-if="g.note" class="mt-group__note">{{ g.note }}</p>
      </div>

      <div class="mt-list">
        <UserCard
          v-for="u in g.users"
          :key="u.id"
          :user="u"
          @openTrade="emit('openTrade', u)"
          @openProfile="emit('openProfile', $event)"
        />
      </div>
    </section>
    </template>
  </div>
</template>

<style scoped>
.mt {
  --mt-panel: color-mix(in srgb, var(--c-surface) 94%, var(--c-bg));
  --mt-line: color-mix(in srgb, var(--c-border) 60%, transparent);
  --mt-line-soft: color-mix(in srgb, var(--c-border) 34%, transparent);

  display: flex;
  flex-direction: column;
  gap: 30px;
}

/* ── Where ── */
.mt-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.mt-filters__label {
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--c-muted);
}
.mt-field {
  min-width: 0;
  flex: 1 1 130px;
  max-width: 240px;
  padding: 9px 12px;
  border-radius: 11px;
  font-size: 0.85rem;
  color: var(--c-text);
  background: var(--mt-panel);
  border: 1px solid var(--mt-line);
  outline: none;
  transition: border-color 0.15s ease;
}
.mt-field::placeholder { color: var(--c-muted); }
.mt-field:hover { border-color: color-mix(in srgb, var(--c-trade) 40%, transparent); }
.mt-field:focus-visible { border-color: var(--c-trade); outline: 2px solid var(--c-trade); outline-offset: 1px; }
.mt-field--select { cursor: pointer; }

.mt-clear {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 11px;
  border-radius: 10px;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--c-muted);
  background: transparent;
  border: 1px solid var(--mt-line-soft);
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.mt-clear:hover { color: var(--c-text); border-color: var(--mt-line); }
.mt-clear:focus-visible { outline: 2px solid var(--c-accent); outline-offset: 2px; }

/* ── Near me ──
   A filter, so it is built like the fields beside it rather than like a call to
   action: same radius, same hairline, same panel ground. Amethyst arrives only
   when it is on, because that is the app's colour for a trade you could
   actually make and this button exists to shorten the distance to one. */
.mt-near {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 12px;
  border-radius: 11px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--c-text);
  background: var(--mt-panel);
  border: 1px solid var(--mt-line);
  cursor: pointer;
  text-decoration: none;
  transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
}
.mt-near:hover { border-color: color-mix(in srgb, var(--c-trade) 45%, transparent); }
.mt-near:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 1px; }
.mt-near[aria-pressed="true"] {
  color: var(--c-trade);
  border-color: var(--c-trade);
  background: color-mix(in srgb, var(--c-trade) 12%, transparent);
}
.mt-near .v-icon { color: currentColor; }

/* The place itself, quieter than the label — it says what the button will do,
   and on a narrow row it is the half that can go. */
.mt-near__place {
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--c-muted);
  max-width: 16ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mt-near[aria-pressed="true"] .mt-near__place { color: inherit; opacity: 0.75; }
@media (max-width: 560px) { .mt-near__place { display: none; } }

/* Nothing to be near yet: an invitation, not a dead control. */
.mt-near--empty { color: var(--c-muted); font-weight: 600; }
.mt-near--empty:hover { color: var(--c-trade); }

.mt-cardfilter {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  font-size: 0.85rem;
  color: var(--c-muted);
}
.mt-cardfilter__name { font-weight: 700; color: var(--c-text); }

/* ── Groups ────────────────────────────────────────────────────────────────
   Section labels in the collector's own register: monospace, uppercase, widely
   tracked (DESIGN.md, The Mono Identifier Rule), matching the account and
   collection pages. */
.mt-group { display: flex; flex-direction: column; gap: 14px; }
.mt-group__head {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--mt-line-soft);
}
.mt-group__title {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--c-text);
}
.mt-group__dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 999px;
  background: var(--kind);
}
.mt-group__n {
  padding: 2px 8px;
  border-radius: 999px;
  letter-spacing: 0;
  color: var(--kind);
  background: color-mix(in srgb, var(--kind) 15%, transparent);
}
.mt-group__note { margin: 0; font-size: 0.82rem; color: var(--c-muted); }

.mt-list { display: flex; flex-direction: column; gap: 12px; }

/* ── Skeleton ── */
.mt-sk {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: clamp(14px, 2vw, 20px);
  background: var(--mt-panel);
  border: 1px solid var(--mt-line-soft);
  border-radius: 18px;
}
.mt-sk__head { display: flex; align-items: center; gap: 12px; }
.mt-sk__bar { border-radius: 6px; background: var(--c-skeleton); }
.mt-sk__axis { display: flex; gap: 12px; }
.mt-sk__side { flex: 1; height: 118px; border-radius: 13px; background: var(--c-skeleton); }

/* ── Blank states ── */
.mt-blank {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 11px;
  padding: 64px 20px;
  text-align: center;
}
.mt-blank__mark {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--c-muted) 12%, transparent);
}
.mt-blank__title {
  margin: 0;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: 1.12rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--c-text);
}
.mt-blank__body {
  margin: 0;
  max-width: 34ch;
  font-size: 0.88rem;
  line-height: 1.55;
  color: var(--c-muted);
}
.mt-blank__cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--c-trade);
  text-decoration: none;
}
.mt-blank__cta:hover { text-decoration: underline; text-underline-offset: 3px; }
.mt-blank__cta:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 3px; border-radius: 4px; }
</style>
