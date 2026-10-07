import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'

// Library build: emits an ESM bundle + bundled .d.ts. `vue` and `pinia` are
// peer deps, kept external so the consumer app dedupes them. The dev server
// (`npm run dev`) serves the playground in src/playground/.
export default defineConfig({
  plugins: [
    vue(),
    dts({
      include: ['src'],
      exclude: ['src/**/*.test.ts', 'src/playground/**'],
      bundleTypes: true,
      // The declaration pass only logs its type errors and still writes
      // `dist/index.d.ts`, degraded to `any` where it could not infer a type:
      // fail the build instead, so a release never ships such declarations.
      afterDiagnostic(diagnostics) {
        if (diagnostics.length) {
          throw new Error(`vite-plugin-dts: ${diagnostics.length} type error(s), see above`)
        }
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Dev server (playground) — host:true so it's reachable from the Docker
  // container / LAN (see docker-compose.yml).
  server: {
    host: true,
    port: 5173,
  },
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      name: 'Plancia',
      fileName: 'plancia',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['vue', 'pinia', 'vue-router'],
      output: {
        globals: { vue: 'Vue', pinia: 'Pinia', 'vue-router': 'VueRouter' },
      },
    },
  },
})
