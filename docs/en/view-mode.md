# View mode — strip ↔ tabs

`<Plancia>` lays its windows out in one of two modes:

- **`strip`** (default) — the niri-style horizontal strip: every visible window
  is mounted side by side and scrolled into view.
- **`tabs`** — a horizontally-scrollable **tab bar** over a single full-width
  pane; only the **focused** window is mounted (kept alive up to `keepAliveMax`).
  Each tab shows the window title and a **direct close** button.

Strip is best for comparing windows side by side; tabs is best for focusing on
one window at a time and for **hosting many windows cheaply** (see *Performance*).

## Switching mode

`viewMode` is a `v-model`, so the host owns (and can persist) the choice:

```vue
<script setup>
import { ref } from 'vue'
const mode = ref('strip') // 'strip' | 'tabs' — persist it in your own store
</script>

<template>
  <Plancia v-model:view-mode="mode" :registry="registry" />
</template>
```

Or set only the **initial** mode via config (uncontrolled):

```ts
defineConfig({
  components: { window: { defaults: { viewMode: 'tabs' } } },
})
```

Precedence is the usual **prop (v-model) › config › built-in (`'strip'`)**.

## The toggle

In `tabs` mode a built-in toggle button is rendered at the end of the tab bar.

- Hide it with `:show-view-toggle="false"`.
- Replace it with your own via the **`view-toggle`** slot — it receives
  `{ mode, toggle }`:

  ```vue
  <Plancia v-model:view-mode="mode" :registry="registry">
    <template #view-toggle="{ mode, toggle }">
      <button @click="toggle">{{ mode === 'tabs' ? 'Strip' : 'Tabs' }}</button>
    </template>
  </Plancia>
  ```

Because there is no tab bar in `strip` mode, place your primary "switch to tabs"
control in your own chrome (e.g. a top bar) and drive it through `v-model` — that
is the recommended pattern for making both directions reachable.

## Performance — many windows

In `strip` mode every visible window is mounted at once: cost grows **O(N)** in
the number of windows (each mounts its content component and its reactivity).

In `tabs` mode only the focused window is mounted, wrapped in
[`<KeepAlive :max>`](https://vuejs.org/guide/built-ins/keep-alive.html):

- Switching tabs **preserves** the previous window's state (scroll position,
  unsaved input) instead of re-mounting/re-fetching it.
- `keepAliveMax` (prop, or `components.window.defaults.keepAliveMax`, default
  **`5`**) bounds how many window subtrees stay mounted (LRU eviction).

> **Caveat.** Kept-alive subtrees are *deactivated* but **still reactive** — their
> watchers keep firing. Keep `keepAliveMax` modest, and in your window components
> gate expensive work (fetches, heavy renders, timers) on `onActivated` /
> `onDeactivated` so inactive tabs stay cheap.

Very large window counts in **strip** mode (hundreds) are not virtualized yet;
prefer `tabs` there.

## Labels

Optional labels used by the tab bar / toggle (merged over the English defaults):

| Label | Default | Where |
|---|---|---|
| `close` | `Close` | tab close button (shared with the window header) |
| `dirty` | `Unsaved changes` | unsaved-dot title on a tab |
| `viewStrip` | `Strip` | reserved for host toggles |
| `viewTabs` | `Tabs` | reserved for host toggles |
| `viewToggle` | `Toggle view` | built-in toggle `aria-label` |
