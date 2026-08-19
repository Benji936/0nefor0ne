<template>
  <div class="max-w-5xl mx-auto px-4 py-6">
    <a
      href="#"
      class="text-sm no-underline hover:opacity-70 flex items-center gap-1 mb-4"
      style="color: var(--c-muted)"
      @click.prevent="$router.back()"
    >
      <v-icon icon="mdi-chevron-left" size="16" /> {{ $t('archetypePage.back') }}
    </a>

    <div v-if="error" class="text-center py-16">
      <p class="text-lg font-semibold mb-2" style="color: var(--c-text)">{{ $t('archetypePage.notFound') }}</p>
      <router-link :to="`/${$route.params.locale || 'en'}/cards`" class="text-sm no-underline hover:opacity-70" style="color: var(--c-accent)">
        {{ $t('archetypePage.back') }}
      </router-link>
    </div>

    <div v-else-if="loading">
      <div class="h-8 w-56 rounded mb-2 animate-pulse" style="background: var(--c-surface-2)"></div>
      <div class="h-4 w-32 rounded mb-6 animate-pulse" style="background: var(--c-surface-2)"></div>
      <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
        <div v-for="n in 12" :key="n" class="rounded-lg aspect-[3/4] animate-pulse" style="background: var(--c-surface-2)"></div>
      </div>
    </div>

    <div v-else>
      <header class="flex gap-4 items-start mb-6">
        <img
          v-if="artUrl"
          :src="artUrl"
          :alt="archetypeName"
          fetchpriority="high"
          class="w-24 sm:w-32 rounded-lg shrink-0"
          style="background: var(--c-surface-2)"
        />
        <div class="min-w-0">
          <h1 class="text-2xl font-bold mb-1" style="color: var(--c-text)">
            {{ $t('archetypePage.heading', { name: archetypeName }) }}
          </h1>
          <p class="text-sm mb-2" style="color: var(--c-muted)">
            {{ $t('archetypePage.cardCount', { count: cards.length }) }}
          </p>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="b in breakdown"
              :key="b.label"
              class="text-xs px-2 py-1 rounded-full"
              style="background: var(--c-surface-2); color: var(--c-muted)"
            >
              {{ b.label }}: {{ b.count }}
            </span>
          </div>
        </div>
      </header>

      <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
        <router-link
          v-for="card in cards"
          :key="card.id"
          :to="`/${$route.params.locale || 'en'}/card/${card.id}`"
          class="no-underline rounded-lg overflow-hidden transition-opacity hover:opacity-80 flex flex-col"
          style="background: var(--c-surface-2)"
        >
          <img
            :src="cardImage(card.id)"
            :alt="card.name"
            loading="lazy"
            class="w-full aspect-[59/86] object-cover"
          />
          <div class="!p-2 flex flex-col gap-0.5">
            <p class="text-xs font-semibold leading-tight line-clamp-2" style="color: var(--c-text)">{{ card.name }}</p>
            <p v-if="card.type" class="text-xs" style="color: var(--c-muted)">{{ card.type }}</p>
          </div>
        </router-link>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onServerPrefetch } from 'vue'
import { useRoute } from 'vue-router'
import { useHead } from '@unhead/vue'
import { getCardsByArchetype } from '@/api'
import { ARCHETYPE_BY_SLUG } from '@/data/archetype-slugs.js'
import { cardImage } from '@/lib/cardImage'
import { ldScript } from '@/lib/jsonLd'

const BASE = 'https://0nefor.one'

// Below this an archetype page is a stub, not a page: a heading, a couple of
// cards, and nothing a reader could not get from the card pages themselves.
// Google's helpful-content signal is site-wide, so a few hundred stubs would
// cost the pages that are good. Falling under the floor throws, vite-ssg skips
// the route, and prune-sitemap.mjs drops it from sitemap.xml — the page is never
// built and never advertised.
const MIN_CARDS = 3

// No image URL is carried: cardImage(id) resolves to the project's own R2 CDN,
// which is where every other card image in the app comes from and what the
// global broken-image fallback in lib/cardImage.js expects. Taking the API's
// image_url_small instead — as SetPage.vue does — bypasses both, and multiplies
// out to a URL per card across 650-odd prerendered pages for nothing.
function shape(raw) {
  return raw.map(c => ({
    id: c.id,
    name: c.name,
    type: c.type,
    frameType: c.frameType,
  }))
}

export default {
  name: 'ArchetypePage',

  setup() {
    const route = useRoute()
    const ssrData = ref(null)

    // cards/loading/error live here rather than in data() so onServerPrefetch
    // can fill them before renderToString runs. Putting them in data() and
    // populating from mounted() — which is what SetPage.vue did — means the
    // prerendered HTML is the loading skeleton: a heading-less page with about
    // 100 characters of nav chrome and no card list, for every crawler that
    // does not execute JavaScript. The page looks perfect in a browser, which
    // is why it survived.
    const cards = ref([])
    const loading = ref(true)
    const error = ref(false)

    const entry = computed(() => ARCHETYPE_BY_SLUG.get(route.params.slug) ?? null)

    onServerPrefetch(async () => {
      const found = ARCHETYPE_BY_SLUG.get(route.params.slug)
      if (!found) throw new Error(`Unknown archetype slug: ${route.params.slug}`)
      const res = await getCardsByArchetype(found.name)
      const raw = res?.data?.data ?? []
      if (raw.length < MIN_CARDS) {
        console.warn(`[vite-ssg] Skipping archetype "${found.name}" — ${raw.length} card(s), under the ${MIN_CARDS} floor`)
        throw new Error(`Too few cards for archetype ${found.name}`)
      }
      ssrData.value = { name: found.name, artId: found.artId, cards: shape(raw) }
      cards.value = ssrData.value.cards
      loading.value = false
    })

    useHead(computed(() => {
      const slug = route.params.slug || ''
      const canonical = `${BASE}/en/archetype/${slug}`
      const data = ssrData.value
      const name = data?.name ?? entry.value?.name ?? ''
      const artId = data?.artId ?? entry.value?.artId ?? null
      const image = artId ? cardImage(artId) : `${BASE}/logo.png`

      const title = name
        ? `${name} Archetype — Every Yu-Gi-Oh! Card | One for One`
        : 'Yu-Gi-Oh! Archetype | One for One'

      const desc = data
        ? `All ${data.cards.length} cards in the ${name} Yu-Gi-Oh! archetype, with art and card text. Find them in other collectors' trade piles on One for One.`
        : `Every card in the ${name || 'Yu-Gi-Oh!'} archetype, with art and card text, on One for One.`
      const truncDesc = desc.length > 155 ? desc.slice(0, 155) + '…' : desc

      return {
        title,
        meta: [
          { name: 'description', content: truncDesc },
          { property: 'og:title', content: title },
          { property: 'og:description', content: truncDesc },
          { property: 'og:image', content: image },
          { property: 'og:url', content: canonical },
          { property: 'og:type', content: 'website' },
          { name: 'twitter:card', content: 'summary' },
          { name: 'twitter:title', content: title },
          { name: 'twitter:description', content: truncDesc },
          { name: 'twitter:image', content: image },
        ],
        // Canonical is always the /en URL: router/index.js 301s the other three
        // locales here, because archetype names have no translation to
        // differentiate on. hreflang is left to App.vue, which emits en +
        // x-default for this path shape — duplicating it here would produce two
        // sets of alternate links on the same page.
        link: [{ rel: 'canonical', href: canonical }],
        script: data
          ? [ldScript({
              '@context': 'https://schema.org',
              '@type': 'CollectionPage',
              name: `${name} archetype`,
              description: truncDesc,
              url: canonical,
              mainEntity: {
                '@type': 'ItemList',
                name: `${name} card list`,
                numberOfItems: data.cards.length,
                itemListElement: data.cards.map((c, i) => ({
                  '@type': 'ListItem',
                  position: i + 1,
                  name: c.name,
                  url: `${BASE}/en/card/${c.id}`,
                })),
              },
            })]
          : [],
      }
    }))

    return { ssrData, entry, cards, loading, error }
  },

  computed: {
    archetypeName() {
      return this.ssrData?.name ?? this.entry?.name ?? ''
    },
    artUrl() {
      const id = this.ssrData?.artId ?? this.entry?.artId ?? null
      return id ? cardImage(id) : null
    },
    // Monster / Spell / Trap counts — the first thing a player wants to know
    // about an archetype, and the one summary the card grid does not show.
    breakdown() {
      const counts = { Monster: 0, Spell: 0, Trap: 0 }
      for (const c of this.cards) {
        if (c.frameType === 'spell') counts.Spell++
        else if (c.frameType === 'trap') counts.Trap++
        else counts.Monster++
      }
      return Object.entries(counts)
        .filter(([, count]) => count > 0)
        .map(([label, count]) => ({ label, count }))
    },
  },

  mounted() {
    // Hydration: onServerPrefetch already filled cards/loading on a prerendered
    // page, so only a client-side arrival needs to fetch.
    if (!this.ssrData) this.fetchCards()
  },

  watch: {
    '$route.params.slug'() {
      this.cards = []
      this.loading = true
      this.error = false
      this.ssrData = null
      this.fetchCards()
    },
  },

  methods: {
    cardImage,

    async fetchCards() {
      const found = ARCHETYPE_BY_SLUG.get(this.$route.params.slug)
      if (!found) {
        this.error = true
        this.loading = false
        return
      }
      try {
        const res = await getCardsByArchetype(found.name, this.$route.params.locale || 'en')
        const raw = res?.data?.data ?? []
        if (!raw.length) {
          this.error = true
          this.loading = false
          return
        }
        this.cards = shape(raw)
        // Drives useHead reactively on the client too, same as SetPage.
        this.ssrData = { name: found.name, artId: found.artId, cards: this.cards }
        this.loading = false
      } catch {
        this.error = true
        this.loading = false
      }
    },
  },
}
</script>
