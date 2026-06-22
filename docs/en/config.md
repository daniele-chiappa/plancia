# Config

`PlanciaConfig` is a serializable, per-component configuration of **appearance**
(theme CSS vars) and **behavior** (a curated subset of prop defaults) + **labels**.
Apply it with `<PlanciaConfigProvider>`. The primitives work with **zero config**;
the config layer is opt-in and **Pinia-free**.

```ts
import { PlanciaConfigProvider, defineConfig } from 'plancia'
import 'plancia/style.css'
```

## Shape

```ts
interface PlanciaConfig {
  meta?: { name?: string; version?: number }
  theme?: Record<string, string>            // '--plancia-*' → value (the '--' is optional)
  components?: {
    window?:  { defaults?: WindowConfigDefaults;  labels?: Partial<PlanciaLabels> }
    sidebar?: { defaults?: SidebarConfigDefaults; labels?: Partial<SidebarLabels> }
    dialog?:  { defaults?: ModalConfigDefaults;   labels?: Partial<ModalLabels> }
  }
}
```

Currently configurable **behavior defaults** (more can be wired over time):

| Family | `defaults` |
|---|---|
| `window` | `widthCycle`, `defaultWidth` |
| `sidebar` | `mode`, `defaultState`, `responsive` |
| `dialog` | `closeOnBackdrop`, `closeOnEsc` |

`defineConfig(config)` is a typed authoring helper (identity) — author in TS,
persist as JSON.

## `<PlanciaConfigProvider>`

Wrap your app (or a subtree). It sets the theme vars on its own wrapper (scoped)
and provides the config so descendants read defaults/labels.

```vue
<PlanciaConfigProvider :config="config">
  <YourApp />
</PlanciaConfigProvider>
```

| Prop | Type | Default | Notes |
|---|---|---|---|
| `config` | `PlanciaConfig` | `{}` | The config to apply. |
| `global` | `boolean` | `true` | Also mirror the theme onto `:root`, so **teleported** dialogs / backdrops pick it up. Set `false` for pure scoped theming (multiple themes on one page). |
| `tag` | `string` | `'div'` | Wrapper element. |

### Precedence

For any configurable value: **explicit prop › config › built-in default**. So a
component with no prop uses the config; passing the prop overrides it.

## Imperative helpers

```ts
import { applyTheme, themeToCss } from 'plancia'

applyTheme({ '--plancia-accent': '#16a34a' })   // set vars on :root (or pass an element)
const css = themeToCss({ '--plancia-accent': '#16a34a' })  // ':root { … }' string for a static file
```

## Folders & presets

A convention for storing configs:

```
plancia.config/
  current.json        ← the active config your app loads
  presets/
    light.json · dark.json · tailwind.json · compact.json
```

Load and apply:

```ts
import current from '../plancia.config/current.json'
```
```vue
<PlanciaConfigProvider :config="current"> … </PlanciaConfigProvider>
```

Configs are plain JSON — hand-edit them, or generate them with a configurator.
The `tailwind` preset maps the [semantic core](./theming.md#deriving-from-tailwind)
to Tailwind v4 tokens.

## Example

```ts
export default defineConfig({
  meta: { name: 'dark-compact' },
  theme: {
    '--plancia-surface': '#1e293b',
    '--plancia-text': '#e2e8f0',
    '--plancia-border': '#334155',
    '--plancia-accent': '#60a5fa',
    '--plancia-on-accent': '#0b1220',
  },
  components: {
    window: { defaults: { defaultWidth: 's' } },
    sidebar: { defaults: { defaultState: 'collapsed' }, labels: { sidebar: 'Menu' } },
    dialog: { defaults: { closeOnEsc: false } },
  },
})
```
