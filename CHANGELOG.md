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
- **Modal family** — `<PlanciaModal>` (content-agnostic dialog primitive: Teleport,
  `v-model:open`, focus trap, Esc, ref-counted scroll-lock, focus restore,
  `aria-labelledby`/`describedby`, `--plancia-dialog-*` theming; zero Pinia) and
  `<PlanciaConfirm>` (built on it; `danger`/labels/`hideCancel`). Plus an **imperative
  dialog service** (opt-in, Pinia): `useDialogs()` → `confirm()/alert()/prompt()`,
  `<PlanciaDialogHost>` (stacking), `usePlanciaDialogStore`. Callable from anywhere,
  including store actions (`await useDialogs().confirm(...)`); Promise resolvers live
  outside store state.
- **Config layer** — `<PlanciaConfigProvider>` applies a serializable `PlanciaConfig`
  (theme CSS vars + per-component behavior defaults + labels) to its subtree: scoped
  wrapper vars + (by default) a `:root` mirror so teleported dialogs pick it up;
  provides the config so components resolve **prop › config › built-in**. Helpers
  `defineConfig`, `usePlanciaConfig`, `applyTheme`, `themeToCss`. A `plancia.config/`
  folder convention (`current.json` + `presets/`) ships `light`/`dark`/`tailwind`/
  `compact` presets. Pinia-free.
- **Semantic color core** — the color tokens form a small overridable core
  (`--plancia-accent` / `-on-accent` / `-surface` / `-text` / `-text-muted` /
  `-border` / `-danger` / `-warning`); the rest derive via `color-mix()`, so
  overriding a few re-themes everything and binds cleanly to Tailwind tokens at
  runtime.
- **`parseThemeManifest(css)`** — derives the appearance-knob list (name, type,
  group, derived?) from a stylesheet's `:root`; powers the configurator.
- TypeScript types for the full public API; ships prebuilt **ESM + `.d.ts`**.
- English usage documentation under `docs/en/` (incl. `sidebar.md`).

### Changed

- Renamed the windows-store config type **`PlanciaConfig` → `WindowsConfig`** — the
  name `PlanciaConfig` now denotes the app-wide config. Update imports if you
  referenced it.

### Notes

- A visual **configurator** dev tool (`tools/configurator/`,
  `docker compose up configurator`) edits theme/behavior with a live preview and
  writes presets under `plancia.config/`. It is **not** part of the published package.
- Zero runtime dependencies. Peers: `vue ^3.5`, `pinia ^2.2 || ^3`,
  `vue-router ^4` (optional).

[Unreleased]: https://git97.dccomunicazione.com/DCcomunicazione/plancia
