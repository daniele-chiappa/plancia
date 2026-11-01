# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-11-01

### Added

- **A window is a place for the focus** — a screen reader could not tell
  which window the focus was in, and a host had no window to put the focus
  on:
  - each window is a region named by its title (with the module of a
    foreign window, without the unsaved mark), and can take the focus
    itself (`tabindex="-1"`, with an accent ring from the keyboard);
  - a focus that enters a window, by Tab or by script, makes it the
    focused one, as a click does;
  - new `focusTarget` prop on `<Plancia>`: the selector of the element that
    takes the focus in a window's body, such as its heading;
  - new `usePlanciaFocus()` → `focusWindow(id, { wait })`: focuses that
    target, or the window itself; waits up to `wait` ms for a view loaded on
    demand; moves the focus only if nothing moved it meanwhile, and only for
    the last call. Callable from outside `<Plancia>` too.
- **The focus follows the windows** — a window that closed or went to the
  footer took the focus with it, onto the page, and `Alt + ←/→` moved the
  highlight but left the focus where it was:
  - a window that closes or is minimized while it holds the focus (in it, on
    its tab or on its chip) gives it back to the control that opened it, if
    that is still on the page; else to the window that takes over; else the
    host gets the new **`focus-out`** event, to place it (its `main`, say);
  - a window restored from its chip takes the focus;
  - `Alt + ←/→` carry the focus into the next window, when it is in the
    plancia or on the page (not in a dialog or a bar of the host);
  - a host that moved the focus itself keeps it there.

### Fixed

- **The tabs mode follows the ARIA tabs pattern** — the tab list held the
  close buttons too (axe `aria-required-children`), every tab and every
  close button was a Tab stop, there were no arrow keys and no tab panel,
  and the close button was 18 × 18:
  - the tab list holds only tabs, and only the active one is in the Tab
    sequence; `←` / `→`, `Home` and `End` move between the tabs and activate
    them;
  - `Delete` on a tab closes it, asking first for unsaved changes
    (`aria-keyshortcuts`), and the focus goes to the tab that takes over;
  - the close button stays for the mouse, at 24 × 24, out of the Tab
    sequence and hidden from assistive technology;
  - the pane is the `tabpanel` of the active tab, which every tab controls.
- **The sidebar drawer keeps the focus** — the reveal button went when the
  sidebar opened and the panel when it closed, and the focus went with
  them, onto the page; `Esc` stepped a drawer down to its rail before
  closing it; the toggle was 22 × 22:
  - opened from the reveal button, the focus goes to the first control of
    the content; an open the host asks for leaves it where it is;
  - closed while it holds the focus (`Esc`, the backdrop, or the host's
    `state`), the focus goes to the reveal button; a press on the backdrop
    no longer takes the focus off the panel first;
  - `Esc` closes a responsive drawer at once, as its backdrop does;
  - the toggle is 24 × 24, with the header and its icon where they were.
- **The width separator reports the drawn width** — its `aria-valuenow` was
  0 while the window had a preset width; it is now the width on screen.
- **`PlanciaModal` adds no landmarks to the page** — the title bar was a
  `<header>` and the actions a `<footer>`, inside a dialog teleported to
  `body`, outside any `main`: a screen reader found a second banner and a
  contentinfo on the page, and axe flagged a duplicate banner. They are
  now `div`s with the same classes, and look the same.
- **`usePlanciaSync` writes only its own page's URL** — the URL write waits
  200 ms after a window change, and ran even when the shell had gone in
  the meantime, on whatever page was there: a shell that opened a window
  and then sent the browser to a login page rewrote that page's query, and
  lost its parameters. The URL is now the shell's only while the route
  record that renders it is matched (its child pages included):
  - a shell that is unmounted cancels the pending write, and saves its
    windows to localStorage only;
  - a shell kept alive on another page (`KeepAlive`) leaves that page's
    query alone, both writing and reading it, and picks its windows up
    again when it is back.

## [0.3.3] - 2026-10-11

### Fixed

- **Window events in tabs mode** — the events of a window's content
  (`close`, `title`, `dirty`, `identify`, `tags`) went to the focused window
  at the time of the event, not to the window that sent them. A content
  that opens another window (which takes the focus) and then emits `close`
  closed the new window, and stayed on screen itself. They are now bound to
  their own window, as in strip mode.

## [0.3.2] - 2026-10-07

### Changed

- **Build toolchain updated** — Vite 8, Vitest 4, vue-tsc 3,
  `vite-plugin-dts` 5 and Node 24, the versions gosidian builds with. This
  clears the Dependabot alerts on the development dependencies; the package
  itself still has no runtime dependencies. No API change:
  - `plancia.js` is now bundled by Rolldown, and is smaller (52 kB, was
    63 kB);
  - `plancia.css` comes from a new minifier, with equivalent rules;
  - `index.d.ts` is regenerated, with the same exports.

## [0.3.1] - 2026-10-07

### Fixed

- **`PlanciaModal` slot types** — the published declarations typed its slots
  as `any`. They are now declared: `default` and `footer` receive
  `ModalSlotProps` (`{ close }`), `title` receives nothing. The runtime code
  is unchanged.

### Changed

- **Releases ship on GitHub, not npm** — each version tag gets its package
  attached to its GitHub release (`plancia-X.Y.Z.tgz`, built by the new
  `release` workflow); install the release URL. The npm package stops at
  0.3.0, whose GitHub release carries the same tarball, byte for byte.
- **The build fails on declaration errors** — a type error in the `.d.ts`
  pass now stops `npm run build`, and with it CI and the release workflow,
  instead of shipping declarations degraded to `any`.

## [0.3.0] - 2026-07-01

### Added

- **Tabs view mode** — `<Plancia>` can now lay its windows out as a scrollable
  **tab bar** over a single full-width pane, as an alternative to the niri-style
  strip. Switch at runtime with **`v-model:view-mode`** (`'strip' | 'tabs'`), or
  set the initial mode via config (`components.window.defaults.viewMode`). Each
  tab shows the window title and a **direct close** button (honouring the
  unsaved-changes guard) — no need to minimise first. The tab bar scrolls
  horizontally and the active tab is kept in view.
- **Built-in view toggle** — rendered in the tab bar by default
  (`showViewToggle`, default `true`); override its content with the new
  **`view-toggle`** slot (`{ mode, toggle }`). Host apps can also drive the mode
  entirely through `v-model` and place their own toggle. New optional labels
  `viewStrip` / `viewTabs` / `viewToggle`; new exported type **`ViewMode`**.
- **Performance: only the focused window mounts in tabs mode**, wrapped in
  `<KeepAlive :max>` (LRU) so switching tabs preserves state while bounding how
  many window subtrees stay mounted. Configurable via the **`keepAliveMax`** prop
  (or `components.window.defaults.keepAliveMax`, default `5`) — the key lever for
  hosting many windows cheaply. Note: kept-alive subtrees stay reactive, so keep
  `keepAliveMax` modest and gate expensive per-window work on `onActivated` /
  `onDeactivated`.

### Changed

- `WindowFrame` gained an internal **`fill`** prop (used by tabs mode): the frame
  fills the pane width and its width affordances (preset cycle + drag handle) are
  hidden. Strip mode is unchanged.

## [0.2.0] - 2026-06-23

### Added

- **Window drag-resize** — drag a window's right edge to set a continuous width.
  The handle is a keyboard-operable `role="separator"` (Arrow keys ±24px, Shift
  ±64px, Home/double-click resets to the preset). New **`useWindowResize`**
  controller (pure, like `useSidebarController`) + store actions
  **`setWidthPx`** / **`resetWidth`**; `widthPx` added to `WindowInstance` /
  `OpenSpec`. Configurable `minWidthPx` and `softMaxDelayMs`.
- **Soft-max past the viewport** — at the viewport-fit width the drag holds with a
  visual signal for a short dwell (`softMaxDelayMs`, default 300ms); keep pushing
  and the window grows beyond the viewport (the strip scrolls). The maximum visible
  width is *signalled*, never hard-limited.

### Changed

- **Window width presets are now percentages of the strip** — `--plancia-w-s: 35%`,
  `--plancia-w-m: 50%`, and the new `--plancia-w-full: 100%` (previously `s`/`m` were
  fixed rem and `full` was hard-coded). Presets are responsive and `full` is the
  soft-max threshold. All three are CSS variables (configurable, incl. via the
  configurator). To keep fixed widths, override `--plancia-w-*` (e.g. `32rem`) via
  config or CSS.

## [0.1.0] - 2026-06-22

First public release. plancia abstracts the niri-style tiling window manager
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

[0.4.0]: https://github.com/daniele-chiappa/plancia/releases/tag/v0.4.0
[0.3.3]: https://github.com/daniele-chiappa/plancia/releases/tag/v0.3.3
[0.3.2]: https://github.com/daniele-chiappa/plancia/releases/tag/v0.3.2
[0.3.1]: https://github.com/daniele-chiappa/plancia/releases/tag/v0.3.1
[0.3.0]: https://github.com/daniele-chiappa/plancia/releases/tag/v0.3.0
[0.2.0]: https://github.com/daniele-chiappa/plancia/releases/tag/v0.2.0
[0.1.0]: https://github.com/daniele-chiappa/plancia/releases/tag/v0.1.0
