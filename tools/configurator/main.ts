import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import '../../src/style.css'

createApp(App).use(createPinia()).mount('#app')
