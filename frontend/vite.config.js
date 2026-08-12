import { fileURLToPath, URL } from 'node:url'

import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import { TOP_CARD_IDS } from './src/data/card-ids.js'
import { TOP_SET_SLUGS } from './src/data/set-slugs.js'
import { TOP_COMMUNITY_SLUGS } from './src/data/community-slugs.js'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

// Card IDs to prerender, written by scripts/generate-sitemap.mjs earlier in the
// same `npm run build` from the same Supabase query that produced sitemap.xml.
// Reading it here is what keeps the two lists identical. Absent when vite-ssg is
// run on its own, which is why TOP_CARD_IDS remains as the floor.
function prerenderCardIds() {
  try {
    const ids = JSON.parse(readFileSync('./src/data/prerender-cards.generated.json', 'utf8'))
    if (Array.isArray(ids) && ids.length) return ids
    console.warn('[ssg] prerender manifest is empty — falling back to TOP_CARD_IDS')
  } catch {
    console.warn('[ssg] no prerender manifest (run scripts/generate-sitemap.mjs first) — falling back to TOP_CARD_IDS')
  }
  return TOP_CARD_IDS
}

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
    // Emit en/cards/index.html rather than en/cards.html.
    //
    // Vercel resolved /en/ to dist/en/index.html and served the SPA shell for
    // everything else, because it will not try cards.html for an extensionless
    // /en/cards. 250 of the 254 URLs in sitemap.xml were that shell.
    //
    // `cleanUrls: true` fixes the lookup and breaks the SPA fallback: with it
    // on, every route we do NOT prerender — /en/library, /en/decks, the 184
    // card pages outside TOP_CARD_IDS — returned a hard 404 instead of the
    // shell. Directory indexes need no such flag. /en/ already proved they are
    // resolved before the rewrite in vercel.json is consulted; nesting extends
    // that to every prerendered page and leaves the fallback untouched.
    dirStyle: 'nested',
    async includedRoutes(paths, routes) {
      const locales = ['en', 'fr', 'de', 'it']

      const included = []

      // Homepages: /en/, /fr/, /de/, /it/
      for (const locale of locales) {
        included.push(`/${locale}/`)
      }

      // Static content pages, all locales. terms and built-with were in
      // sitemap.xml but not here, so all eight resolved to the SPA shell.
      for (const locale of locales) {
        included.push(`/${locale}/privacy`)
        included.push(`/${locale}/terms`)
        included.push(`/${locale}/built-with`)
      }

      // English card pages (non-English redirect to /en/). Same IDs the sitemap
      // lists — see prerenderCardIds above.
      for (const id of prerenderCardIds()) {
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

      return included
    },
  },
}))
