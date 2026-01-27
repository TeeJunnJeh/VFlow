import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://1.95.137.119:8001',
        changeOrigin: true,
        secure: false,
        // CRITICAL: Rewrite the cookie domain so localhost accepts it
        cookieDomainRewrite: {
          "*": "" // Rewrites any domain to localhost
        }
      },
      '/media': {
        target: 'http://1.95.137.119:8001',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})