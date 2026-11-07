# Components

## `<Plancia>`

The window manager: a horizontal strip of tiled windows + a footer of minimized
ones. Fills its parent, so give the parent a height.

```vue
<Plancia
  :registry="registry"
  native-type="note"
  :labels="labels"
  :width-cycle="['s', 'm', 'full']"
  default-width="m"
  :module-label="(type) => MODULE_LABELS[type] ?? type"
  :resolve-tone="(tone) => (tone ? `tone-${tone}` : '')"
/>
```

### Props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `registry` *(required)* | `Record<string, Component>` | — | `type → content component` map. |
| `nativeType` | `string` | — | The "owner" type of this plancia. Windows of a *different* type are treated as cross-module and get a `[label]: title` prefix. Omit ⇒ no foreign windows. |
| `moduleLabel` | `(type: string) => string` | identity | Human label for a foreign window type (used in the prefix). |
| `labels` | `Partial<PlanciaLabels>` | English defaults | UI strings (see [Theming → Labels](./theming.md#labels--i18n)). Merged over the defaults. |
| `widthCycle` | `('s' \| 'm' \| 'full')[]` | `['s','m','full']` | Order the resize button cycles through. Applied to the store via `configure()`. |
| `defaultWidth` | `'s' \| 'm' \| 'full'` | `'m'` | Width for windows opened without an explicit `width`. |
| `resolveTone` | `(tone?: string) => string` | `() => ''` | Returns an extra CSS class for a tag/badge, derived from its `tone`. Tags also carry a `data-tone` attribute you can target in CSS. |
| `v-model:view-mode` | `'strip' \| 'tabs'` | `'strip'` (or config) | Layout mode. `strip` = the tiling strip; `tabs` = a scrollable tab bar over a single focused pane. See [View mode](./view-mode.md). |
| `keepAliveMax` | `number` | `5` | In `tabs` mode, how many window subtrees stay mounted (LRU). The lever for hosting many windows cheaply. |
| `keepMounted` | `(win) => boolean` | — | In `tabs` mode, the windows that stay in the page, hidden, while another tab shows: an iframe taken out of the page reloads, and a video stops. They are not counted in `keepAliveMax`. |
| `showViewToggle` | `boolean` | `true` | Render the built-in view toggle in the tab bar (override its content with the `view-toggle` slot). |
| `allowFullscreen` | `boolean` | `false` | A **full-screen** button on each window: the focused window covers the page, and the browser goes full screen where it lets it. See [Full screen](#full-screen). |
| `v-model:fullscreen` | `boolean` | `false` | Whether the focused window covers the page. Follow it to set the rest of your page aside (`inert`); set it to turn full screen on or off (only with `allowFullscreen`, and a window focused). |
| `focusTarget` | `string` | — | Selector of the element that takes the focus in a window's body, such as its heading (`[data-window-heading]`). Omitted, or not drawn yet: the window itself takes it. Applied to the store via `configure()`; see [Recipes → Focus a window](./recipes.md#focus-a-window). |

### Slots

| Slot | Props | Purpose |
|---|---|---|
| `window-actions` | `{ win: WindowInstance }` | Extra buttons in **every** window header (before the resize button). This is where app-specific, per-window actions live — e.g. a "show links" button gated on `win.props.path`. |
| `view-toggle` | `{ mode, toggle }` | Override the built-in view toggle rendered in the tab bar (`tabs` mode). See [View mode](./view-mode.md#the-toggle). |
| `empty` | — | Replaces the default "no window open" placeholder. |
| `sidebar-left` / `sidebar-right` / `sidebar-top` / `sidebar-bottom` | — | Mount a [`<PlanciaSidebar>`](./sidebar.md) (or any content) on that edge. `top`/`bottom` span the full width; `left`/`right` flank the strip + footer. The middle band is `position: relative`, so `overlay`/`floating` sidebars anchor correctly. Slot content lives **inside** `<Plancia>`, so it can `useOpenWindow()` to open windows. |

```vue
<Plancia :registry="registry">
  <template #window-actions="{ win }">
    <button v-if="win.props.path" class="plancia-btn" title="Links" @click="openLinks(win)">
      <!-- your icon -->
    </button>
  </template>

  <template #empty>
    <p>Pick something from the sidebar.</p>
  </template>
</Plancia>
```

A sidebar whose menu opens windows — the `openHint` made real. The menu is its own
component rendered inside `<Plancia>`, so `useOpenWindow()` resolves (see
[Sidebar → Inside `<Plancia>`](./sidebar.md#inside-plancia)):

```vue
<Plancia :registry="registry">
  <template #sidebar-left>
    <PlanciaSidebar position="left" :responsive="768">
      <SidebarMenu />
    </PlanciaSidebar>
  </template>
</Plancia>
```

### Behaviour built in

- Two layouts, switchable at runtime via `v-model:view-mode` — the tiling
  `strip` and a `tabs` bar over a single focused pane. See
  [View mode](./view-mode.md).
- Tiling strip with horizontal scroll-snap; the focused window is scrolled into
  view automatically.
- Header buttons: **resize** (cycles `widthCycle`), **minimize** (to footer),
  **close** (confirms first if the window is `dirty`).
- Footer lists minimized windows; clicking restores + focuses one.
- Keyboard: `Alt + ArrowLeft` / `Alt + ArrowRight` move focus between visible
  windows — the DOM focus too, when it is in the plancia (or on the page), not
  when it is in a dialog or a bar of the host.
- The focus follows the windows: a window that closes or goes to the footer
  while it holds the focus (in it, on its tab or on its chip) gives it back to
  the control that opened it, if that is still on the page; else to the window
  that takes over; else the host gets `focus-out`. Restoring a window from its
  chip puts the focus in it. A host that moved the focus itself keeps it.
- Each window is a named region: its title (with the module of a foreign
  window) names it, and it can take the focus itself (`tabindex="-1"`). A focus
  that enters a window, by Tab or by script, makes it the focused one, as a
  click does.
- With `allowFullscreen`, a **full-screen** button: see [Full screen](#full-screen).
- Clickable header **tags** open their `open` target — but only if that type is
  registered in this plancia (otherwise the tag stays informational).

### Events

| Event | Payload | When |
|---|---|---|
| `update:viewMode` | `'strip' \| 'tabs'` | The view mode changed (`v-model:view-mode`). |
| `focus-out` | — | A window that held the focus went, and no window is left to take it. Put the focus somewhere, e.g. your `main`; otherwise it stays on the page. |
| `update:fullscreen` | `boolean` | Full screen began or ended (`v-model:fullscreen`): by the button, by Esc, or because its window closed or went to the footer. |

### Full screen

With `allowFullscreen`, each window's header has a button that makes the
focused window cover the page (`position: fixed`, over the sidebars and
under the dialogs, `--plancia-fullscreen-z`).

- **The browser** goes full screen too, on the whole document, so that dialogs
  mounted in the body stay in sight. A browser that refuses (no user
  gesture, a phone without the Fullscreen API) leaves the window covering the
  page.
- **It ends** with the button again, with Esc (the browser leaves its full
  screen, and the window follows), or when that window closes or goes to the
  footer.
- **It follows the focus**: a window opened from the one in full screen takes
  its place.
- **The window stays the same element**, so an iframe in it does not reload.
  The other windows, the tab bar and the footer are `inert` meanwhile.
- **The rest of your page** is yours to set aside: bind `v-model:fullscreen`
  and make your bars `inert` while it is on.

```vue
<Plancia v-model:fullscreen="full" allow-fullscreen :registry="registry" />
<header :inert="full || undefined">…</header>
```

### Provides

`<Plancia>` provides the injection contract consumed by window content:

- `OPEN_WINDOW` → `(spec: OpenSpec) => string` (see `useOpenWindow`)
- `CAN_OPEN_TYPE` → `(type: string) => boolean` (see `useCanOpenWindowType`)

## `<WindowFrame>`

The chrome around a single window (header + body slot). `<Plancia>` renders one
per visible window, so you normally don't use it directly — it's exported for
advanced cases (custom layouts).

| Prop | Type | Notes |
|---|---|---|
| `win` *(required)* | `WindowInstance` | The window to render. |
| `foreignLabel` | `string \| null` | Cross-module prefix label, or null. |
| `labels` | `PlanciaLabels` | Fully-resolved labels. |
| `resolveTone` | `(tone?: string) => string` | Tag/badge tone class. |

Slots: default (`{ win }`) = the window **body**; `actions` (`{ win }`) =
extra header buttons (what `<Plancia>`'s `window-actions` forwards into).
A frame kept alive (tabs mode) renders its slots again while it is hidden:
read the window from `win`, the frame's own, not from the store's focused
window.

## `<PlanciaLayout>`

A generic edge-and-center layout shell, independent of the window manager. It
arranges up to four edge regions around a content area: `top`/`bottom` span the
full width, `left`/`right` flank the centre (the default slot). Drop a
[`<PlanciaSidebar>`](./sidebar.md) — or any content (a toolbar, a status bar) —
into an edge slot. The shell and its middle band are `position: relative`, so
`overlay`/`floating` sidebars anchor correctly. Fills its parent (give it a
height).

```vue
<PlanciaLayout>
  <template #top><header>…</header></template>
  <template #left><PlanciaSidebar position="left">…</PlanciaSidebar></template>
  <template #right><PlanciaSidebar position="right">…</PlanciaSidebar></template>

  <Plancia :registry="registry" /> <!-- centre = default slot -->
</PlanciaLayout>
```

| Slot | Purpose |
|---|---|
| default | Centre content (e.g. a `<Plancia>` or your app). |
| `top` / `bottom` | Full-width regions above / below the centre band. |
| `left` / `right` | Regions flanking the centre. |

> `<Plancia>` also has its own `sidebar-*` slots. Use those when the sidebar is
> part of the window manager; reach for `<PlanciaLayout>` when you want a sidebar
> (or toolbar/status bar) around **arbitrary** content.

## Injection

For window content rendered inside `<Plancia>`:

```ts
import { useOpenWindow, useCanOpenWindowType } from 'plancia'

const open = useOpenWindow()                 // (spec) => id  ('' if outside a Plancia)
const canOpen = useCanOpenWindowType()       // (type) => boolean

if (canOpen('graph')) open({ type: 'graph', key: 'graph:x', props: { focus: 'x' } })
```

The raw injection keys `OPEN_WINDOW` and `CAN_OPEN_TYPE` are exported too, if you
prefer `inject(KEY)` directly.
