<template>
  <div class="max-w-5xl mx-auto px-4 py-6">
    <h1 class="text-2xl font-bold !mb-2" style="color: var(--c-text)">
      {{ t('archetypesIndex.heading') }}
    </h1>
    <p class="text-sm !mb-6" style="color: var(--c-muted); max-width: 60ch">
      {{ t('archetypesIndex.intro', { count: ARCHETYPES.length }) }}
    </p>

    <!-- Anchor nav. 529 rows is more than a reader will scroll, and it is the
         only navigation this page can offer without paginating — which would
         split the hub's link equity across pages that each list a fraction. -->
    <nav class="flex flex-wrap gap-1 !mb-8" :aria-label="t('archetypesIndex.jumpLabel')">
      <a
        v-for="section in sections"
        :key="section.letter"
        :href="`#letter-${section.letter === '#' ? 'other' : section.letter}`"
        class="text-xs font-mono font-semibold no-underline rounded !px-2 !py-1 hover:opacity-70"
        style="background: var(--c-surface-2); color: var(--c-accent)"
      >{{ section.letter }}</a>
    </nav>

    <section
      v-for="section in sections"
      :key="section.letter"
      :id="`letter-${section.letter === '#' ? 'other' : section.letter}`"
      class="!mb-8"
    >
      <h2 class="text-lg font-bold !mb-3 !pb-1" style="color: var(--c-text); border-bottom: 1px solid var(--c-surface-2)">
        {{ section.letter }}
      </h2>
      <ul class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 list-none !p-0">
        <li v-for="a in section.items" :key="a.slug">
          <router-link
            :to="`/en/archetype/${a.slug}`"
            class="text-sm no-underline hover:underline"
            style="color: var(--c-accent)"
          >{{ a.name }}</router-link>
          <span class="text-xs !ml-1" style="color: var(--c-muted)">{{ a.cards }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHead } from '@unhead/vue'
import { ARCHETYPES } from '@/data/archetype-slugs.js'
import { groupByInitial } from '@/lib/hubIndex.js'
import { ldScript } from '@/lib/jsonLd'

const BASE = 'https://0nefor.one'
const { t } = useI18n()

// Everything this page renders is committed data, so there is no prefetch and
// no loading state: vite-ssg gets the finished page on the first pass. That is
// deliberate — a hub that renders empty for a crawler is worth less than no hub.
const sections = computed(() => groupByInitial(ARCHETYPES, (a) => a.name))

// Title, description, canonical and hreflang all come from App.vue's global
// useHead, which resolves meta.<route.name>.* — hence the route name
// `archetypes` and the meta.archetypes.* keys. Only the structured data is
// page-specific, so only that is declared here.
useHead({
  script: [
    ldScript({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Yu-Gi-Oh! archetypes',
      url: `${BASE}/en/archetypes`,
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: ARCHETYPES.length,
        itemListElement: ARCHETYPES.map((a, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: a.name,
          url: `${BASE}/en/archetype/${a.slug}`,
        })),
      },
    }),
    ldScript({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/en/` },
        { '@type': 'ListItem', position: 2, name: 'Archetypes', item: `${BASE}/en/archetypes` },
      ],
    }),
  ],
})
</script>
