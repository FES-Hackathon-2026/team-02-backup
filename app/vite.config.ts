import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * One service serves the API and this app in production, so the base path is
 * the domain root and /api needs no configuring. Set BASE_PATH when serving
 * from a subpath instead (GitHub Pages wants `/team-02/`).
 */
export default defineConfig(({ command }) => ({
  base: command === 'build' ? (process.env.BASE_PATH ?? '/') : '/',
  plugins: [react()],
  server: {
    port: 5173,
    // `--host` plus this makes the dev server reachable from a phone on the
    // same wifi: http://<your-lan-ip>:5173
    strictPort: false,
    // In development Vite serves the client and the API runs separately;
    // proxying keeps the client's fetches same-origin, so the session cookie
    // behaves exactly as it will in production.
    proxy: {
      '/api': {
        target: process.env.API_TARGET ?? 'http://localhost:8080',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
}))
