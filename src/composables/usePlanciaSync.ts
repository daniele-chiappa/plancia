/**
 * Bidirectional sync between the window store and the URL (`?w=&f=`), with an
 * optional localStorage fallback that restores the last plancia when the URL
 * carries no window state.
 *
 * The two source apps diverged on how a window maps to a URL token (products-dc
 * keyed by numeric id; gosidian by note path / singleton type). That mapping is
 * therefore **pluggable** via a `PlanciaCodec`. `createArgCodec` builds one that
 * covers both schemes; complex apps can pass a hand-written codec.
 *
 * Requires `vue-router` (an optional peer dependency) — only pulled in when this
 * composable is imported.
 */
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWindowsStore } from '../store/windows'
import type { OpenSpec, WindowInstance } from '../types'

export interface PlanciaCodec {
  /** Serialize a window to a URL token, or null to skip it. */
  encode(win: WindowInstance): string | null
  /** Parse a URL token back into an OpenSpec, or null if invalid. */
  decode(token: string): OpenSpec | null
  /** Stable de-dup key for a spec/window (must match the keys used on open). */
  key(spec: { type: string; props?: Record<string, unknown> }): string
}

export interface PlanciaSyncOptions {
  /** Mirror state to localStorage and restore it when the URL is empty. */
  useLocalStorage?: boolean
  /** localStorage key. Default 'plancia'. */
  storageKey?: string
  /** Debounce (ms) before writing the URL. Default 200. */
  debounceMs?: number
  /** Token separator in the `w` query param. Default ','. */
  separator?: string
}

export function usePlanciaSync(codec: PlanciaCodec, options: PlanciaSyncOptions = {}) {
  const { useLocalStorage = false, storageKey = 'plancia', debounceMs = 200, separator = ',' } =
    options
  const store = useWindowsStore()
  const route = useRoute()
  const router = useRouter()

  const winTokens = computed(() =>
    store.windows.map((w) => codec.encode(w)).filter((t): t is string => t != null),
  )
  const focusToken = computed(() => (store.focused ? codec.encode(store.focused) : null))

  function persistLocal(w: string, f: string | null) {
    if (!useLocalStorage) return
    try {
      localStorage.setItem(storageKey, JSON.stringify({ w, f }))
    } catch {
      // storage may be unavailable (private mode / quota) — ignore
    }
  }
  function readLocal(): { w: string; f: string | null } | null {
    if (!useLocalStorage) return null
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return null
      const o = JSON.parse(raw)
      if (typeof o?.w !== 'string') return null
      return { w: o.w, f: typeof o.f === 'string' ? o.f : null }
    } catch {
      return null
    }
  }

  let pushT: ReturnType<typeof setTimeout> | null = null
  function pushUrl() {
    const w = winTokens.value.join(separator)
    const query: Record<string, string> = {}
    if (w) query.w = w
    if (focusToken.value != null) query.f = focusToken.value
    router.replace({ query }).catch(() => {})
    persistLocal(w, focusToken.value)
  }
  watch([winTokens, focusToken], () => {
    if (pushT) clearTimeout(pushT)
    pushT = setTimeout(pushUrl, debounceMs)
  })

  function openToken(tok: string, wantFocus = true): void {
    const spec = codec.decode(tok)
    if (!spec) return
    store.open({ ...spec, key: spec.key ?? codec.key(spec), focus: wantFocus })
  }

  function hydrate() {
    store.reset()
    let w = String(route.query.w ?? '')
    let f = String(route.query.f ?? '')
    if (!w) {
      const local = readLocal()
      if (local) {
        w = local.w
        f = local.f ?? ''
      }
    }
    for (const tok of w.split(separator)) openToken(tok, false)
    const fp = f ? codec.decode(f) : null
    if (fp) {
      const fk = fp.key ?? codec.key(fp)
      const win = store.windows.find((x) => x.key === fk)
      if (win) store.focus(win.id)
    } else if (store.windows.length) {
      const last = store.windows[store.windows.length - 1]
      if (last) store.focus(last.id)
    }
  }

  // Back/forward: re-hydrate only if the URL token set actually changed.
  watch(
    () => [route.query.w, route.query.f],
    () => {
      const urlW = String(route.query.w ?? '')
      if (urlW !== winTokens.value.join(separator)) {
        hydrate()
        return
      }
      const f = String(route.query.f ?? '')
      const fp = f ? codec.decode(f) : null
      if (fp) {
        const fk = fp.key ?? codec.key(fp)
        const win = store.windows.find((x) => x.key === fk)
        if (win && win.id !== store.focusedId) store.focus(win.id)
      }
    },
  )

  return { hydrate, winTokens, focusToken }
}

// ---------------------------------------------------------------------------
// createArgCodec — a ready-made codec for the common "one arg per window" case.
// ---------------------------------------------------------------------------

/** Per-type rules: extract the URL arg from props, and rebuild props/title. */
export interface ArgTypeSpec {
  arg: (props: Record<string, unknown>) => string | null
  props?: (arg: string | null) => Record<string, unknown>
  title?: (arg: string | null) => string
}

export interface ArgCodecConfig {
  /** Owner type whose token may be written without a `type:` prefix.
   *  Only meaningful together with `bareToken: 'nativeArg'`. */
  nativeType?: string
  /**
   * How to read a bare token (no `:`):
   * - 'type'      → the token IS the window type, with no arg (singletons).
   *                 (gosidian scheme)
   * - 'nativeArg' → the token is the ARG of `nativeType`. (products-dc scheme)
   */
  bareToken?: 'type' | 'nativeArg'
  /** Per-type specs. */
  types?: Record<string, ArgTypeSpec>
  /** Fallback spec for types not listed in `types`. */
  default?: ArgTypeSpec
  encodeArg?: (a: string) => string
  decodeArg?: (a: string) => string
}

const NO_ARG: ArgTypeSpec = { arg: () => null }

export function createArgCodec(cfg: ArgCodecConfig = {}): PlanciaCodec {
  const bareToken = cfg.bareToken ?? 'type'
  const enc = cfg.encodeArg ?? encodeURIComponent
  const dec =
    cfg.decodeArg ??
    ((a: string) => {
      try {
        return decodeURIComponent(a)
      } catch {
        return a
      }
    })
  const specOf = (type: string): ArgTypeSpec => cfg.types?.[type] ?? cfg.default ?? NO_ARG

  const key: PlanciaCodec['key'] = (spec) => {
    const a = specOf(spec.type).arg(spec.props ?? {})
    return a ? `${spec.type}:${a}` : spec.type
  }

  return {
    key,
    encode(win) {
      const a = specOf(win.type).arg(win.props)
      if (bareToken === 'nativeArg' && win.type === cfg.nativeType) {
        return a ? enc(a) : null
      }
      return a ? `${win.type}:${enc(a)}` : win.type
    },
    decode(token) {
      const t = token.trim()
      if (!t) return null
      let type: string
      let arg: string | null
      const i = t.indexOf(':')
      if (i >= 0) {
        type = t.slice(0, i)
        arg = dec(t.slice(i + 1)) || null
      } else if (bareToken === 'nativeArg' && cfg.nativeType) {
        type = cfg.nativeType
        arg = dec(t) || null
      } else {
        type = t
        arg = null
      }
      const spec = specOf(type)
      const props = spec.props ? spec.props(arg) : arg != null ? { arg } : {}
      const title = spec.title ? spec.title(arg) : (arg ?? type)
      return { type, key: key({ type, props }), title, props }
    },
  }
}
