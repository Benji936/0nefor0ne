<script setup>
import { useRoute } from "vue-router";
const props = defineProps({ community: { type: Object, required: true } });
const route = useRoute();
const locale = route.params.locale || "en";
</script>
<template>
  <router-link
    class="cc"
    :to="{ name: 'communityProfile', params: { locale, slug: community.slug } }"
  >
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
        <span class="cc__kind">{{ community.kind }}</span>
        <span v-if="community.city">· {{ community.city }}<template v-if="community.country">, {{ community.country }}</template></span>
      </div>
      <div v-if="community.remote_duel" class="cc__remote">
        <v-icon icon="mdi-web" size="12" /> {{ $t('community.remoteDuel') }}
      </div>
    </div>
  </router-link>
</template>
<style scoped>
.cc { display:flex; gap:12px; padding:12px; border:1.5px solid var(--c-border); border-radius:14px; background:var(--c-surface); text-decoration:none; color:var(--c-text); transition:border-color .15s; }
.cc:hover { border-color:var(--c-trade); }
.cc__avatar { width:48px; height:48px; border-radius:12px; overflow:hidden; flex-shrink:0; display:flex; align-items:center; justify-content:center; background:var(--c-surface-2); font-weight:800; }
.cc__avatar img { width:100%; height:100%; object-fit:cover; }
.cc__body { min-width:0; display:flex; flex-direction:column; gap:2px; }
.cc__top { display:flex; align-items:center; gap:5px; }
.cc__name { font-weight:700; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.cc__verified { color:var(--c-mutual); }
.cc__meta { font-size:12px; color:var(--c-muted); text-transform:capitalize; }
.cc__remote { font-size:11px; color:var(--c-mutual); display:flex; align-items:center; gap:3px; }
</style>
