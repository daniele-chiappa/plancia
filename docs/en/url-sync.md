# URL & state sync

The store is router-free on purpose. To reflect the open windows in the URL
(deep links, back/forward) and optionally `localStorage`, opt into
`usePlanciaSync`.

> Requires `vue-router` (an optional peer). Call it from a component that lives
> inside your router-enabled app, and run `hydrate()` once on mount.

How a window maps to a URL token is **not** hard-coded — you pass a `PlanciaCodec`.
`createArgCodec` builds one for the common cases; complex apps can hand-write one.

## `usePlanciaSync(codec, options?)`

```ts
import { onMounted } from 'vue'
import { usePlanciaSync, createArgCodec } from 'plancia'

const codec = createArgCodec({ /* … */ })
const { hydrate } = usePlanciaSync(codec, {
  useLocalStorage: true,
  storageKey: 'myapp.plancia',
})

onMounted(hydrate)
```

It writes `?w=<tokens>&f=<focus>` (debounced) on every change, and—on
back/forward—re-hydrates the store from the URL. On `hydrate()` the URL is
primary; if empty and `useLocalStorage` is on, it restores the last session.

### Options

| Option | Default | Meaning |
|---|---|---|
| `useLocalStorage` | `false` | Mirror to `localStorage` and restore it when the URL is empty. |
| `storageKey` | `'plancia'` | localStorage key. |
| `debounceMs` | `200` | Delay before writing the URL. |
| `separator` | `','` | Token separator in the `w` query param. |

### Returns

`{ hydrate, winTokens, focusToken }` — call `hydrate()` once on mount;
`winTokens` / `focusToken` are computed refs (handy for debugging/tests).

## The codec contract

```ts
interface PlanciaCodec {
  encode(win: WindowInstance): string | null   // → token, or null to skip the window
  decode(token: string): OpenSpec | null        // token → how to reopen it
  key(spec: { type: string; props?: Record<string, unknown> }): string  // de-dup key
}
```

`encode`/`decode` must round-trip, and `key()` must produce the **same** key your
app uses when calling `store.open()`, so a hydrated window de-dups against a later
manual open of the same target.

## `createArgCodec(config)`

Covers the "each window maps to one URL argument" case. Two bare-token modes let
it reproduce both source schemes.

```ts
interface ArgTypeSpec {
  arg: (props: Record<string, unknown>) => string | null   // prop → URL arg
  props?: (arg: string | null) => Record<string, unknown>  // arg → props (to reopen)
  title?: (arg: string | null) => string
}

interface ArgCodecConfig {
  nativeType?: string                  // owner type (with bareToken: 'nativeArg')
  bareToken?: 'type' | 'nativeArg'     // how to read a token with no ':' (default 'type')
  types?: Record<string, ArgTypeSpec>  // per-type rules
  default?: ArgTypeSpec                // fallback for unlisted types
  encodeArg?: (a: string) => string    // default encodeURIComponent
  decodeArg?: (a: string) => string    // default decodeURIComponent
}
```

`bareToken`:
- `'type'` — a token without `:` **is the window type** with no argument (good for
  singletons like `settings`, and string args like paths via `type:<arg>`).
- `'nativeArg'` — a token without `:` is the **argument of `nativeType`** (good for
  one primary type keyed by id, with other types written as `type:<arg>`).

### Example A — path strings + singletons

A window is a note keyed by its path, or a singleton (`settings`, `search`, …):

```ts
const codec = createArgCodec({
  bareToken: 'type',
  types: {
    note: {
      arg: (p) => (typeof p.path === 'string' ? p.path : null),
      props: (a) => (a ? { path: a } : {}),
      title: (a) => (a ? (a.split('/').pop() ?? a) : ''),
    },
    graph: {
      arg: (p) => (typeof p.focus === 'string' ? p.focus : null),
      props: (a) => (a ? { focus: a, depth: 1 } : {}),
      title: (a) => (a ? `↳ ${a}` : 'Graph'),
    },
  },
  default: { arg: () => null, title: (a) => a ?? '' }, // singletons
})
// note:docs%2Fhello.md , graph:docs%2Fhello.md , settings
```

### Example B — numeric ids with a native type

One primary type written as a bare id, others as `type:id`:

```ts
const codec = createArgCodec({
  bareToken: 'nativeArg',
  nativeType: 'record',
  default: {
    arg: (p) => (typeof p.id === 'number' ? String(p.id) : null),
    props: (a) => (a ? { id: Number(a) } : {}),
    title: (a) => (a ? `#${a}` : ''),
  },
})
// record id 12  → "12"      ;  brand id 5 → "brand:5"
```

## Keep keys consistent

The codec's `key()` and your `store.open({ key })` calls must agree. With
`createArgCodec`, the generated key is `type:<arg>` (or bare `type` for no arg) —
so open windows with the matching key:

```ts
windows.open({ type: 'note', key: `note:${path}`, props: { path } })
```
