# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

First release candidate. plancia abstracts the niri-style tiling window manager
that had been built in parallel in two production Vue apps (gosidian and
products-dc) into a standalone, content-agnostic library.

### Added

- **`<Plancia>`** — tiling window-manager component: a scroll-snapping strip of
  tiled windows plus a footer of minimized ones, driven by a `type → component`
  registry. Props: `registry`, `nativeType`, `moduleLabel`, `labels`,
  `widthCycle`, `defaultWidth`, `resolveTone`. Slots: `window-actions`, `empty`.
  Keyboard: `Alt + ←/→` to move focus; the focused window is scrolled into view.
- **`<WindowFrame>`** — per-window chrome (resize / minimize / close, header
  tags, dirty marker, `actions` slot) with dependency-free inline SVG icons.
- **`useWindowsStore`** (Pinia) — pure window store. Actions: `open`, `close`,
  `minimize`, `restore`, `focus`, `focusAdjacent`, `cycleWidth`, `setTitle`,
  `setDirty`, `setTags`, `identify`, `touch`, `reset`, `configure`. Getters:
  `visible`, `minimizedList`, `focused`. Configurable `widthCycle` /
  `defaultWidth`; de-duplication by window `key`.
- **`usePlanciaSync(codec, options)`** — opt-in URL (`?w=&f=`) + optional
  `localStorage` synchronisation with back/forward support. Requires
  `vue-router` (an optional peer dependency).
- **`createArgCodec(config)`** — ready-made token codec covering both numeric-id
  and path-string URL schemes (`bareToken: 'type' | 'nativeArg'`).
- **`useOpenWindow()` / `useCanOpenWindowType()`** + injection keys
  (`OPEN_WINDOW`, `CAN_OPEN_TYPE`) for window content to open siblings.
- **CSS-variable theming** (`--plancia-*`) via `plancia/style.css` — no Tailwind
  or design-token dependency.
- **Overridable UI strings** via the `labels` prop (`DEFAULT_LABELS`); no i18n
  dependency.
- **`<PlanciaSidebar>`** — standalone, content-agnostic sidebar for the four
  edges (`top`/`bottom`/`left`/`right`) with `closed`/`collapsed`/`expanded`
  states and an independently-scrolling body. Modes: `inline` (content reflows),
  `overlay`, `floating` (detached card, optionally **draggable** by its header,
  emitting `move`). Optional **drag-resize** (keyboard-operable), **hover-peek**
  (transient expand while collapsed), and a **responsive drawer** with backdrop. Scoped slots (`header`/`footer`/default/
  `collapsed`/`toggle`/`reveal`) carry the state signal so content adapts.
  `v-model:state` / `v-model:size`, injectable `labels`, configurable ARIA
  landmark, `prefers-reduced-motion` aware.
- **`usePlanciaSidebar()`** + injection key `SIDEBAR_CONTROL` — drive the sidebar
  from within its content. **`useSidebarController`** — the pure state machine
  (exported for advanced use). **`usePlanciaSidebarStore`** — optional Pinia
  store for sharing one sidebar's state across the app.
- **Sidebar CSS-variable theming** (`--plancia-sidebar-*`).
- **`<Plancia>` edge sidebar slots** — `sidebar-top`/`sidebar-bottom`/`sidebar-left`/
  `sidebar-right` arrange a `<PlanciaSidebar>` (or any content) around the window
  strip (top/bottom full width, left/right flanking; the middle band is
  `position: relative` for overlay/floating anchoring). Slot content lives inside
  `<Plancia>`, so a menu there opens windows via `useOpenWindow()`.
- **`<PlanciaLayout>`** — generic edge-and-center layout shell (slots `top`/`bottom`/
  `left`/`right` + default centre), independent of the window manager. Arranges a
  `<PlanciaSidebar>` (or any content) around arbitrary content; the shell + middle
  band are `position: relative` so overlay/floating sidebars anchor correctly.
- TypeScript types for the full public API; ships prebuilt **ESM + `.d.ts`**.
- English usage documentation under `docs/en/` (incl. `sidebar.md`).

### Notes

- Zero runtime dependencies. Peers: `vue ^3.5`, `pinia ^2.2 || ^3`,
  `vue-router ^4` (optional).

[Unreleased]: https://git97.dccomunicazione.com/DCcomunicazione/plancia
