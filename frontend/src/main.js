import './assets/main.css'

import { ViteSSG } from 'vite-ssg'

import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import 'vuetify/styles' // Global CSS
import '@mdi/font/css/materialdesignicons.css' // Icons

import i18n, { SUPPORTED, setLocale } from './i18n.js'
import { routes, scrollBehavior } from './router/index.js'
import { installCardImageFallback } from './lib/cardImage.js'
import App from './views/App.vue'

export const createApp = ViteSSG(
  App,
  { routes, base: '/', scrollBehavior },
  ({ app, router, isClient }) => {
    // Note: @unhead/vue head is created by ViteSSG automatically (useHead: true default).
    // We must NOT call app.use(createUnhead()) here — that would create a second head
    // instance that vite-ssg wouldn't render during SSG.

    // Vuetify (SSR-aware)
    const vuetify = createVuetify({
      ssr: true,
      components,
      directives,
      theme: {
        defaultTheme: 'neonDusk',
        themes: {
          // Variation A: Amethyst Nights (active)
          neonDusk: {
            dark: true,
            colors: {
              primary:    '#9A52F5',
              secondary:  '#F42D87',
              background: '#0B0617',
              surface:    '#13092A',
              error:      '#FF5C8A',
              info:       '#2DD4BF',
              success:    '#34D399',
              warning:    '#FCD34D',
            },
          },
          neonDuskLight: {
            dark: false,
            colors: {
              primary:    '#6B20D9',
              secondary:  '#C9185A',
              background: '#FFFFFF',
              surface:    '#F7F2FF',
              error:      '#BE1262',
              info:       '#0882A8',
              success:    '#059669',
              warning:    '#D97706',
            },
          },
        },
      },
    })
    app.use(vuetify)

    // i18n — reuse the shared instance
    app.use(i18n)

    // Route-param locale hook — runs identically on server and client
    router.beforeEach((to) => {
      const locale = to.params.locale
      if (locale && SUPPORTED.includes(locale)) {
        setLocale(locale)
      }
    })

    // Swap broken card images for the card-back placeholder (client-only).
    if (isClient) installCardImageFallback()
  }
)
