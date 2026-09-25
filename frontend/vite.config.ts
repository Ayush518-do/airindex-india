import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Docker bind-mounts on Windows don't deliver inotify events into the
    // container, so Vite silently misses host-side edits. Poll instead.
    watch: { usePolling: true, interval: 300 }
  }
})
