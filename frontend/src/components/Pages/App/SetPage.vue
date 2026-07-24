<template>
  <div class="max-w-5xl mx-auto px-4 py-6">
    <!-- Back link -->
    <a
      href="#"
      class="text-sm no-underline hover:opacity-70 flex items-center gap-1 mb-4"
      style="color: var(--c-muted)"
      @click.prevent="$router.back()"
    >
      <v-icon icon="mdi-chevron-left" size="16" /> {{ $t('setPage.backToSearch') }}
    </a>

    <!-- Error state -->
    <div v-if="error" class="text-center py-16">
      <p class="text-lg font-semibold mb-2" style="color: var(--c-text)">{{ error || $t('setPage.notFound') }}</p>
      <router-link to="/" class="text-sm no-underline hover:opacity-70" style="color: var(--c-accent)">{{ $t('setPage.backToSearch') }}</router-link>
    </div>

    <!-- Loading state -->
    <div v-else-if="loading">
      <div class="h-8 w-48 rounded mb-2 animate-pulse" style="background: var(--c-surface-2)"></div>
      <div class="h-4 w-24 rounded mb-6 animate-pulse" style="background: var(--c-surface-2)"></div>
      <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
        <div v-for="n in 12" :key="n" class="rounded-lg aspect-[3/4] animate-pulse" style="background: var(--c-surface-2)"></div>
      </div>
    </div>

    <!-- Loaded state -->
    <div v-else>
      <!-- H1 + card count -->
      <h1 class="text-2xl font-bold mb-1" style="color: var(--c-text)">{{ setName }}</h1>
      <p class="text-sm mb-4" style="color: var(--c-muted)">{{ $t('setPage.cardCount', { count: cardCount }) }}</p>

      <!-- Rarity distribution -->
      <div v-if="rarityDistribution.length" class="flex flex-wrap gap-2 mb-6">
        <span
          v-for="r in rarityDistribution"
          :key="r.rarity"
          class="text-xs px-2 py-1 rounded-full"
          style="background: var(--c-surface-2); color: var(--c-muted)"
        >
          {{ r.rarity }}: {{ r.count }}
        </span>
      </div>

      <!-- Card grid -->
      <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
        <router-link
          v-for="card in cards"
          :key="card.id"
          :to="`/${$route.params.locale || 'en'}/card/${card.id}`"
          class="no-underline rounded-lg overflow-hidden transition-opacity hover:opacity-80 flex flex-col"
          style="background: var(--c-surface-2)"
        >
          <img
            v-if="card.image"
            :src="card.image"
            :alt="card.name"
            loading="lazy"
            class="w-full aspect-[59/86] object-cover"
          />
          <div class="!p-2 flex flex-col gap-0.5">
            <p class="text-xs font-semibold leading-tight line-clamp-2" style="color: var(--c-text)">{{ card.name }}</p>
            <p v-if="card.setCode" class="text-xs font-mono" style="color: var(--c-muted)">{{ card.setCode }}</p>
            <p v-if="card.rarity" class="text-xs" style="color: var(--c-muted)">{{ card.rarity }}</p>
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
import { getCardsBySet } from '@/api'

export default {
  name: 'SetPage',

  setup() {
    const route = useRoute()
    const ssrSetData = ref(null)

    // Build-time prefetch: vite-ssg awaits this before snapshotting HTML.
    onServerPrefetch(async () => {
      const setName = decodeURIComponent(route.params.setSlug)
      try {
        const res = await getCardsBySet(setName)
        const raw = res?.data?.data ?? []
        if (!raw.length) throw new Error(`No cards for set: ${setName}`)

        const cards = raw.map(card => {
          const printing = card.card_sets?.find(s => s.set_name === setName) ?? card.card_sets?.[0] ?? null
          return {
            id: card.id,
            name: card.name,
            image: card.card_images?.[0]?.image_url_small ?? card.card_images?.[0]?.image_url ?? null,
            setCode: printing?.set_code ?? null,
            rarity: printing?.set_rarity ?? null,
          }
        })

        ssrSetData.value = { setName, cards }
      } catch (e) {
        console.warn(`[vite-ssg] Skipping set "${route.params.setSlug}" — ${e.message}`)
        throw e  // MUST throw to skip route in vite-ssg
      }
    })

    // useHead must be in setup() so it runs during SSR
    useHead(computed(() => {
      const data = ssrSetData.value
      if (!data) {
        return {
          title: 'Yu-Gi-Oh! Set | One for One',
          meta: [
            { name: 'description', content: 'Browse Yu-Gi-Oh! card sets on One for One — the free trading platform.' },
            { property: 'og:title', content: 'Yu-Gi-Oh! Set | One for One' },
            { property: 'og:description', content: 'Browse Yu-Gi-Oh! card sets on One for One.' },
            { property: 'og:image', content: 'https://0nefor.one/logo.png' },
            { property: 'og:url', content: 'https://0nefor.one/en/set/' },
            { property: 'og:type', content: 'website' },
            { name: 'twitter:card', content: 'summary' },
            { name: 'twitter:title', content: 'Yu-Gi-Oh! Set | One for One' },
            { name: 'twitter:description', content: 'Browse Yu-Gi-Oh! card sets on One for One.' },
            { name: 'twitter:image', content: 'https://0nefor.one/logo.png' },
          ],
          link: [
            { rel: 'canonical', href: 'https://0nefor.one/en/set/' }
          ],
          script: [
            {
              type: 'application/ld+json',
              innerHTML: JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'CollectionPage',
                name: decodeURIComponent(route.params.setSlug || ''),
                url: `https://0nefor.one/${route.params.locale || 'en'}/set/${route.params.setSlug || ''}`,
              })
            }
          ],
        }
      }

      const { setName, cards } = data
      const desc = `Browse all ${cards.length} cards in the ${setName} Yu-Gi-Oh! set. Trade or find them on One for One — the free card trading platform.`
      const truncDesc = desc.length > 155 ? desc.slice(0, 155) + '…' : desc
      const ogImage = cards[0]?.image ?? 'https://0nefor.one/logo.png'
      const canonicalUrl = `https://0nefor.one/${route.params.locale || 'en'}/set/${encodeURIComponent(setName)}`

      return {
        title: `${setName} — Yu-Gi-Oh! Set | One for One`,
        meta: [
          { name: 'description', content: truncDesc },
          { property: 'og:title', content: `${setName} — Yu-Gi-Oh! Set | One for One` },
          { property: 'og:description', content: truncDesc },
          { property: 'og:image', content: ogImage },
          { property: 'og:url', content: canonicalUrl },
          { property: 'og:type', content: 'website' },
          { name: 'twitter:card', content: 'summary' },
          { name: 'twitter:title', content: `${setName} — Yu-Gi-Oh! Set | One for One` },
          { name: 'twitter:description', content: truncDesc },
          { name: 'twitter:image', content: ogImage },
        ],
        link: [
          { rel: 'canonical', href: canonicalUrl }
        ],
        script: [
          {
            type: 'application/ld+json',
            innerHTML: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'CollectionPage',
              name: setName,
              description: truncDesc,
              url: canonicalUrl,
              mainEntity: {
                '@type': 'ItemList',
                name: `${setName} card list`,
                numberOfItems: cards.length,
                itemListElement: cards.map((card, i) => ({
                  '@type': 'ListItem',
                  position: i + 1,
                  name: card.name,
                  url: `https://0nefor.one/${route.params.locale || 'en'}/card/${card.id}`,
                }))
              }
            })
          }
        ]
      }
    }))

    return { ssrSetData }
  },

  data() {
    return {
      cards: [],
      loading: true,
      error: null,
    }
  },

  computed: {
    setName() {
      return decodeURIComponent(this.$route.params.setSlug || '')
    },
    cardCount() {
      return this.cards.length
    },
    rarityDistribution() {
      const counts = {}
      for (const card of this.cards) {
        if (card.rarity) {
          counts[card.rarity] = (counts[card.rarity] || 0) + 1
        }
      }
      return Object.entries(counts)
        .map(([rarity, count]) => ({ rarity, count }))
        .sort((a, b) => b.count - a.count)
    },
  },

  mounted() {
    if (this.ssrSetData) {
      this.cards = this.ssrSetData.cards
      this.loading = false
    } else {
      this.fetchCards()
    }
  },

  watch: {
    '$route.params.setSlug'() {
      this.cards = []
      this.loading = true
      this.error = null
      // refs returned from setup() are auto-unwrapped via `this` in Vue 3 Options API
      this.ssrSetData = null
      this.fetchCards()
    }
  },

  methods: {
    async fetchCards() {
      this.loading = true
      this.error = null
      try {
        const res = await getCardsBySet(this.setName)
        const raw = res?.data?.data ?? []
        if (!raw.length) {
          this.error = this.$t ? this.$t('setPage.notFound') : 'Set not found'
          this.loading = false
          return
        }
        this.cards = raw.map(card => {
          const printing = card.card_sets?.find(s => s.set_name === this.setName) ?? card.card_sets?.[0] ?? null
          return {
            id: card.id,
            name: card.name,
            image: card.card_images?.[0]?.image_url_small ?? card.card_images?.[0]?.image_url ?? null,
            setCode: printing?.set_code ?? null,
            rarity: printing?.set_rarity ?? null,
          }
        })
        // Drive useHead() reactively on the client as well
        this.ssrSetData = { setName: this.setName, cards: this.cards }
        this.loading = false
      } catch {
        this.error = this.$t ? this.$t('setPage.notFound') : 'Set not found'
        this.loading = false
      }
    },
  },
}
</script>
