<script setup>
// The stores, servers and groups a trader follows.
//
// Local context that the rest of the profile cannot give you: two people in
// the same shop are a far easier trade than two people who merely both play.
// Needs the widened community_follow select policy (20260805) to see anyone
// else's follows at all.
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { fetchFollowing } from "@/lib/communityFollow";
import CommunityKindIcon from "@/components/community/CommunityKindIcon.vue";

const props = defineProps({
  traderId: { type: String, default: null },
  // A handful is context; the full list is the account page's job.
  limit: { type: Number, default: 8 },
});
// The parent decides whether the whole page is empty, and it cannot see inside
// a section that fetches for itself.
const emit = defineEmits(["count"]);

const { t } = useI18n();
const route = useRoute();
const locale = computed(() => route.params.locale || "en");

const rows = ref([]);

let reqId = 0;
watch(() => props.traderId, async (id) => {
  const mine = ++reqId;
  if (!id) { rows.value = []; emit("count", 0); return; }
  const data = await fetchFollowing(id);
  if (mine !== reqId) return;
  rows.value = data.slice(0, props.limit);
  emit("count", rows.value.length);
}, { immediate: true });
</script>

<template>
  <section v-if="rows.length" class="tc">
    <h3 class="tc__title">{{ t('traderProfile.communitiesTitle') }}</h3>
    <ul class="tc__list">
      <li v-for="c in rows" :key="c.id">
        <router-link class="tc__chip" :to="{ name: 'communityProfile', params: { locale, slug: c.slug } }">
          <img v-if="c.avatar_url" :src="c.avatar_url" alt="" class="tc__avatar" loading="lazy" />
          <span v-else class="tc__avatar tc__avatar--glyph" aria-hidden="true">
            <CommunityKindIcon :kind="c.kind" :size="13" />
          </span>
          <span class="tc__name">{{ c.name }}</span>
          <v-icon v-if="c.verified" icon="mdi-check-decagram" size="12" class="tc__verified" />
        </router-link>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.tc { margin-top: 26px; }

.tc__title {
  margin: 0 0 10px;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.16em; color: var(--c-muted);
}

.tc__list { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }

/* Chips, not cards: these are pointers to somewhere else, and stacking bordered
   tiles inside a surface that is already a card would nest them. */
.tc__chip {
  display: inline-flex; align-items: center; gap: 7px;
  max-width: 260px; min-height: 34px; padding: 0 11px 0 6px;
  border-radius: 999px;
  background: var(--tpb-panel, var(--c-surface-2));
  border: 1px solid var(--tpb-line, var(--c-border));
  box-shadow: var(--tpb-lit, none);
  color: var(--c-text); text-decoration: none;
  font-size: 12.5px; font-weight: 600;
  transition: border-color 0.15s ease, color 0.15s ease;
}
.tc__chip:hover { border-color: var(--c-trade); color: var(--c-trade); }
.tc__chip:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

.tc__avatar {
  width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
  object-fit: cover; background: var(--c-bg);
}
.tc__avatar--glyph {
  display: flex; align-items: center; justify-content: center;
  color: var(--c-muted);
}
.tc__name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.tc__verified { color: var(--c-trade); flex-shrink: 0; }

@media (pointer: coarse) { .tc__chip { min-height: 44px; } }
@media (prefers-reduced-motion: reduce) { .tc__chip { transition: none; } }
</style>
