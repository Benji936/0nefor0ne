<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { kindsOf, TYPE_KEYS } from "@/lib/communityKinds";
import CommunityKindIcon from "@/components/community/CommunityKindIcon.vue";
import FollowButton from "@/components/community/FollowButton.vue";
const props = defineProps({
  community: { type: Object, required: true },
  currentUserId: { type: String, default: null },
});
defineEmits(["auth-required"]);
const route = useRoute();
const locale = route.params.locale || "en";
const { t } = useI18n();

// The meta line has room for one word. A community that is several things gets
// the primary kind spelled out and the rest as glyphs, rather than a comma list
// that pushes the city off the card.
const kinds = computed(() => kindsOf(props.community));
const primary = computed(() => kinds.value[0] ?? "group");
const extras = computed(() => kinds.value.slice(1));
const kindsLabel = computed(() =>
  kinds.value.map((k) => t(TYPE_KEYS[k] ?? TYPE_KEYS.group)).join(", "));
</script>
<template>
  <router-link
    class="cc"
    :to="{ name: 'communityProfile', params: { locale, slug: community.slug } }"
  >
    <!-- Banner strip (image, or a tinted fallback with the kind glyph) -->
    <div class="cc__banner">
      <img v-if="community.banner_url" :src="community.banner_url" alt="" />
      <span v-else class="cc__banner-mark" aria-hidden="true">
        <CommunityKindIcon :kind="primary" :size="34" />
      </span>
    </div>

    <div class="cc__avatar">
      <img v-if="community.avatar_url" :src="community.avatar_url" alt="" />
      <span v-else>{{ (community.name || '?')[0].toUpperCase() }}</span>
    </div>

    <div class="cc__body">
      <div class="cc__top">
        <span class="cc__name">{{ community.name }}</span>
        <v-icon v-if="community.verified" icon="mdi-check-decagram" size="15" class="cc__verified" />
      </div>
      <div class="cc__meta">
        <span class="cc__kind" :aria-label="kindsLabel">
          <CommunityKindIcon :kind="primary" :size="12" />
          <span aria-hidden="true">{{ $t(TYPE_KEYS[primary] || 'community.typeGroup') }}</span>
          <CommunityKindIcon v-for="k in extras" :key="k" :kind="k" :size="12" aria-hidden="true" />
        </span>
        <span v-if="community.city">· {{ community.city }}<template v-if="community.country">, {{ community.country }}</template></span>
      </div>
      <div v-if="community.remote_duel" class="cc__remote">
        <v-icon icon="mdi-web" size="12" /> {{ $t('community.remoteDuel') }}
      </div>
    </div>

    <!-- Follow sits over the banner so it never competes with the card link -->
    <FollowButton
      class="cc__follow"
      compact
      :community-id="community.id"
      :user-id="currentUserId"
      :count="community.follower_count ?? 0"
      @update:count="community.follower_count = $event"
      @auth-required="$emit('auth-required')"
    />
  </router-link>
</template>
<style scoped>
.cc {
  position: relative;
  display: flex; flex-direction: column;
  border: 1.5px solid var(--c-border); border-radius: 16px;
  background: var(--c-surface); text-decoration: none; color: var(--c-text);
  overflow: hidden;
  transition: border-color .15s, transform .15s;
}
.cc:hover { border-color: var(--c-trade); transform: translateY(-2px); }

/* Banner */
.cc__banner {
  height: 76px; width: 100%;
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--c-trade) 26%, var(--c-surface-2)),
    var(--c-surface-2));
  overflow: hidden;
}
.cc__banner img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cc__banner-mark {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  color: color-mix(in srgb, var(--c-trade) 60%, transparent);
}

/* Avatar overlaps the banner's bottom edge */
.cc__avatar {
  position: absolute; top: 52px; left: 14px;
  width: 48px; height: 48px; border-radius: 12px;
  overflow: hidden; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--c-surface-2); font-weight: 800;
  border: 2.5px solid var(--c-surface);
}
.cc__avatar img { width: 100%; height: 100%; object-fit: cover; }

.cc__body {
  padding: 32px 14px 14px;      /* top room for the overlapping avatar */
  min-width: 0; display: flex; flex-direction: column; gap: 3px;
}
.cc__top { display: flex; align-items: center; gap: 5px; }
.cc__name { font-weight: 700; font-size: 14.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cc__verified { color: var(--c-mutual); flex-shrink: 0; }
.cc__meta { font-size: 12px; color: var(--c-muted); display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.cc__kind { display: inline-flex; align-items: center; gap: 4px; }
.cc__remote { font-size: 11px; color: var(--c-mutual); display: flex; align-items: center; gap: 3px; }

/* Follow overlay. Deliberately quieter than the profile's solid button: a grid
   of 24 filled amethyst pills would drown out the cards themselves, so here it
   is a scrim-backed outline that only fills in on hover. */
.cc__follow {
  position: absolute; top: 10px; right: 10px; z-index: 2;
  background: color-mix(in srgb, var(--c-bg) 62%, transparent);
  border-color: color-mix(in srgb, #fff 26%, transparent);
  color: #fff;
  backdrop-filter: blur(6px);
}
.cc:hover .cc__follow:not(.cf--on) {
  background: var(--c-trade);
  border-color: var(--c-trade);
}
.cc__follow.cf--on { color: #fff; }
</style>
