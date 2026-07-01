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
| `showViewToggle` | `boolean` | `true` | Render the built-in view toggle in the tab bar (override its content with the `view-toggle` slot). |

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
  windows.
- Clickable header **tags** open their `open` target — but only if that type is
  registered in this plancia (otherwise the tag stays informational).

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

Slots: default = the window **body**; `actions` (`{ win }`) = extra header
buttons (what `<Plancia>`'s `window-actions` forwards into).

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
