<script setup>
import { useHead } from "@unhead/vue";
import { useI18n } from "vue-i18n";
import SearchLatestReleases from "./search/SearchLatestReleases.vue";
import SearchSetBrowser from "./search/SearchSetBrowser.vue";
import SearchTrending from "./search/SearchTrending.vue";

const { t } = useI18n();

useHead({
  title: t("meta.home.title"),
  meta: [{ name: "description", content: t("meta.home.desc") }],
});
</script>

<template>
  <v-container fluid class="py-5" style="max-width: 1500px; margin-left: 0; padding-left: 0.75rem;">

    <div class="d-flex flex-column gap-6">
      <SearchTrending />
      <SearchLatestReleases />
      <SearchSetBrowser />
    </div>
  </v-container>
</template>
