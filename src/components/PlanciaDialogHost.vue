<script setup lang="ts">
/**
 * PlanciaDialogHost — renders the imperative dialog queue. Mount it ONCE near
 * the app root (it needs an active Pinia). Each queued request becomes a
 * PlanciaConfirm (confirm/alert) or PlanciaPrompt; resolving wires back to the
 * store, which resolves the caller's Promise. Stacking is handled by the modal
 * primitive (only the top dialog traps focus / handles Esc).
 */
import { usePlanciaDialogStore } from '../dialog/dialogStore'
import type { PromptOptions } from '../dialog/types'
import PlanciaConfirm from './PlanciaConfirm.vue'
import PlanciaPrompt from './PlanciaPrompt.vue'

const store = usePlanciaDialogStore()
const asPrompt = (o: unknown): PromptOptions => o as PromptOptions
</script>

<template>
  <template v-for="d in store.queue" :key="d.id">
    <PlanciaConfirm
      v-if="d.kind === 'confirm' || d.kind === 'alert'"
      :open="true"
      :message="d.options.message"
      :title="d.options.title"
      :danger="d.options.danger"
      :hide-cancel="d.kind === 'alert'"
      :confirm-label="d.options.confirmLabel ?? (d.kind === 'alert' ? 'OK' : undefined)"
      :cancel-label="d.options.cancelLabel"
      @confirm="store.resolve(d.id, d.kind === 'confirm' ? true : undefined)"
      @cancel="store.resolve(d.id, d.kind === 'confirm' ? false : undefined)"
    />
    <PlanciaPrompt
      v-else
      :open="true"
      :message="d.options.message"
      :title="d.options.title"
      :value="asPrompt(d.options).value"
      :placeholder="asPrompt(d.options).placeholder"
      :confirm-label="d.options.confirmLabel"
      :cancel-label="d.options.cancelLabel"
      @confirm="store.resolve(d.id, $event)"
      @cancel="store.resolve(d.id, null)"
    />
  </template>
</template>
