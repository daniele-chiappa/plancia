<script setup lang="ts">
// Dev playground: drives the library components to iterate locally / in the
// Docker webui. NOT part of the published bundle.
import { ref } from 'vue'
import {
  Plancia,
  PlanciaLayout,
  PlanciaSidebar,
  useWindowsStore,
  type PlanciaLabels,
  type SidebarLabels,
  type SidebarMode,
  type SidebarPosition,
  type SidebarState,
  type WindowWidth,
} from '../index'
import { registry } from './registry'

const store = useWindowsStore()
let n = 0

const labels: Partial<PlanciaLabels> = {
  empty: 'Nessuna finestra aperta.',
  openHint: 'Usa il menu nella sidebar per aprire una finestra.',
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

/* --- sidebar demo (arranged around <Plancia> by <PlanciaLayout>) ----------- */
const sbPosition = ref<SidebarPosition>('left')
const sbMode = ref<SidebarMode>('inline')
const sbState = ref<SidebarState>('expanded')
const sbResizable = ref(true)

const sidebarLabels: Partial<SidebarLabels> = {
  expand: 'Espandi',
  collapse: 'Comprimi',
  close: 'Chiudi',
  open: 'Apri menu',
  resize: 'Ridimensiona',
  sidebar: 'Menu',
}

const menu = [
  { icon: '📝', label: 'Nuova nota', run: openNote },
  { icon: '🕸️', label: 'Grafico', run: openGraph },
  { icon: '⚙️', label: 'Impostazioni', run: openSettings },
]
const links = Array.from({ length: 20 }, (_, i) => `Collegamento ${i + 1}`)
</script>

<template>
  <div class="app">
    <header class="toolbar">
      <strong>plancia · playground</strong>
      <button type="button" @click="openNote">+ Nota</button>
      <button type="button" @click="openGraph">+ Grafico</button>
      <button type="button" @click="openSettings">+ Impostazioni</button>
      <span class="spacer" />
      <label class="ctl">
        pos
        <select v-model="sbPosition">
          <option value="left">left</option>
          <option value="right">right</option>
          <option value="top">top</option>
          <option value="bottom">bottom</option>
        </select>
      </label>
      <label class="ctl">
        mode
        <select v-model="sbMode">
          <option value="inline">inline</option>
          <option value="overlay">overlay</option>
          <option value="floating">floating</option>
        </select>
      </label>
      <button type="button" @click="sbState = 'expanded'">expand</button>
      <button type="button" @click="sbState = 'collapsed'">collapse</button>
      <button type="button" @click="sbState = 'closed'">close</button>
      <label class="ctl"><input v-model="sbResizable" type="checkbox" /> resize</label>
    </header>

    <main class="stage">
      <PlanciaLayout>
        <template #[sbPosition]>
          <PlanciaSidebar
            v-model:state="sbState"
            :position="sbPosition"
            :mode="sbMode"
            :resizable="sbResizable"
            :labels="sidebarLabels"
            :default-size="240"
            :responsive="640"
            landmark="navigation"
          >
            <template #header="{ contentVisible }">
              <strong v-if="contentVisible" class="sb-title">Menu</strong>
            </template>
            <template #default="{ contentVisible, orientation }">
              <nav class="sb-menu" :class="orientation === 'horizontal' ? 'sb-menu--row' : ''">
                <button
                  v-for="m in menu"
                  :key="m.label"
                  type="button"
                  class="sb-item"
                  @click="m.run"
                >
                  <span class="sb-ico">{{ m.icon }}</span>
                  <span v-if="contentVisible" class="sb-label">{{ m.label }}</span>
                </button>
                <hr v-if="contentVisible && orientation === 'vertical'" class="sb-sep" />
                <button v-for="l in links" :key="l" type="button" class="sb-item">
                  <span class="sb-ico">•</span>
                  <span v-if="contentVisible" class="sb-label">{{ l }}</span>
                </button>
              </nav>
            </template>
          </PlanciaSidebar>
        </template>

        <Plancia
          :registry="registry"
          native-type="note"
          :labels="labels"
          :width-cycle="widthCycle"
          :resolve-tone="resolveTone"
        />
      </PlanciaLayout>
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
  flex-wrap: wrap;
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
.toolbar .ctl {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.8rem;
  color: #475569;
}

.stage {
  flex: 1;
  min-height: 0;
  background: #f1f5f9;
}

/* demo sidebar content */
.sb-title {
  font-size: 0.8rem;
  color: #475569;
}
.sb-menu {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding: 0.25rem;
}
.sb-menu--row {
  flex-direction: row;
  align-items: center;
}
.sb-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.375rem 0.5rem;
  border: 0;
  border-radius: 0.375rem;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
}
.sb-menu--row .sb-item {
  width: auto;
}
.sb-item:hover {
  background: rgba(0, 0, 0, 0.06);
}
.sb-ico {
  flex: 0 0 auto;
  width: 1.25rem;
  text-align: center;
}
.sb-sep {
  border: 0;
  border-top: 1px solid #e2e8f0;
  margin: 0.25rem 0;
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
