/**
 * Window-manager store — niri-style scrollable tiling "plancia".
 *
 * Type-agnostic: the store does not know what a window contains — that is
 * decided by the type→component `registry` passed to the manager. It stays
 * pure (no router): URL sync lives in the `usePlanciaSync` composable so the
 * store is unit-testable in isolation.
 *
 * Merged from the two source implementations (products-dc + gosidian): keeps
 * gosidian's stricter typing and null-guards, and makes the previously
 * hardcoded width cycle configurable (the two sources diverged on it).
 */
import { defineStore } from 'pinia'
import type { OpenSpec, WindowInstance, WindowTag, WindowWidth } from '../types'

export const DEFAULT_WIDTH_CYCLE: WindowWidth[] = ['s', 'm', 'full']
export const DEFAULT_WIDTH: WindowWidth = 'm'

interface WindowsState {
  windows: WindowInstance[]
  focusedId: string | null
  seq: number
  /** Bumped on every content-signalled data change; dependent views watch it. */
  dataVersion: number
  /** Order cycled by the resize button. Configurable (sources diverged). */
  widthCycle: WindowWidth[]
  /** Width assigned to a window opened without an explicit `width`. */
  defaultWidth: WindowWidth
}

export interface PlanciaConfig {
  widthCycle?: WindowWidth[]
  defaultWidth?: WindowWidth
}

export const useWindowsStore = defineStore('plancia-windows', {
  state: (): WindowsState => ({
    windows: [],
    focusedId: null,
    seq: 0,
    dataVersion: 0,
    widthCycle: [...DEFAULT_WIDTH_CYCLE],
    defaultWidth: DEFAULT_WIDTH,
  }),
  getters: {
    visible: (s): WindowInstance[] => s.windows.filter((w) => !w.minimized),
    minimizedList: (s): WindowInstance[] => s.windows.filter((w) => w.minimized),
    focused: (s): WindowInstance | null =>
      s.windows.find((w) => w.id === s.focusedId) ?? null,
  },
  actions: {
    /** Set width behaviour. Called once by the manager from its props. */
    configure(cfg: PlanciaConfig): void {
      if (cfg.widthCycle && cfg.widthCycle.length) this.widthCycle = [...cfg.widthCycle]
      if (cfg.defaultWidth) this.defaultWidth = cfg.defaultWidth
    },
    _byId(id: string): WindowInstance | undefined {
      return this.windows.find((w) => w.id === id)
    },
    /**
     * Open (or, if the `key` already exists, focus/restore) a window.
     * The new window is inserted immediately to the right of the focused one.
     */
    open(spec: OpenSpec): string {
      const wantFocus = spec.focus !== false
      const key = spec.key ?? `${spec.type}:auto:${this.seq + 1}`
      const existing = this.windows.find((w) => w.key === key)
      if (existing) {
        existing.minimized = false
        if (wantFocus) this.focusedId = existing.id
        return existing.id
      }
      this.seq += 1
      const id = `win-${this.seq}`
      const win: WindowInstance = {
        id,
        type: spec.type,
        key,
        title: spec.title ?? '',
        props: spec.props ?? {},
        tags: spec.tags ?? [],
        width: spec.width ?? this.defaultWidth,
        minimized: false,
        dirty: false,
      }
      const fi = this.windows.findIndex((w) => w.id === this.focusedId)
      if (fi >= 0) this.windows.splice(fi + 1, 0, win)
      else this.windows.push(win)
      if (wantFocus) this.focusedId = id
      return id
    },
    close(id: string): void {
      const i = this.windows.findIndex((w) => w.id === id)
      if (i < 0) return
      this.windows.splice(i, 1)
      if (this.focusedId === id) {
        const next = this.windows[i] ?? this.windows[i - 1] ?? null
        this.focusedId = next ? next.id : null
      }
    },
    minimize(id: string): void {
      const w = this._byId(id)
      if (!w) return
      w.minimized = true
      if (this.focusedId === id) {
        const vis = this.windows.filter((x) => !x.minimized)
        const last = vis[vis.length - 1]
        this.focusedId = last ? last.id : null
      }
    },
    restore(id: string): void {
      const w = this._byId(id)
      if (!w) return
      w.minimized = false
      this.focusedId = id
    },
    focus(id: string): void {
      if (this._byId(id)) this.focusedId = id
    },
    /** Move focus to the adjacent visible window (-1 left, +1 right). */
    focusAdjacent(dir: -1 | 1): void {
      const vis = this.windows.filter((w) => !w.minimized)
      if (!vis.length) return
      const ci = vis.findIndex((w) => w.id === this.focusedId)
      const base = ci < 0 ? 0 : ci
      const ni = Math.min(Math.max(base + dir, 0), vis.length - 1)
      const target = vis[ni]
      if (target) this.focusedId = target.id
    },
    cycleWidth(id: string): void {
      const w = this._byId(id)
      if (!w) return
      const idx = this.widthCycle.indexOf(w.width)
      w.width = this.widthCycle[(idx + 1) % this.widthCycle.length] ?? this.defaultWidth
    },
    setTitle(id: string, title: string): void {
      const w = this._byId(id)
      if (w) w.title = title
    },
    setDirty(id: string, dirty: boolean): void {
      const w = this._byId(id)
      if (w) w.dirty = dirty
    },
    setTags(id: string, tags: WindowTag[]): void {
      const w = this._byId(id)
      if (w) w.tags = tags ?? []
    },
    /** Assign a stable key/props to a window (e.g. after a "new" entity has been
     *  saved and obtained its id/path) → correct de-dup and URL sync. */
    identify(id: string, key: string, props: Record<string, unknown>): void {
      const w = this._byId(id)
      if (!w) return
      w.key = key
      Object.assign(w.props, props)
    },
    /** Signal that data changed (dependent views reload). */
    touch(): void {
      this.dataVersion += 1
    },
    /** Clear all windows (keeps the configured width behaviour). */
    reset(): void {
      this.windows = []
      this.focusedId = null
    },
  },
})
