import './assets/main.css'

import { createApp } from 'vue'
import router from './router/index.js'
import i18n from './i18n.js'
import App from './views/App.vue'

import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import 'vuetify/styles' // Global CSS
import '@mdi/font/css/materialdesignicons.css' // Icons

const vuetify = createVuetify({
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

createApp(App).use(router).use(vuetify).use(i18n).mount('#app')
