import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/CyberWorld/',
  plugins: [vue()],
  build: {
    target: 'es2020',
  },
})
