import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseThemeManifest } from '../../src/config/manifest'
import { behaviorManifest } from './behaviorManifest'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const cfgDir = resolve(repoRoot, 'plancia.config')
const presetsDir = resolve(cfgDir, 'presets')
const styleCss = resolve(repoRoot, 'src/style.css')

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => res(body))
  })
}
function sendJson(res: ServerResponse, data: unknown, code = 200): void {
  res.statusCode = code
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(data))
}

/** Dev-only file API over plancia.config/ (bind-mounted in the container). */
function configApi(): Plugin {
  return {
    name: 'plancia-configurator-api',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res, next) => {
        try {
          const url = (req.url ?? '/').split('?')[0] ?? '/'
          const method = req.method ?? 'GET'

          if (url === '/manifest' && method === 'GET') {
            const theme = parseThemeManifest(readFileSync(styleCss, 'utf8'))
            return sendJson(res, { theme, behavior: behaviorManifest })
          }
          if (url === '/presets' && method === 'GET') {
            const names = existsSync(presetsDir)
              ? readdirSync(presetsDir)
                  .filter((f) => f.endsWith('.json'))
                  .map((f) => f.replace(/\.json$/, ''))
              : []
            return sendJson(res, names)
          }
          const preset = url.match(/^\/presets\/([\w.-]+)$/)
          if (preset) {
            const file = resolve(presetsDir, `${preset[1]}.json`)
            if (method === 'GET') {
              if (!existsSync(file)) return sendJson(res, { error: 'not found' }, 404)
              return sendJson(res, JSON.parse(readFileSync(file, 'utf8')))
            }
            if (method === 'PUT') {
              mkdirSync(presetsDir, { recursive: true })
              writeFileSync(file, `${JSON.stringify(JSON.parse(await readBody(req)), null, 2)}\n`)
              return sendJson(res, { ok: true })
            }
          }
          if (url === '/current') {
            const file = resolve(cfgDir, 'current.json')
            if (method === 'GET') {
              return sendJson(res, existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {})
            }
            if (method === 'PUT') {
              mkdirSync(cfgDir, { recursive: true })
              writeFileSync(file, `${JSON.stringify(JSON.parse(await readBody(req)), null, 2)}\n`)
              return sendJson(res, { ok: true })
            }
          }
          next()
        } catch (e) {
          sendJson(res, { error: String(e) }, 500)
        }
      })
    },
  }
}

export default defineConfig({
  root: here,
  plugins: [vue(), configApi()],
  server: { host: '0.0.0.0', port: 5173 },
})
