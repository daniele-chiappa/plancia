# Concepts

## The window

A window is a lightweight record held in the store:

```ts
interface WindowInstance {
  id: string            // generated, stable for the window's lifetime
  type: string          // looked up in the registry to pick the content component
  key: string           // logical de-dup key (you choose it)
  title: string         // shown in the header (usually set by the content)
  props: Record<string, unknown>   // passed to the content component
  tags: WindowTag[]     // header chips (associations), some clickable
  width: 's' | 'm' | 'full'
  minimized: boolean
  dirty: boolean        // shows an "unsaved" marker; gates the close confirm
}
```

You never construct one directly — you call `store.open(spec)` with an
[`OpenSpec`](./store.md#openspec) and the store fills in the rest.

### Keys and de-duplication

`key` is the identity you care about (e.g. `note:hello.md`, `settings`). Opening a
spec whose `key` already exists **focuses/restores** the existing window instead
of creating a duplicate. Pick stable keys.

## The registry (`type → component`)

plancia is content-agnostic: it does not know what a window contains. You pass a
`registry` mapping each `type` string to the Vue component that renders it:

```ts
const registry: WindowRegistry = {
  note: markRaw(defineAsyncComponent(() => import('./NoteWindow.vue'))),
  graph: markRaw(defineAsyncComponent(() => import('./GraphWindow.vue'))),
}
```

Use `markRaw` (and usually `defineAsyncComponent`) so components are not made
reactive and heavy ones are code-split.

## The store

A single Pinia store, [`useWindowsStore`](./store.md), is the source of truth: the
list of windows, which one is focused, and width behaviour. It is **pure** — it
holds no router and no DOM — which keeps it unit-testable. Both `<Plancia>` and
your own UI (toolbars, sidebars) drive it through the same actions.

## The content ↔ frame contract

The content component is rendered inside a [`WindowFrame`](./components.md). It
communicates with the frame/store through **props in, events out**:

**Props in:** the window's `props` are bound onto your component (`v-bind`).

**Events out** (all optional) — `<Plancia>` wires them to store actions:

| Event | Payload | Effect |
|---|---|---|
| `title` | `string` | sets the header title |
| `dirty` | `boolean` | toggles the unsaved marker + close confirmation |
| `tags` | `WindowTag[]` | sets the header chips |
| `identify` | `{ key: string; props: Record<string, unknown> }` | re-keys a window (e.g. after a draft is saved and gets an id) |
| `changed` | — | bumps `dataVersion` so dependent views can refresh |
| `close` | — | closes the window |

```vue
<script setup lang="ts">
const emit = defineEmits<{
  title: [string]; dirty: [boolean]; close: []
}>()
</script>
```

## Opening sibling windows

Content nested anywhere under `<Plancia>` can open more windows without
prop-drilling, via the injected opener:

```ts
import { useOpenWindow } from 'plancia'
const open = useOpenWindow()
open({ type: 'graph', key: 'graph:hello.md', props: { focus: 'hello.md' } })
```

See [`useCanOpenWindowType`](./components.md#injection) to check whether a type is
registered before offering a link.

## Persistence (optional)

The store is intentionally router-free. To reflect windows in the URL (deep
links, back/forward) and/or `localStorage`, opt into
[`usePlanciaSync`](./url-sync.md). How a window maps to a URL token is decided by
a **codec** you provide, so plancia adapts to your app's URL scheme rather than
imposing one.

## Theming

The chrome is styled with CSS custom properties (`--plancia-*`) and plain
`plancia-*` classes — no Tailwind or design tokens required. Override the
variables to match your app. See [Theming](./theming.md).
