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

### Slots

| Slot | Props | Purpose |
|---|---|---|
| `window-actions` | `{ win: WindowInstance }` | Extra buttons in **every** window header (before the resize button). This is where app-specific, per-window actions live — e.g. a "show links" button gated on `win.props.path`. |
| `empty` | — | Replaces the default "no window open" placeholder. |

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

### Behaviour built in

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
