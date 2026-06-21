<script setup lang="ts">
// Demo content: a "note" window. Shows the content↔frame event contract
// (title/dirty/tags/close) and opening sibling windows via useOpenWindow().
import { ref, watch } from 'vue'
import { useOpenWindow, type WindowTag } from '../index'

const props = defineProps<{ path?: string }>()
const emit = defineEmits<{
  title: [string]
  dirty: [boolean]
  tags: [WindowTag[]]
  close: []
}>()

const open = useOpenWindow()
const body = ref(`# ${props.path ?? 'nuova-nota'}\n\nContenuto demo — modifica il testo per marcare la finestra come «dirty».`)
let linked = 0

watch(
  () => props.path,
  (p) => {
    emit('title', p ? (p.split('/').pop() ?? p) : 'Nuova nota')
    emit('tags', [
      { label: 'demo', tone: 'accent' },
      p
        ? { label: '↳ grafico', tone: 'info', open: { type: 'graph', key: `graph:${p}`, title: `↳ ${p}`, props: { focus: p } } }
        : { label: 'senza path' },
    ])
  },
  { immediate: true },
)

function openLinked() {
  linked += 1
  open({ type: 'note', key: `note:linked-${linked}.md`, props: { path: `linked-${linked}.md` } })
}
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 0.5rem; padding: 0.75rem">
    <button type="button" style="align-self: flex-start" @click="openLinked">
      Apri nota collegata →
    </button>
    <textarea
      v-model="body"
      style="min-height: 12rem; width: 100%; box-sizing: border-box; resize: vertical; font-family: ui-monospace, monospace"
      @input="emit('dirty', true)"
    />
  </div>
</template>
