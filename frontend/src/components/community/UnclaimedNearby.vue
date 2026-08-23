<script setup>
// The answer to an empty Near me.
//
// Only verified places appear in a Near me search, and today almost nowhere has
// one. Left alone that is a dead end: the reader asked a fair question and got
// a blank. But the directory holds four and a half thousand seeded shops with
// coordinates, and the person most likely to be standing next to an unclaimed
// one is the person who runs it. So the blank becomes the only acquisition
// surface this feature has: these are near you, nobody has claimed them, is one
// of them yours?
//
// Owned-but-unverified shops are excluded upstream in unclaimed_near. Somebody
// already runs those, and inviting a stranger to claim them would be the wrong
// ask.
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { primaryKind, TYPE_KEYS } from "@/lib/communityKinds";
import { formatDistance } from "@/lib/near";
import CommunityKindIcon from "@/components/community/CommunityKindIcon.vue";

defineProps({
  /** Rows from unclaimed_near. */
  rows: { type: Array, default: () => [] },
});

const { t } = useI18n();
const route = useRoute();
const locale = computed(() => route.params.locale || "en");

function place(row) {
  return [row.city, row.country].filter(Boolean).join(", ");
}
</script>

<template>
  <section v-if="rows.length" class="un">
    <h2 class="un__title">{{ t('community.nearUnclaimedTitle') }}</h2>
    <p class="un__body">{{ t('community.nearUnclaimedBody') }}</p>

    <ul class="un__list">
      <li v-for="r in rows" :key="r.id">
        <router-link
          class="un__row"
          :to="{ name: 'communityProfile', params: { locale, slug: r.slug } }"
        >
          <span class="un__avatar">
            <img v-if="r.avatar_url" :src="r.avatar_url" alt="" loading="lazy" decoding="async" />
            <span v-else aria-hidden="true">{{ (r.name || '?')[0].toUpperCase() }}</span>
          </span>

          <span class="un__text">
            <span class="un__name">{{ r.name }}</span>
            <span class="un__meta">
              <CommunityKindIcon :kind="primaryKind(r) || 'group'" :size="12" />
              {{ t(TYPE_KEYS[primaryKind(r)] || 'community.typeGroup') }}
              <template v-if="place(r)">· {{ place(r) }}</template>
            </span>
          </span>

          <span v-if="formatDistance(r.km)" class="un__km">{{ formatDistance(r.km) }}</span>
          <v-icon icon="mdi-chevron-right" size="18" class="un__go" />
        </router-link>
      </li>
    </ul>
  </section>
</template>

<style scoped>
/* One tonal step under the page with a hairline and a 1px top highlight, the
   ground every panel in this pass sits on (DESIGN.md, The Flat-By-Default
   Rule). Fallbacks for the case where this renders outside the directory. */
.un {
  width: 100%; max-width: 560px; margin: 0 auto;
  text-align: left;
  padding: 20px;
  border: 1px solid var(--cd-line, var(--c-border));
  border-radius: 16px;
  background: var(--cd-panel, var(--c-surface));
  box-shadow: var(--cd-lit, none);
}

.un__title {
  margin: 0 0 6px;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: 1.08rem; font-weight: 700; letter-spacing: -0.02em; color: var(--c-text);
}
.un__body {
  margin: 0 0 14px;
  font-size: 0.8rem; line-height: 1.55; color: var(--c-muted);
}

.un__list { list-style: none; margin: 0; padding: 0; }
.un__list li + li { border-top: 1px solid var(--cd-line-soft, var(--c-border)); }

.un__row {
  display: flex; align-items: center; gap: 11px;
  padding: 9px 6px;
  text-decoration: none; color: var(--c-text);
  border-radius: 10px;
  transition: background .15s ease;
}
.un__row:hover { background: var(--c-surface-2); }
.un__row:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

.un__avatar {
  width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
  overflow: hidden; display: flex; align-items: center; justify-content: center;
  background: var(--c-surface-2); color: var(--c-muted);
  font-size: 13px; font-weight: 800;
}
.un__avatar img { width: 100%; height: 100%; object-fit: cover; }

.un__text { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
.un__name {
  font-size: 13.5px; font-weight: 700;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.un__meta {
  display: flex; align-items: center; gap: 4px;
  font-size: 11.5px; font-weight: 600; color: var(--c-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.un__km {
  flex-shrink: 0;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.72rem; font-weight: 700; color: var(--c-text);
}
.un__go { color: var(--c-muted); flex-shrink: 0; }

@media (prefers-reduced-motion: reduce) {
  .un__row { transition: none; }
}
</style>
