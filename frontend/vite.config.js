import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import { TOP_CARD_IDS } from './src/data/card-ids.js'
import { TOP_SET_SLUGS } from './src/data/set-slugs.js'
import { TOP_COMMUNITY_SLUGS } from './src/data/community-slugs.js'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    vue(),
    command === 'serve' && vueDevTools(),
    tailwindcss(),
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Vuetify + MDI icons → their own chunk (heaviest vendor, ~600 KB)
          if (id.includes('vuetify') || id.includes('@mdi')) return 'vuetify';
          // Vue core + router + i18n → small shared chunk loaded on every page
          if (id.includes('node_modules/vue') || id.includes('vue-router') || id.includes('vue-i18n')) return 'vue';
          // Supabase client → only needed after auth, lazy chunk
          if (id.includes('@supabase')) return 'supabase';
          // Axios → used for API calls, shared but small
          if (id.includes('axios')) return 'axios';
          // ocgcore-wasm → lazy engine bundle for /simulator only
          if (id.includes('ocgcore-wasm')) return 'ocgcore';
        },
      },
    },
  },
  ssr: {
    // Vuetify component CSS files can't be loaded as ESM in Node — externalize them
    noExternal: ['vuetify'],
  },
  ssgOptions: {
    script: 'async',
    formatting: 'minify',
    async includedRoutes(paths, routes) {
      const locales = ['en', 'fr', 'de', 'it']

      const included = []

      // Homepages: /en/, /fr/, /de/, /it/
      for (const locale of locales) {
        included.push(`/${locale}/`)
      }

      // Privacy pages: /en/privacy, /fr/privacy, /de/privacy, /it/privacy
      for (const locale of locales) {
        included.push(`/${locale}/privacy`)
      }

      // Top-16 English card pages (English only — non-English redirect to /en/)
      // IDs sourced from src/data/card-ids.js (single source of truth)
      for (const id of TOP_CARD_IDS) {
        included.push(`/en/card/${id}`)
      }

      // Set pages — English-only (set names are always English)
      for (const setName of TOP_SET_SLUGS) {
        included.push('/en/set/' + encodeURIComponent(setName))
      }

      // Dedicated card search/browse page: /en/cards, /fr/cards, /de/cards, /it/cards
      for (const locale of locales) {
        included.push(`/${locale}/cards`)
      }

      // Community directory — all locales; curated profile pages — English canonical.
      // TOP_COMMUNITY_SLUGS is currently empty (DB seed deferred, see src/data/community-slugs.js).
      for (const locale of locales) {
        included.push(`/${locale}/community`)
      }
      for (const slug of TOP_COMMUNITY_SLUGS) {
        included.push('/en/community/' + slug)
      }

      return included  // 4 + 4 + 16 + 30 + 4 + 4 + TOP_COMMUNITY_SLUGS.length = 62 + N paths
    },
  },
}))
