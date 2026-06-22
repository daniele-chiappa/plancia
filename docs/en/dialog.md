# Dialogs

A small modal family: a content-agnostic **`<PlanciaModal>`** primitive, a
**`<PlanciaConfirm>`** built on it, and an **imperative dialog service**
(`useDialogs()` + `<PlanciaDialogHost>`) for `await confirm()` from anywhere —
including a Pinia store action.

The primitives need **zero Pinia**; only the imperative service is Pinia-backed
(opt-in). See the signal contract in the project's ADR-002.

```ts
import { PlanciaModal, PlanciaConfirm, useDialogs, PlanciaDialogHost } from 'plancia'
import 'plancia/style.css'
```

## `<PlanciaModal>` — the primitive

Teleports to `<body>`, opens via `v-model:open`, ships the a11y you expect.

```vue
<PlanciaModal v-model:open="open" title="Edit item">
  <p>Body…</p>
  <template #footer="{ close }">
    <button class="plancia-btn-text" @click="close">Close</button>
  </template>
</PlanciaModal>
```

| Prop | Type | Default | Notes |
|---|---|---|---|
| `open` | `boolean` | `false` | `v-model:open`. |
| `title` | `string` | `''` | Header title + ✕. Omit ⇒ no header (close via backdrop/Esc/footer). |
| `closeOnBackdrop` | `boolean` | `true` | Click outside to close. |
| `closeOnEsc` | `boolean` | `true` | Esc to close. |
| `initialFocus` | `string` | — | CSS selector for the first focused element. |
| `ariaLabel` | `string` | — | Accessible name when there's no title. |
| `labels` | `Partial<ModalLabels>` | English | `{ close }`. |

Events: `update:open`, **`close`** (fired only on *user dismissal* — Esc, backdrop,
✕ — not when the parent sets `open = false`). Slots: `title`, default, `footer`
(default + footer are scoped with `{ close }`).

## `<PlanciaConfirm>`

```vue
<PlanciaConfirm v-model:open="open" message="Delete this?" danger @confirm="onDelete" />
```

| Prop | Type | Default | Notes |
|---|---|---|---|
| `message` *(req)* | `string` | — | The question. |
| `title` | `string` | `''` | Optional header. |
| `danger` | `boolean` | `false` | Red confirm button. |
| `confirmLabel` / `cancelLabel` | `string` | `Confirm` / `Cancel` | Button labels. |
| `hideCancel` | `boolean` | `false` | One-button (acknowledge) mode. |

Events: `confirm`, `cancel`. **Any dismissal (Esc/backdrop) counts as `cancel`** —
and a confirm never also fires cancel.

## Imperative service — `useDialogs()`

Mount the host **once** near the app root, then call from anywhere:

```vue
<!-- App.vue -->
<template>
  <YourApp />
  <PlanciaDialogHost />
</template>
```

```ts
const { confirm, alert, prompt } = useDialogs()   // needs an active Pinia

if (await confirm('Delete this?')) { /* … */ }            // Promise<boolean>
await alert('Saved.')                                      // Promise<void>
const name = await prompt({ message: 'Name:', value: '' }) // Promise<string | null>
```

Each accepts a **string shorthand** or an options object
(`{ message, title?, danger?, confirmLabel?, cancelLabel? }`; `prompt` adds
`value?` / `placeholder?`). Dialogs **stack** (only the top traps focus / handles
Esc). Because it's Pinia, a **store action** can drive UI and await the user:

```ts
// inside a Pinia store action
async function remove(id: number) {
  if (!(await useDialogs().confirm('Remove permanently?'))) return
  // …
}
```

`usePlanciaDialogStore` is exported too, if you need the queue/`resolve` directly.

## Theming

| Variable | Default | Purpose |
|---|---|---|
| `--plancia-dialog-backdrop` | `rgba(0,0,0,.45)` | Scrim. |
| `--plancia-dialog-surface` | `var(--plancia-surface)` | Panel background. |
| `--plancia-dialog-border` | `var(--plancia-border)` | Panel / divider border. |
| `--plancia-dialog-radius` | `var(--plancia-radius)` | Corner radius. |
| `--plancia-dialog-shadow` | `0 12px 32px rgba(0,0,0,.18)` | Elevation. |
| `--plancia-dialog-width` | `32rem` | Max panel width. |
| `--plancia-dialog-z` | `50` | Stacking. |
| `--plancia-dialog-transition` | `160ms` | Enter/leave duration (off under reduced-motion). |

## A11y

`role="dialog"` + `aria-modal`, `aria-labelledby`/`aria-describedby`, focus trap,
focus restore to the opener, Esc on the topmost dialog only, and a **ref-counted
body scroll-lock** shared across stacked dialogs.
