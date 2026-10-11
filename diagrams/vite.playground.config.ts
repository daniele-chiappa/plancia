import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// The playground (npm run dev, or the `diagrams` service of the compose):
// every example of test/fixtures drawn, light and dark, an editor for the
// YAML and the SVG export. Not part of the package.
export default defineConfig({
  root: 'playground',
  plugins: [vue()],
  server: { host: true, port: 5173, fs: { allow: ['..'] } },
})
