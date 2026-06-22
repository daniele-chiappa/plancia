<script setup lang="ts">
/**
 * plancia configurator (dev tool, NOT shipped). Edits a PlanciaConfig with live
 * preview: appearance knobs are auto-derived from style.css (parseThemeManifest
 * via /api/manifest); behavior knobs come from behaviorManifest. Presets are
 * read/written under plancia.config/ through the Vite-middleware API.
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { PlanciaConfigProvider, PlanciaSidebar } from '../../src/index'
import type { ThemeKnob } from '../../src/config/manifest'
import type { BehaviorKnob } from './behaviorManifest'

type Cfg = {
  meta: { name: string }
  theme: Record<string, string>
  components: Record<string, { defaults: Record<string, unknown> }>
}
const empty = (): Cfg => ({
  meta: { name: 'draft' },
  theme: {},
  components: { window: { defaults: {} }, sidebar: { defaults: {} }, dialog: { defaults: {} } },
})

const themeKnobs = ref<ThemeKnob[]>([])
const behaviorKnobs = ref<BehaviorKnob[]>([])
const presets = ref<string[]>([])
const draft = reactive<Cfg>(empty())
const selected = ref('')
const saveName = ref('my-theme')
const status = ref('')

const themeGroups = computed(() => {
  const groups: Record<string, ThemeKnob[]> = {}
  for (const k of themeKnobs.value) {
    if (k.derived) continue // derived tokens follow the core — not editable
    ;(groups[k.group] ??= []).push(k)
  }
  return groups
})
const behaviorByFamily = computed(() => {
  const groups: Record<string, BehaviorKnob[]> = {}
  for (const k of behaviorKnobs.value) (groups[k.family] ??= []).push(k)
  return groups
})

// Remount the preview only when BEHAVIOR changes (init-time defaults like
// defaultState); theme changes flow through CSS vars without a remount.
const behaviorKey = computed(() => JSON.stringify(draft.components))

const exportJson = computed(() => JSON.stringify(clean(), null, 2))

function clean(): Cfg {
  const out: Cfg = { meta: { ...draft.meta }, theme: { ...draft.theme }, components: {} }
  if (!Object.keys(out.theme).length) delete (out as Partial<Cfg>).theme
  for (const [fam, v] of Object.entries(draft.components)) {
    if (Object.keys(v.defaults).length) out.components[fam] = { defaults: { ...v.defaults } }
  }
  if (!Object.keys(out.components).length) delete (out as Partial<Cfg>).components
  return out
}

function setTheme(name: string, value: string) {
  if (value) draft.theme[name] = value
  else delete draft.theme[name]
}
function setBehavior(fam: string, key: string, value: unknown) {
  draft.components[fam]!.defaults[key] = value
}
function hex(v: string | undefined): string {
  return v && /^#[0-9a-f]{6}$/i.test(v) ? v : '#888888'
}

async function refresh() {
  const m = await (await fetch('/api/manifest')).json()
  themeKnobs.value = m.theme
  behaviorKnobs.value = m.behavior
  presets.value = await (await fetch('/api/presets')).json()
}
async function load() {
  if (!selected.value) return
  const cfg = await (await fetch(`/api/presets/${selected.value}`)).json()
  Object.assign(draft, empty(), cfg, {
    components: { ...empty().components, ...(cfg.components ?? {}) },
  })
  status.value = `loaded "${selected.value}"`
}
async function saveAs() {
  await fetch(`/api/presets/${saveName.value}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...clean(), meta: { name: saveName.value } }),
  })
  presets.value = await (await fetch('/api/presets')).json()
  status.value = `saved preset "${saveName.value}"`
}
async function setCurrent() {
  await fetch('/api/current', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(clean()),
  })
  status.value = 'set as current.json'
}
async function copyJson() {
  await navigator.clipboard?.writeText(exportJson.value)
  status.value = 'JSON copied'
}

onMounted(refresh)
</script>

<template>
  <div class="cfg">
    <aside class="cfg-panel">
      <h1>plancia · configurator</h1>

      <section class="cfg-presets">
        <select v-model="selected">
          <option value="" disabled>— preset —</option>
          <option v-for="p in presets" :key="p" :value="p">{{ p }}</option>
        </select>
        <button @click="load">Load</button>
        <span class="cfg-status">{{ status }}</span>
      </section>

      <h2>Appearance <small>(auto-derived from style.css)</small></h2>
      <div v-for="(knobs, group) in themeGroups" :key="group" class="cfg-group">
        <h3>{{ group }}</h3>
        <label v-for="k in knobs" :key="k.name" class="cfg-knob">
          <span class="cfg-knob-name">{{ k.name.replace('--plancia-', '') }}</span>
          <input
            v-if="k.type === 'color'"
            type="color"
            :value="hex(draft.theme[k.name] ?? k.default)"
            @input="setTheme(k.name, ($event.target as HTMLInputElement).value)"
          />
          <input
            type="text"
            :value="draft.theme[k.name] ?? ''"
            :placeholder="k.default"
            @input="setTheme(k.name, ($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>

      <h2>Behavior</h2>
      <div v-for="(knobs, fam) in behaviorByFamily" :key="fam" class="cfg-group">
        <h3>{{ fam }}</h3>
        <label v-for="k in knobs" :key="k.key" class="cfg-knob">
          <span class="cfg-knob-name">{{ k.label }}</span>
          <select
            v-if="k.type === 'select'"
            :value="draft.components[fam]?.defaults[k.key] ?? k.default"
            @change="setBehavior(fam, k.key, ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="o in k.options" :key="o" :value="o">{{ o }}</option>
          </select>
          <input
            v-else-if="k.type === 'boolean'"
            type="checkbox"
            :checked="Boolean(draft.components[fam]?.defaults[k.key] ?? k.default)"
            @change="setBehavior(fam, k.key, ($event.target as HTMLInputElement).checked)"
          />
          <input
            v-else
            type="number"
            :value="Number(draft.components[fam]?.defaults[k.key] ?? k.default)"
            @input="setBehavior(fam, k.key, Number(($event.target as HTMLInputElement).value))"
          />
        </label>
      </div>

      <section class="cfg-actions">
        <input v-model="saveName" placeholder="preset name" />
        <button @click="saveAs">Save preset</button>
        <button @click="setCurrent">Set as current</button>
        <button @click="copyJson">Copy JSON</button>
      </section>

      <details class="cfg-export">
        <summary>config JSON</summary>
        <pre>{{ exportJson }}</pre>
      </details>
    </aside>

    <main class="cfg-stage-wrap">
      <PlanciaConfigProvider :config="draft" :global="false" class="cfg-preview">
        <div :key="behaviorKey" class="cfg-preview-inner">
          <PlanciaSidebar position="left" :default-size="200">
            <template #header="{ contentVisible }">
              <strong v-if="contentVisible" style="font-size: 0.8rem">Menu</strong>
            </template>
            <nav style="display: flex; flex-direction: column; gap: 0.125rem; padding: 0.25rem">
              <button v-for="i in 12" :key="i" class="plancia-btn-text" style="border: 0; justify-content: flex-start">
                Item {{ i }}
              </button>
            </nav>
          </PlanciaSidebar>

          <div class="cfg-stage">
            <section class="plancia-window plancia-window--focused" style="height: 220px; width: 300px">
              <header class="plancia-window__header">
                <div class="plancia-window__titlerow">
                  <span class="plancia-window__title">Window</span>
                  <span class="plancia-window__dirty">•</span>
                </div>
                <div class="plancia-window__tags">
                  <span class="plancia-tag">tag</span>
                </div>
              </header>
              <div class="plancia-window__body" style="padding: 0.75rem; font-size: 0.875rem">
                Preview body — surface, text, border and accent come from the config.
              </div>
            </section>
            <div class="cfg-buttons">
              <button class="plancia-btn-text">Ghost</button>
              <button class="plancia-btn-text plancia-btn-primary">Primary</button>
              <button class="plancia-btn-text plancia-btn-danger">Danger</button>
            </div>
          </div>
        </div>
      </PlanciaConfigProvider>
    </main>
  </div>
</template>

<style>
body { margin: 0; }
.cfg {
  display: grid;
  grid-template-columns: 340px 1fr;
  height: 100vh;
  font-family: system-ui, sans-serif;
  color: #0f172a;
}
.cfg-panel {
  overflow-y: auto;
  padding: 0.75rem 1rem;
  border-right: 1px solid #e2e8f0;
  background: #f8fafc;
}
.cfg-panel h1 { font-size: 1rem; margin: 0 0 0.75rem; }
.cfg-panel h2 { font-size: 0.85rem; margin: 1rem 0 0.25rem; text-transform: uppercase; letter-spacing: 0.04em; color: #475569; }
.cfg-panel h2 small { text-transform: none; letter-spacing: 0; color: #94a3b8; font-weight: 400; }
.cfg-panel h3 { font-size: 0.72rem; margin: 0.5rem 0 0.25rem; color: #64748b; text-transform: uppercase; }
.cfg-knob { display: flex; align-items: center; gap: 0.4rem; padding: 0.15rem 0; font-size: 0.8rem; }
.cfg-knob-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cfg-knob input[type='text'], .cfg-knob input[type='number'], .cfg-knob select { width: 8rem; font: inherit; font-size: 0.78rem; padding: 0.15rem 0.3rem; border: 1px solid #cbd5e1; border-radius: 0.25rem; }
.cfg-knob input[type='color'] { width: 1.6rem; height: 1.6rem; padding: 0; border: 1px solid #cbd5e1; border-radius: 0.25rem; }
.cfg-presets, .cfg-actions { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; margin: 0.5rem 0; }
.cfg-presets select, .cfg-actions input { font: inherit; font-size: 0.8rem; padding: 0.2rem 0.4rem; border: 1px solid #cbd5e1; border-radius: 0.25rem; }
.cfg-panel button { cursor: pointer; font: inherit; font-size: 0.8rem; padding: 0.25rem 0.55rem; border: 1px solid #cbd5e1; border-radius: 0.375rem; background: #fff; }
.cfg-panel button:hover { background: #f1f5f9; }
.cfg-status { font-size: 0.72rem; color: #16a34a; }
.cfg-export { margin-top: 0.75rem; font-size: 0.75rem; }
.cfg-export pre { max-height: 12rem; overflow: auto; background: #0f172a; color: #e2e8f0; padding: 0.5rem; border-radius: 0.375rem; }

.cfg-stage-wrap { padding: 1.5rem; background: #f1f5f9; overflow: auto; }
.cfg-preview { display: block; height: 100%; }
.cfg-preview-inner { position: relative; display: flex; height: 420px; border: 1px solid var(--plancia-border); border-radius: 0.5rem; overflow: hidden; background: var(--plancia-surface); }
.cfg-stage { flex: 1; display: flex; flex-wrap: wrap; gap: 1rem; align-content: flex-start; padding: 1rem; }
.cfg-buttons { display: flex; gap: 0.5rem; align-items: flex-start; }
</style>
