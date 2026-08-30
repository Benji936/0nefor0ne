<script setup>
import { useHead } from "@unhead/vue";
import { useI18n } from "vue-i18n";
import SearchTrending from "./search/SearchTrending.vue";
import SearchTraders from "./search/SearchTraders.vue";
import SearchSets from "./search/SearchSets.vue";

const { t } = useI18n();

useHead({
  title: t("meta.home.title"),
  meta: [{ name: "description", content: t("meta.home.desc") }],
});
</script>

<template>
  <div class="hm">
    <!-- What is moving, then who is here, then what has landed.
         Cards are always here; people and prices are what changed since last
         time, so those go first. The set browser used to sit above them, which
         put a search box a reader had not asked for at the top of the page. -->
    <SearchTrending />
    <SearchTraders />
    <SearchSets />
  </div>
</template>

<style scoped>
/* Borrowed from the landing page (its --lp-* set), as the account, collection
   and matches pages already do: panels sit one tonal step under the page rather
   than above it, hairlines are a fraction of the border token, and depth is a
   1px top highlight instead of a drop shadow — lit from above, per DESIGN.md's
   Flat-By-Default Rule.
   Declared here and read by the three sections, so the home page has one ground
   rather than three that drift apart. */
.hm {
  --hm-panel: color-mix(in srgb, var(--c-surface) 94%, var(--c-bg));
  --hm-line: color-mix(in srgb, var(--c-border) 60%, transparent);
  --hm-line-soft: color-mix(in srgb, var(--c-border) 34%, transparent);
  --hm-lit: inset 0 1px 0 color-mix(in srgb, var(--c-text) 8%, transparent);

  max-width: 1400px;
  display: flex;
  flex-direction: column;
  gap: clamp(34px, 5vw, 56px);
  padding: 20px 0 64px;
}
@media (min-width: 768px) { .hm { padding-top: 30px; } }

/* Section labels in the collector's own register: monospace, uppercase, widely
   tracked (DESIGN.md, The Mono Identifier Rule), matching every other page in
   this pass. Defined once here with :deep so the three sections share it
   instead of each restating it. */
.hm :deep(.hm-eyebrow) {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--c-muted);
}
.hm :deep(.hm-eyebrow--sub) { font-size: 0.64rem; letter-spacing: 0.14em; margin-bottom: 4px; }
.hm :deep(.hm-eyebrow__sep) { opacity: 0.5; }
</style>
