# Store — `useWindowsStore`

A Pinia options store (id `plancia-windows`) holding all windows. It is pure (no
router, no DOM), so it is straightforward to unit-test. Both `<Plancia>` and your
own UI drive it through the same actions.

```ts
import { useWindowsStore } from 'plancia'
const windows = useWindowsStore()
```

> A Pinia instance must be active (`app.use(createPinia())`). The store is a
> singleton: all `<Plancia>` instances in the app share it.

## OpenSpec

The shape you pass to `open()`:

```ts
interface OpenSpec {
  type: string                       // registry key
  key?: string                       // de-dup identity; auto-generated if omitted
  title?: string
  props?: Record<string, unknown>    // passed to the content component
  tags?: WindowTag[]
  width?: 's' | 'm' | 'full'         // defaults to the store's defaultWidth
  focus?: boolean                    // false = open without stealing focus
}
```

```ts
interface WindowTag {
  label: string
  tone?: string         // free key; styled via resolveTone / [data-tone]
  open?: OpenSpec        // set ⇒ the tag is clickable and opens this spec
}
```

## State

| Field | Type | Meaning |
|---|---|---|
| `windows` | `WindowInstance[]` | All windows, in display order. |
| `focusedId` | `string \| null` | Currently focused window. |
| `seq` | `number` | Monotonic counter for generated ids. |
| `dataVersion` | `number` | Bumped by `touch()`; watch it to refresh dependent views. |
| `widthCycle` | `('s'\|'m'\|'full')[]` | Order cycled by `cycleWidth`. |
| `defaultWidth` | `'s'\|'m'\|'full'` | Width applied when `open()` has no `width`. |

## Getters

| Getter | Returns | Meaning |
|---|---|---|
| `visible` | `WindowInstance[]` | Non-minimized windows (the tiled strip). |
| `minimizedList` | `WindowInstance[]` | Minimized windows (the footer). |
| `focused` | `WindowInstance \| null` | The focused window. |

## Actions

| Action | Signature | Notes |
|---|---|---|
| `configure` | `(cfg: { widthCycle?; defaultWidth? }) => void` | Set width behaviour. `<Plancia>` calls this from its props; call it yourself only if you use the store without the component. |
| `open` | `(spec: OpenSpec) => string` | Opens, or focuses/restores if `key` exists. Inserts the new window **immediately right of the focused one**. Returns the window id. |
| `close` | `(id: string) => void` | Removes the window; re-focuses a neighbour. |
| `minimize` | `(id: string) => void` | Sends to the footer; focus moves to the last visible window. |
| `restore` | `(id: string) => void` | Brings back from the footer and focuses it. |
| `focus` | `(id: string) => void` | Focuses a window. |
| `focusAdjacent` | `(dir: -1 \| 1) => void` | Moves focus to the adjacent *visible* window (clamped at the ends). |
| `cycleWidth` | `(id: string) => void` | Advances `width` along `widthCycle`. |
| `setTitle` | `(id: string, title: string) => void` | — |
| `setDirty` | `(id: string, dirty: boolean) => void` | — |
| `setTags` | `(id: string, tags: WindowTag[]) => void` | — |
| `identify` | `(id: string, key: string, props) => void` | Re-keys a window and merges `props` (e.g. after a draft is saved and gains an id) → correct de-dup and URL sync afterwards. |
| `touch` | `() => void` | Bumps `dataVersion`. |
| `reset` | `() => void` | Clears all windows + focus. Keeps the configured width behaviour. |

## Examples

```ts
const windows = useWindowsStore()

// Open (deduped by key)
const id = windows.open({ type: 'note', key: 'note:hello.md', props: { path: 'hello.md' } })

// Open in the background (no focus steal)
windows.open({ type: 'graph', key: 'graph:hello.md', props: { focus: 'hello.md' }, focus: false })

// React to data changes signalled by window content
import { watch } from 'vue'
watch(() => windows.dataVersion, () => reloadSidebarList())

// Configure width behaviour without <Plancia> (rare)
windows.configure({ widthCycle: ['m', 'full', 's'], defaultWidth: 'm' })
```

## Testing

Because the store is pure, tests need only Pinia:

```ts
import { setActivePinia, createPinia } from 'pinia'
import { useWindowsStore } from 'plancia'

beforeEach(() => setActivePinia(createPinia()))

it('dedups by key', () => {
  const s = useWindowsStore()
  const a = s.open({ type: 'note', key: 'k' })
  expect(s.open({ type: 'note', key: 'k' })).toBe(a)
  expect(s.windows).toHaveLength(1)
})
```
