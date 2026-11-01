# Recipes

Practical patterns. All snippets assume `import 'plancia/style.css'` and an active
Pinia instance.

## Open a sibling window from content

Any component under `<Plancia>` can spawn windows without prop-drilling:

```vue
<script setup lang="ts">
import { useOpenWindow } from 'plancia'
const open = useOpenWindow()

function openBacklinks(path: string) {
  open({ type: 'graph', key: `graph:${path}`, title: `↳ ${path}`, props: { focus: path } })
}
</script>
```

## Clickable header tags (cross-window links)

A tag with an `open` spec becomes a button that opens that window — but only if
its type is registered in the host plancia (otherwise it stays informational).
Emit tags from the content:

```vue
<script setup lang="ts">
import { watch } from 'vue'
import type { WindowTag } from 'plancia'
const props = defineProps<{ path: string; brand?: string }>()
const emit = defineEmits<{ tags: [WindowTag[]] }>()

watch(() => [props.path, props.brand], () => {
  const tags: WindowTag[] = [{ label: 'note', tone: 'accent' }]
  if (props.brand) {
    tags.push({
      label: props.brand,
      tone: 'info',
      open: { type: 'brand', key: `brand:${props.brand}`, props: { name: props.brand } },
    })
  }
  emit('tags', tags)
}, { immediate: true })
</script>
```

## Per-window action button (domain-specific)

Keep domain actions out of the library by adding them through the
`window-actions` slot. Gate them on the window's `props`:

```vue
<script setup lang="ts">
import { Plancia, useWindowsStore, type WindowInstance } from 'plancia'
const windows = useWindowsStore()
function openLinks(win: WindowInstance) {
  const path = win.props.path as string
  windows.open({ type: 'graph', key: `graph:${path}`, props: { focus: path } })
}
</script>

<template>
  <Plancia :registry="registry">
    <template #window-actions="{ win }">
      <button v-if="win.props.path" class="plancia-btn" title="Links" @click="openLinks(win)">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="6" cy="12" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="18" cy="18" r="2" />
          <line x1="8" y1="11" x2="16" y2="7" /><line x1="8" y1="13" x2="16" y2="17" />
        </svg>
      </button>
    </template>
  </Plancia>
</template>
```

## Foreign / cross-module windows

When one plancia can host windows that belong to other modules, set `nativeType`
(the owner) and a `moduleLabel` resolver. Foreign windows get a `[label]: title`
header prefix:

```vue
<script setup lang="ts">
const MODULE_LABELS: Record<string, string> = { brand: 'Brands', record: 'Records' }
</script>

<template>
  <Plancia
    :registry="registry"
    native-type="record"
    :module-label="(t) => MODULE_LABELS[t] ?? t"
  />
</template>
```

## Re-key a draft after saving

A "new" window often starts without a stable key. After it's persisted and gets
an id, re-key it so de-dup and URL sync work — emit `identify` from the content:

```vue
<script setup lang="ts">
const emit = defineEmits<{ identify: [{ key: string; props: Record<string, unknown> }] }>()
async function onSaved(id: number) {
  emit('identify', { key: `record:${id}`, props: { id } })
}
</script>
```

## Refresh a list when content changes data

A content window signals a data mutation with `changed`; a sidebar/list watches
`dataVersion`:

```ts
// content window
const emit = defineEmits<{ changed: [] }>()
await save(); emit('changed')

// list elsewhere
import { watch } from 'vue'
import { useWindowsStore } from 'plancia'
const windows = useWindowsStore()
watch(() => windows.dataVersion, () => reload())
```

## Confirm-on-close for unsaved work

Mark the window dirty; the frame's close button (and footer close) will confirm
before closing using the `unsavedClose` label:

```ts
const emit = defineEmits<{ dirty: [boolean] }>()
emit('dirty', true)   // editing started
emit('dirty', false)  // saved
```

## Focus a window

A window opened by a gesture should take the focus, so a screen reader says
which window it is and Tab goes on to its first control. `usePlanciaFocus()`
gives `focusWindow(id, { wait })`: it focuses the element `<Plancia
focus-target>` selects in the window's body, or the window itself. Views loaded
on demand draw their heading later, so `wait` gives them that long (ms).

```vue
<!-- the shell -->
<Plancia :registry="registry" focus-target="[data-window-heading]" />

<!-- each view -->
<h1 data-window-heading tabindex="-1">{{ title }}</h1>
```

```ts
import { useWindowsStore, usePlanciaFocus } from 'plancia'

const windows = useWindowsStore()
const { focusWindow } = usePlanciaFocus()

function openNote(path: string) {
  const id = windows.open({ type: 'note', key: `note:${path}`, props: { path } })
  void focusWindow(id, { wait: 2000 })
}
```

The focus moves only if it is still where it was when `focusWindow` was called
(or on the page, once that element went): a key pressed meanwhile keeps it. Only
the last call moves it. It resolves to `true` when the focus landed in the
window. It works from anywhere under the same Pinia — a bar or a palette outside
`<Plancia>` too — since the selector comes from the store. The window must be on
screen: in `tabs` mode, the focused one.

## Keyboard

Built in: `Alt + ArrowLeft` / `Alt + ArrowRight` move focus between visible
windows. Drive anything else through the store, e.g. a command palette:

```ts
const windows = useWindowsStore()
function focusFirst() {
  const first = windows.visible[0]
  if (first) windows.focus(first.id)
}
```
