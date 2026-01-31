import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  //base: '/VFlow/',
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: { "*": "" }
      },
      '/media': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      '/accounts': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
