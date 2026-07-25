import { createRouter, createWebHashHistory } from 'vue-router'
import WelcomeView from '../views/WelcomeView.vue'
import ScannerView from '../views/ScannerView.vue'

export function createAppRouter() {
  return createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: '/', name: 'welcome', component: WelcomeView },
      { path: '/scan', name: 'scanner', component: ScannerView },
      { path: '/:pathMatch(.*)*', redirect: '/' },
    ],
  })
}
