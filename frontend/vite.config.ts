import react from '@vitejs/plugin-react'
import { defineConfig, type ProxyOptions } from 'vite'

const API = 'http://localhost:8001'

// Certains préfixes d'API (/coordination, /verification, /enquete…) sont aussi des routes
// de l'application React. Une navigation du navigateur (Accept: text/html) doit recevoir
// index.html, pas la réponse 404 du backend : sinon un rechargement de page casse.
const SPA_ROUTES = new Set(['/verification', '/coordination', '/enquete'])

const api = (): ProxyOptions => ({
  target: API,
  bypass: (req) => {
    const path = (req.url ?? '').split('?')[0].replace(/\/$/, '')
    return SPA_ROUTES.has(path) && req.headers.accept?.includes('text/html') ? '/index.html' : undefined
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': api(),
      '/signalements': api(),
      '/verification': api(),
      '/coordination': api(),
      '/enquete': api(),
      '/rapports': api(),
      '/analyses': api(),
      '/health': api(),
      '/uploads': api(),
    },
  },
})
