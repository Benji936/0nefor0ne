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
})

createApp(App).use(router).use(vuetify).mount('#app')
