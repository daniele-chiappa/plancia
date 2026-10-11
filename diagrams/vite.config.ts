import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import pkg from './package.json' with { type: 'json' }

// Library build: an ESM bundle, its CSS and one .d.ts. Every dependency
// stays external, so the consumer dedupes it and splits it into chunks:
// mermaid above all, which the package imports only for the kinds it draws.
const external = [...Object.keys(pkg.dependencies), ...Object.keys(pkg.peerDependencies)]

export default defineConfig({
  plugins: [
    vue(),
    dts({
      include: ['src'],
      exclude: ['src/**/*.test.ts'],
      bundleTypes: true,
      // As in plancia: fail the build on a declaration error, so a release
      // never ships declarations degraded to `any`.
      afterDiagnostic(diagnostics) {
        if (diagnostics.length) {
          throw new Error(`vite-plugin-dts: ${diagnostics.length} type error(s), see above`)
        }
      },
    }),
  ],
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      name: 'PlanciaDiagrams',
      fileName: 'plancia-diagrams',
      formats: ['es'],
      cssFileName: 'plancia-diagrams',
    },
    rollupOptions: {
      // Vue Flow's own CSS is not external: it joins the package's CSS.
      external: (id) => !id.endsWith('.css') && external.some((dep) => id === dep || id.startsWith(`${dep}/`)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
})
