<script setup lang="ts">
// Dev playground: drives the library component to iterate locally / in the
// Docker webui. NOT part of the published bundle.
import { Plancia, useWindowsStore, type PlanciaLabels, type WindowWidth } from '../index'
import { registry } from './registry'

const store = useWindowsStore()
let n = 0

const labels: Partial<PlanciaLabels> = {
  empty: 'Nessuna finestra aperta.',
  openHint: 'Usa la toolbar in alto per aprire una finestra.',
  minimizedHint: (k) => `${k} ridotte nel footer ↓`,
  minimizedLabel: 'Ridotte:',
  resize: 'Larghezza',
  minimize: 'Riduci',
  close: 'Chiudi',
  restore: 'Ripristina',
  dirty: 'Modifiche non salvate',
  unsavedClose: 'Modifiche non salvate. Chiudere comunque?',
  openTag: 'Apri',
}
const widthCycle: WindowWidth[] = ['s', 'm', 'full']
const resolveTone = (tone?: string) => (tone ? `tone-${tone}` : '')

function openNote() {
  n += 1
  store.open({ type: 'note', key: `note:demo-${n}.md`, props: { path: `demo-${n}.md` } })
}
function openGraph() {
  store.open({ type: 'graph', key: 'graph', title: 'Grafico' })
}
function openSettings() {
  store.open({ type: 'settings', key: 'settings', title: 'Impostazioni' })
}
</script>

<template>
  <div class="app">
    <header class="toolbar">
      <strong>plancia · playground</strong>
      <button type="button" @click="openNote">+ Nota</button>
      <button type="button" @click="openGraph">+ Grafico</button>
      <button type="button" @click="openSettings">+ Impostazioni</button>
      <span class="spacer" />
      <small>Alt+← / Alt+→ spostano il focus · ⤢ cicla larghezza</small>
    </header>
    <main class="stage">
      <Plancia
        :registry="registry"
        native-type="note"
        :labels="labels"
        :width-cycle="widthCycle"
        :resolve-tone="resolveTone"
      />
    </main>
  </div>
</template>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
}
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  font-family: system-ui, sans-serif;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}
.toolbar .spacer {
  flex: 1;
}
.toolbar button {
  cursor: pointer;
  border: 1px solid #cbd5e1;
  border-radius: 0.375rem;
  background: #fff;
  padding: 0.25rem 0.6rem;
}
.stage {
  flex: 1;
  min-height: 0;
  background: #f1f5f9;
}
/* demo tone classes consumed via the manager's resolveTone prop */
.tone-accent {
  background: rgba(59, 130, 246, 0.15);
  color: #1d4ed8;
}
.tone-info {
  background: rgba(14, 165, 233, 0.15);
  color: #0369a1;
}
</style>
