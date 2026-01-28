import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/VFlow/',
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://1.95.137.119:8001',
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: { "*": "" }
      },
      '/media': {
        target: 'http://1.95.137.119:8001',
        changeOrigin: true,
        secure: false,
      },
      '/accounts': {
        target: 'http://1.95.137.119:8001',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
