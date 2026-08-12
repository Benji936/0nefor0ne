import './assets/main.css'

import { ViteSSG } from 'vite-ssg'

import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import 'vuetify/styles' // Global CSS
import '@mdi/font/css/materialdesignicons.css' // Icons

import { createAppI18n, persistLocale, SUPPORTED } from './i18n.js'
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
          //
          // These are the same roles as the --c-* custom properties in
          // assets/main.css, declared a second time because Vuetify cannot read
          // CSS variables for its own `color="primary"` resolution. The two
          // drifted once already, when the CSS side was corrected for contrast
          // and this side was not. src/lib/palette.test.js now fails the build
          // if they disagree.
          neonDusk: {
            dark: true,
            colors: {
              primary:    '#A362F7',
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
              secondary:  '#C21456',
              background: '#FFFFFF',
              surface:    '#F7F2FF',
              error:      '#BE1262',
              info:       '#076B82',
              success:    '#059669',
              warning:    '#D97706',
            },
          },
        },
      },
    })
    app.use(vuetify)

    // i18n — one instance per app. Sharing one across apps is what made
    // concurrent SSG renders overwrite each other's locale; see createAppI18n.
    const i18n = createAppI18n()
    app.use(i18n)

    // Route-param locale hook — runs identically on server and client, and is
    // the only place the active locale is set. It writes to the instance above,
    // which belongs to this app alone, so a render can no longer be relabelled
    // by whatever page happens to be rendering beside it.
    router.beforeEach((to) => {
      const locale = to.params.locale
      if (locale && SUPPORTED.includes(locale)) {
        i18n.global.locale.value = locale
        persistLocale(locale)
      }
    })

    // Swap broken card images for the card-back placeholder (client-only).
    if (isClient) installCardImageFallback()
  }
)
