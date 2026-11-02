import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

// Pilot mode (`vite build --mode pilot` + `vite preview --mode pilot`): the app talks to
// Supabase through /sb on its own port; PILOT_API_URL (set by scripts/pilot.sh) is the target.
const pilotProxy = (mode: string) =>
  mode === 'pilot' && process.env.PILOT_API_URL
    ? { '/sb': { target: process.env.PILOT_API_URL, changeOrigin: true, ws: true, rewrite: (p: string) => p.replace(/^\/sb/, '') } }
    : undefined

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: { host: true, port: 5173, proxy: pilotProxy(mode) },
  // '.local': the pilot is opened as http://<this-mac>.local:5180 from other devices.
  preview: { host: true, port: 5180, strictPort: true, allowedHosts: ['.local'], proxy: pilotProxy(mode) },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
}))
