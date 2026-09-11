import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The app is served from https://fes-hackathon-2026.github.io/team-02/
 * so every asset URL needs the repository name as a base path.
 * Locally (`npm run dev`) we serve from '/' instead.
 *
 * Override with BASE_PATH if the repo is ever renamed or moved to a
 * custom domain (then set BASE_PATH=/).
 */
export default defineConfig(({ command }) => ({
  base: command === 'build' ? (process.env.BASE_PATH ?? '/team-02/') : '/',
  plugins: [react()],
  server: {
    port: 5173,
    // `--host` plus this makes the dev server reachable from a phone on the
    // same wifi: http://<your-lan-ip>:5173
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
}))
