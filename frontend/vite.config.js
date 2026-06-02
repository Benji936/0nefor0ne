import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    tailwindcss(),
  ],
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
        },
      },
    },
  },
})
