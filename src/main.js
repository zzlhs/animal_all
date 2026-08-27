import { createApp } from 'vue'
import 'mapbox-gl/dist/mapbox-gl.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import './styles.css'
import App from './App.vue'
import { initializeAudioCache } from './media/audioCache.js'

initializeAudioCache()
createApp(App).mount('#app')
