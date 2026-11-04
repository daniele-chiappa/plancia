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
import { computed, inject, onScopeDispose, watch } from 'vue'
import { matchedRouteKey, useRoute, useRouter } from 'vue-router'
import { useWindowsStore } from '../store/windows'
import { DEFAULT_LABELS, type OpenSpec, type WindowInstance } from '../types'

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
  /**
   * What a change of the windows does to the browser's history (IMP-012).
   * - 'replace': the URL follows the windows in place, and Back leaves them.
   * - 'push': each window opened adds a step, so Back closes it and Forward
   *   opens it again. Closing the window of the last step goes back a step;
   *   any other change (the focus, a window's props, closing another window)
   *   rewrites the current step.
   * Default 'replace'.
   */
  history?: 'replace' | 'push'
  /**
   * Asked before back/forward closes windows with unsaved changes: false
   * keeps them, and their step goes back into the history. Default:
   * `window.confirm` with `DEFAULT_LABELS.unsavedClose`.
   */
  confirmClose?: (dirty: WindowInstance[]) => boolean
}

/** history.state key of a step the sync pushed: the `w` of the step before. */
const BACK = 'planciaBack'

export function usePlanciaSync(codec: PlanciaCodec, options: PlanciaSyncOptions = {}) {
  const {
    useLocalStorage = false,
    storageKey = 'plancia',
    debounceMs = 200,
    separator = ',',
    history = 'replace',
    confirmClose = () => window.confirm(DEFAULT_LABELS.unsavedClose),
  } = options
  const store = useWindowsStore()
  const route = useRoute()
  const router = useRouter()
  // The route record whose RouterView renders the shell, if any: the URL is
  // the shell's only while that record is matched (IMP-009).
  const ownRecord = inject(matchedRouteKey, null)?.value
  const onOwnPage = () => !ownRecord || route.matched.includes(ownRecord)

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

  // The windows the URL was last written with: one not among them was opened
  // since, and adds a step in 'push' mode.
  let written = new Set<string>()
  const remember = () => {
    written = new Set(store.windows.map((w) => w.id))
  }
  // Where a back/forward goes, from the history's own listener: the route
  // watcher tells it from a navigation of the host.
  let popTo: string | null = null
  onScopeDispose(
    router.options.history.listen((to) => {
      popTo = to
    }),
  )
  // Set while going back a step after the window of the last step closed.
  let returning = false

  function specsOf(w: string): OpenSpec[] {
    return w
      .split(separator)
      .map((tok) => codec.decode(tok))
      .filter((s): s is OpenSpec => s != null)
      .map((s) => ({ ...s, key: s.key ?? codec.key(s) }))
  }
  function query(): Record<string, string> {
    const q: Record<string, string> = {}
    const w = winTokens.value.join(separator)
    if (w) q.w = w
    if (focusToken.value != null) q.f = focusToken.value
    return q
  }
  /** The open windows are those of the step before this one. */
  function backToPrevious(): boolean {
    const back = router.options.history.state[BACK]
    if (typeof back !== 'string') return false
    const keys = new Set(specsOf(back).map((s) => s.key))
    const open = store.windows.filter((w) => codec.encode(w) != null)
    return open.length === keys.size && open.every((w) => keys.has(w.key))
  }

  let pushT: ReturnType<typeof setTimeout> | null = null
  function pushUrl() {
    pushT = null
    const w = winTokens.value.join(separator)
    const opened = store.windows.some((x) => !written.has(x.id))
    const closed = store.windows.filter((x) => written.has(x.id)).length < written.size
    remember()
    // Another page's query is not ours to rewrite: the windows only go to
    // localStorage (IMP-009).
    if (onOwnPage()) {
      const back = router.options.history.state[BACK]
      if (history === 'push' && opened) {
        router.push({ query: query(), state: { [BACK]: String(route.query.w ?? '') } }).catch(() => {})
      } else if (history === 'push' && closed && backToPrevious()) {
        returning = true
        router.back()
      } else {
        // The step keeps what came before it: the history API merges the
        // state, an in-memory history does not.
        const state = typeof back === 'string' ? { [BACK]: back } : undefined
        router.replace({ query: query(), state }).catch(() => {})
      }
    }
    persistLocal(w, focusToken.value)
  }
  function schedule() {
    if (pushT) clearTimeout(pushT)
    pushT = setTimeout(pushUrl, debounceMs)
  }
  watch([winTokens, focusToken], schedule)
  // A shell that is gone leaves the URL alone: a pending write only goes to
  // localStorage, now.
  onScopeDispose(() => {
    if (!pushT) return
    clearTimeout(pushT)
    pushT = null
    persistLocal(winTokens.value.join(separator), focusToken.value)
  })

  function openToken(tok: string, wantFocus = true): void {
    const spec = codec.decode(tok)
    if (!spec) return
    store.open({ ...spec, key: spec.key ?? codec.key(spec), focus: wantFocus })
  }

  function focusOf(f: string): void {
    const fp = f ? codec.decode(f) : null
    if (!fp) return
    const fk = fp.key ?? codec.key(fp)
    const win = store.windows.find((x) => x.key === fk)
    if (win && win.id !== store.focusedId) store.focus(win.id)
  }

  /**
   * Bring the windows to those of a step: close the ones it lacks, open the
   * ones it has, and leave the others as they are (IMP-012). Closing windows
   * with unsaved changes asks first; on no they stay, and so does their step.
   */
  function reconcile(w: string, f: string): void {
    const specs = specsOf(w)
    const keys = specs.map((s) => s.key as string)
    const leaving = store.windows.filter((x) => !keys.includes(x.key))
    const dirty = leaving.filter((x) => x.dirty)
    if (dirty.length && !confirmClose(dirty)) {
      if (history === 'push') {
        router.push({ query: query(), state: { [BACK]: w } }).catch(() => {})
      } else {
        router.replace({ query: query() }).catch(() => {})
      }
      return
    }
    for (const x of leaving) store.close(x.id)
    for (const s of specs) {
      if (!store.windows.some((x) => x.key === s.key)) store.open({ ...s, focus: false })
    }
    // In the step's order.
    store.windows.sort((a, b) => keys.indexOf(a.key) - keys.indexOf(b.key))
    focusOf(f)
    remember()
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
    remember()
  }

  // Back/forward, or a navigation of the host: the windows follow the URL
  // only from the shell's own page (IMP-009).
  watch(
    () => [route.query.w, route.query.f],
    () => {
      const pop = popTo != null && router.resolve(popTo).fullPath === route.fullPath
      popTo = null
      const wasReturning = returning
      returning = false
      if (!onOwnPage()) return
      const urlW = String(route.query.w ?? '')
      const f = String(route.query.f ?? '')
      if (pop && wasReturning) {
        // Back a step after a close: the windows are the step's already, and
        // the focus stays where the close put it.
      } else if (urlW !== winTokens.value.join(separator)) {
        // A step without windows has none; the host's link to the page
        // without them restores the last ones, as hydrate does.
        const local = !urlW && !pop ? readLocal() : null
        reconcile(local ? local.w : urlW, local ? (local.f ?? '') : f)
      } else {
        focusOf(f)
      }
      // A window kept by a step may differ from the step's token (its props
      // changed since): the step takes the windows as they are.
      if (urlW !== winTokens.value.join(separator) || f !== (focusToken.value ?? '')) schedule()
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
