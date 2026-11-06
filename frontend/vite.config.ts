import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:8001',
      '/signalements': 'http://localhost:8001',
      '/verification': 'http://localhost:8001',
      '/coordination': 'http://localhost:8001',
      '/enquete': 'http://localhost:8001',
      '/rapports': 'http://localhost:8001',
      '/analyses': 'http://localhost:8001',
      '/health': 'http://localhost:8001',
      '/uploads': 'http://localhost:8001',
    },
  },
})
