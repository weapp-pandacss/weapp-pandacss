import { createSSRApp } from 'vue'
import App from './App.vue'
import './tailwind.css'
import 'virtual:panda-styles.css'

export function createApp() {
  const app = createSSRApp(App)
  return {
    app,
  }
}
