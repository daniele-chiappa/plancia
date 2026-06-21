# Getting started

## Requirements

plancia has **no runtime dependencies**. It declares peer dependencies that your
app must already provide:

| Peer | Range | Required? |
|---|---|---|
| `vue` | `^3.5.0` | yes |
| `pinia` | `^2.2.0 \|\| ^3.0.0` | yes |
| `vue-router` | `^4.0.0` | only if you use [`usePlanciaSync`](./url-sync.md) |

## Install

```bash
npm install plancia
```

(The package ships prebuilt ESM + `.d.ts`, so your bundler/TS version does not
have to match the one used to build plancia.)

## Wire it up

plancia uses a Pinia store, so a Pinia instance must be registered on the app:

```ts
// main.ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

createApp(App).use(createPinia()).mount('#app')
```

Import the stylesheet **once** (anywhere that runs at startup):

```ts
import 'plancia/style.css'
```

## A minimal plancia

### 1. Define your window content

A window's content is an ordinary Vue component. It receives the window's `props`
and may talk back to the frame via events (all optional):

```vue
<!-- windows/NoteWindow.vue -->
<script setup lang="ts">
import { watch } from 'vue'

const props = defineProps<{ path: string }>()
const emit = defineEmits<{ title: [string]; dirty: [boolean] }>()

// Tell the frame what to show in the header.
watch(() => props.path, (p) => emit('title', p), { immediate: true })
</script>

<template>
  <div style="padding: 1rem">Editing {{ path }}</div>
</template>
```

### 2. Build a registry (`type → component`)

```ts
// registry.ts
import { defineAsyncComponent, markRaw } from 'vue'
import type { WindowRegistry } from 'plancia'

export const registry: WindowRegistry = {
  // Lazy so heavy windows are code-split and load on first open.
  note: markRaw(defineAsyncComponent(() => import('./windows/NoteWindow.vue'))),
  settings: markRaw(defineAsyncComponent(() => import('./windows/SettingsWindow.vue'))),
}
```

### 3. Render `<Plancia>` and open windows

```vue
<script setup lang="ts">
import { Plancia, useWindowsStore } from 'plancia'
import 'plancia/style.css'
import { registry } from './registry'

const windows = useWindowsStore()

function openNote(path: string) {
  // `key` de-dups: opening the same key again focuses the existing window.
  windows.open({ type: 'note', key: `note:${path}`, props: { path } })
}
</script>

<template>
  <div style="display: flex; flex-direction: column; height: 100vh">
    <header>
      <button @click="openNote('hello.md')">Open note</button>
      <button @click="windows.open({ type: 'settings', key: 'settings', title: 'Settings' })">
        Settings
      </button>
    </header>
    <!-- Plancia fills its parent; give it a height. -->
    <main style="flex: 1; min-height: 0">
      <Plancia :registry="registry" />
    </main>
  </div>
</template>
```

That's a working window manager: windows tile left-to-right, the resize button
cycles width (`s → m → full`), the minimize button drops a window to the footer,
and `Alt + ←/→` moves focus between visible windows.

## Next steps

- [Concepts](./concepts.md) — how the pieces fit together.
- [URL & state sync](./url-sync.md) — make windows survive reload / deep-link.
- [Theming](./theming.md) — match your app's look with CSS variables.
