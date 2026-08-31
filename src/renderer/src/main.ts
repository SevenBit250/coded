import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles.css'

// Platform fact for platform-conditional chrome (system caption buttons on
// Windows reserve the top-right corner; CSS keys off this attribute).
document.documentElement.dataset.platform = window.coded.platform

const container = document.getElementById('root')
if (container === null) throw new Error('missing #root mount point')

createApp(App).use(createPinia()).mount(container)
