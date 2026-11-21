import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// The playground (npm run dev, or the `calendar` service of the compose):
// the examples of test/fixtures in every view, light and dark, editable,
// with the YAML they write. Not part of the package.
export default defineConfig({
  root: 'playground',
  plugins: [vue()],
  server: { host: true, port: 5173, fs: { allow: ['..'] } },
})
