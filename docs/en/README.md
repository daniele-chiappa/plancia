# plancia — documentation

**plancia** is a niri-style tiling **window manager** component for **Vue 3**: a
horizontal, scroll-snapping strip of resizable "windows", with a footer of
minimized ones. It is **content-agnostic** — a `type → component` registry decides
what each window renders — and **dependency-light** (no runtime dependencies; it
only needs Vue + Pinia, which your app already has).

```ts
import { Plancia, useWindowsStore } from 'plancia'
import 'plancia/style.css'
```

```vue
<Plancia :registry="registry" />
```

## Contents

| Page | What it covers |
|---|---|
| [Getting started](./getting-started.md) | Install, peer deps, a minimal working plancia |
| [Concepts](./concepts.md) | Windows, the registry, the store, the content↔frame contract |
| [Components](./components.md) | `<Plancia>` and `<WindowFrame>` — props, slots, events |
| [Store](./store.md) | `useWindowsStore` — state, getters, actions |
| [URL & state sync](./url-sync.md) | `usePlanciaSync` + `createArgCodec` |
| [Theming](./theming.md) | CSS variables, window sizing, labels / i18n |
| [Recipes](./recipes.md) | Cross-window links, clickable tags, per-window actions, foreign windows |
| [Sidebar](./sidebar.md) | `<PlanciaSidebar>` — 4 edges, states, modes, hover-peek, drag-resize, responsive drawer |
| [Dialogs](./dialog.md) | `<PlanciaModal>` / `<PlanciaConfirm>` + the imperative `useDialogs()` service |
| [Config](./config.md) | `PlanciaConfig` — theme + behavior defaults via `<PlanciaConfigProvider>` |
| [Configurator](./configurator.md) | dev tool — visual `PlanciaConfig` editor with live preview (container) |

## At a glance

- **Vue 3.5+**, TypeScript, ships prebuilt ESM + type declarations.
- **Pinia** store (`useWindowsStore`) holds the windows; it is pure (no router),
  so it is trivially unit-testable.
- **URL sync** is opt-in (`usePlanciaSync`) and pluggable via a token *codec*,
  so it adapts to whatever URL scheme your app uses. It needs `vue-router`
  (an optional peer).
- **Theming** is done with CSS custom properties — no Tailwind or design-token
  assumptions baked in.

> Requires a Pinia instance registered on the app, and a one-time
> `import 'plancia/style.css'`.
