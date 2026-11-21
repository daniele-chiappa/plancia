import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import pkg from './package.json' with { type: 'json' }

// Library build: an ESM bundle, its CSS and one .d.ts. The dependencies
// stay external, so the consumer dedupes them.
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
      name: 'PlanciaCalendar',
      fileName: 'plancia-calendar',
      formats: ['es'],
      cssFileName: 'plancia-calendar',
    },
    rollupOptions: {
      external: (id) => !id.endsWith('.css') && external.some((dep) => id === dep || id.startsWith(`${dep}/`)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
})
