import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendProxyTarget = process.env.VFLOW_BACKEND_PROXY_TARGET || 'http://localhost:8001'

export default defineConfig({
  //base: '/VFlow/',
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/api': {
        target: backendProxyTarget,
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: { "*": "" }
      },
      '/media': {
        target: backendProxyTarget,
        changeOrigin: true,
        secure: false,
      },
      '/accounts': {
        target: backendProxyTarget,
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
