<script setup>
import { useHead } from "@unhead/vue";
import { useI18n } from "vue-i18n";
import SearchLatestReleases from "./search/SearchLatestReleases.vue";
import SearchSetBrowser from "./search/SearchSetBrowser.vue";
import SearchTraders from "./search/SearchTraders.vue";
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
      <!-- People first: the cards are always here, the people are the part that
           changes, and this is the only place in the app that says who else
           turned up.
           Then the set browser, because it is the one thing on this page you
           type into — a search box below two scrolling card rails is a search
           box nobody finds. The rails are for browsing and can wait. -->
      <SearchTraders />
      <SearchSetBrowser />
      <SearchTrending />
      <SearchLatestReleases />
    </div>
  </v-container>
</template>
