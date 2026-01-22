import { createApp } from 'vue'
import App from './App.vue'
// @ts-ignore
import libcellmlPlugin from "vue3-libcellml.js"

createApp(App).use(libcellmlPlugin).mount('#app')
