import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

/** Default dsh web listen port from packages/bundle/web-app/cordis.patch.yml */
const dshTarget = process.env.DSH_WEB_URL || 'http://127.0.0.1:3080'

/**
 * Do not rewrite Host (`changeOrigin: false`). The dsh /api trust fence
 * requires Origin.host === Host; Vite's default page is localhost:5173, so
 * rewriting Host to 127.0.0.1:3080 makes the mux upgrade 403.
 */
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': {
        target: dshTarget,
        changeOrigin: false,
        ws: true,
      },
    },
  },
})
