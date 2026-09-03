<template>
  <div class="max-w-5xl mx-auto px-4 py-6">
    <h1 class="text-2xl font-bold !mb-2" style="color: var(--c-text)">
      {{ t('setsIndex.heading') }}
    </h1>
    <p class="text-sm !mb-6" style="color: var(--c-muted); max-width: 60ch">
      {{ t('setsIndex.intro', { count: TOP_SET_SLUGS.length }) }}
    </p>

    <ul class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 list-none !p-0">
      <li v-for="name in sortedSets" :key="name">
        <router-link
          :to="`/en/set/${encodeURIComponent(name)}`"
          class="text-sm no-underline hover:underline"
          style="color: var(--c-accent)"
        >{{ name }}</router-link>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHead } from '@unhead/vue'
import { TOP_SET_SLUGS } from '@/data/set-slugs.js'
import { ldScript } from '@/lib/jsonLd'

const BASE = 'https://0nefor.one'
const { t } = useI18n()

// TOP_SET_SLUGS is curated in release order, which is the right order for a
// prerender list and the wrong one for a reader looking up a set by name.
const sortedSets = computed(() =>
  [...TOP_SET_SLUGS].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })))

// As on the archetypes hub: App.vue's global useHead resolves meta.sets.* from
// the route name, so only the structured data belongs here.
useHead({
  script: [
    ldScript({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Yu-Gi-Oh! card sets',
      url: `${BASE}/en/sets`,
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: TOP_SET_SLUGS.length,
        itemListElement: TOP_SET_SLUGS.map((name, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name,
          url: `${BASE}/en/set/${encodeURIComponent(name)}`,
        })),
      },
    }),
    ldScript({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/en/` },
        { '@type': 'ListItem', position: 2, name: 'Card Sets', item: `${BASE}/en/sets` },
      ],
    }),
  ],
})
</script>
