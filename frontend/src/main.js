import './assets/main.css'

import { createApp } from 'vue'
import router from './router/index.js'
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
      neonDusk: {
        dark: true,
        colors: {
          primary: '#A855F7',
          secondary: '#EC4899',
          background: '#0D0818',
          surface: '#1A1035',
        },
      },
      neonDuskLight: {
        dark: false,
        colors: {
          primary: '#7E22CE',
          secondary: '#BE185D',
          background: '#FFFFFF',
          surface: '#FAF5FF',
        },
      },
    },
  },
})

createApp(App).use(router).use(vuetify).mount('#app')
