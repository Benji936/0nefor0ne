<script setup>
// Small, self-contained entry point to the Combo Explorer. Renders a button only
// when the given card actually has a parsed combo-relevant effect (client-only
// check against the static index, so it never affects SSR/prerender).
import { ref, onMounted, watch } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { getCardEffects } from "@/lib/effectIndex";

const props = defineProps({ cardId: { type: [String, Number], default: null } });
const route = useRoute();
const { t } = useI18n();
const show = ref(false);

async function check() {
  show.value = false;
  if (!props.cardId) return;
  const entry = await getCardEffects(props.cardId);
  show.value = !!entry?.fetches?.length;
}

onMounted(check);
watch(() => props.cardId, check);
</script>

<template>
  <router-link
    v-if="show"
    :to="`/${route.params.locale || 'en'}/combo/${cardId}`"
    class="inline-flex items-center gap-2 px-3 py-2 rounded-lg no-underline text-sm font-medium w-fit transition-opacity hover:opacity-80"
    style="background: var(--c-accent); color: #fff"
  >
    <v-icon icon="mdi-sitemap-outline" size="16" />
    {{ t('combo.explore') }}
  </router-link>
</template>
