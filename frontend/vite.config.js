import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // en desarrollo, /api pega contra el backend local
    proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true } }
  }
})
