/**
 * Window-manager store — niri-style scrollable tiling "plancia".
 *
 * Type-agnostic: the store does not know what a window contains — that is
 * decided by the type→component `registry` passed to the WindowManager.
 * The store stays pure (no router): URL sync lives in a composable so the
 * store is unit-testable in isolation.
 *
 * Le interfacce sotto sono il contratto CONDIVISO fra le due implementazioni
 * sorgente (products-dc `admin/stores/windows.ts` e gosidian
 * `web/src/stores/windows.ts`), che coincidono. Le azioni e le divergenze
 * (WIDTH_CYCLE, token id-numerici vs path-stringa) vengono riconciliate in
 * fase di astrazione — vedi `memory/architecture.md` e il plan 20260621.
 */
import { defineStore } from 'pinia'

export type WindowWidth = 's' | 'm' | 'full'

/** Header tag (reusable). Communicates "what this window is associated with".
 *  When `open` is set the tag is clickable and opens that window (via the
 *  injected `openWindow`) — provided its type is registered in the host
 *  plancia, otherwise the tag stays informational (non-clickable). */
export interface WindowTag {
  label: string
  /** Tone key for the colour (usually the module type). Neutral fallback. */
  tone?: string
  /** Window to open on click. Absent → purely informational tag. */
  open?: OpenSpec
}

export interface WindowInstance {
  id: string
  type: string
  /** Logical de-dup key (e.g. "anagrafica:12", "note:gosidian/hot.md"). */
  key: string
  title: string
  props: Record<string, unknown>
  /** Header tags (associations), updated by the content via `tags` emit. */
  tags: WindowTag[]
  width: WindowWidth
  minimized: boolean
  dirty: boolean
}

export interface OpenSpec {
  type: string
  key?: string
  title?: string
  props?: Record<string, unknown>
  tags?: WindowTag[]
  width?: WindowWidth
  /** If false, opens (right of focus) WITHOUT moving focus. Default true. */
  focus?: boolean
}

interface WindowsState {
  windows: WindowInstance[]
  focusedId: string | null
  seq: number
  /** Bumped on every content-signalled data change; dependent views watch it. */
  dataVersion: number
}

/**
 * Width cycle order for the ⤢ header button.
 * ⚠️ I due sorgenti DIVERGONO: products-dc usa `['m','full','s']`,
 * gosidian usa `['s','m','full']`. In fase di astrazione va reso
 * configurabile (opzione del WindowManager). Default provvisorio: gosidian.
 */
export const WIDTH_CYCLE: WindowWidth[] = ['s', 'm', 'full']

export const useWindowsStore = defineStore('plancia-windows', {
  state: (): WindowsState => ({
    windows: [],
    focusedId: null,
    seq: 0,
    dataVersion: 0,
  }),
  getters: {
    visible: (s): WindowInstance[] => s.windows.filter((w) => !w.minimized),
    minimizedList: (s): WindowInstance[] => s.windows.filter((w) => w.minimized),
    focused: (s): WindowInstance | null =>
      s.windows.find((w) => w.id === s.focusedId) ?? null,
  },
  actions: {
    // TODO(plan 20260621): portare e riconciliare le azioni dai due sorgenti
    // (openWindow, closeWindow, cycleWidth, toggleMinimize, focusWindow,
    //  moveWindow, markDirty, bumpData, …). Il contratto dei tipi è già qui.
  },
})
