<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { DiagramEditor, DiagramView, type DiagramLinkEvent } from '../src'

// Every valid example, then an editor: what an agent writes, as the page
// draws it. The theme switch sets plancia's core variables, as a consumer
// with plancia does.
const files = import.meta.glob('../test/fixtures/valid/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const examples = Object.entries(files).map(([path, src]) => ({ name: path.split('/').pop()!, src }))

const dark = ref(new URLSearchParams(location.search).get('theme') === 'dark')
const only = new URLSearchParams(location.search).get('only')
const shown = computed(() => (only ? examples.filter((e) => e.name.includes(only)) : examples))
const source = ref(examples.find((e) => e.name.startsWith('flow-full'))?.src ?? '')
const last = ref('')
const exported = ref('')
const editor = ref<InstanceType<typeof DiagramView> | null>(null)
// ?edit=<example>: the editor on one example, its YAML shown as it changes.
const editName = new URLSearchParams(location.search).get('edit')
const edited = ref(examples.find((e) => editName && e.name.includes(editName))?.src ?? '')
const notes = ['team/frontend', 'team/backend', 'team/pipelines/arrivals', 'gosidian/hot']
async function linkSuggest(q: string) {
  return notes.filter((n) => n.includes(q)).map((n) => ({ label: n, link: `[[${n}]]` }))
}

watchEffect(() => {
  const s = document.documentElement.style
  const theme = dark.value
    ? { surface: '#0d1117', text: '#e6edf3', 'text-muted': '#9198a1', border: '#3d444d', accent: '#4493f8', bg: '#010409' }
    : { surface: '#ffffff', text: '#0f172a', 'text-muted': '#64748b', border: '#e2e8f0', accent: '#3b82f6', bg: '#f8fafc' }
  for (const [k, v] of Object.entries(theme)) s.setProperty(`--plancia-${k}`, v)
  document.documentElement.dataset.theme = dark.value ? 'dark' : 'light'
})

function onLink(l: DiagramLinkEvent) {
  last.value = `${l.kind}: ${l.target} (${l.label})`
}
function exportSvg() {
  const svg = editor.value?.exportSVG()
  exported.value = svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : ''
}
</script>

<template>
  <main class="pg">
    <header>
      <h1>plancia-diagrams</h1>
      <label><input v-model="dark" type="checkbox" data-theme-toggle /> dark</label>
      <span v-if="last" class="pg-last" data-last-link>{{ last }}</span>
    </header>
    <section v-if="editName" class="pg-editor" data-edit>
      <h2>Editor: {{ editName }}</h2>
      <DiagramEditor v-model:source="edited" :link-suggest="linkSuggest" :height="440" />
      <pre class="pg-source" data-source>{{ edited }}</pre>
    </section>
    <section v-for="e in editName ? [] : shown" :key="e.name" class="pg-example" :data-example="e.name">
      <h2>{{ e.name }}</h2>
      <DiagramView :source="e.src" @link="onLink" />
    </section>
    <section class="pg-editor" v-if="!only && !editName">
      <h2>Editor</h2>
      <textarea v-model="source" rows="16" spellcheck="false" data-editor />
      <DiagramView ref="editor" :source="source" @link="onLink" />
      <button type="button" data-export @click="exportSvg">Export SVG</button>
      <img v-if="exported" :src="exported" alt="The exported SVG" class="pg-export" data-exported />
    </section>
  </main>
</template>

<style>
html {
  background: var(--plancia-bg);
  color: var(--plancia-text);
  font-family: system-ui, sans-serif;
}
.pg {
  max-width: 900px;
  margin: 0 auto;
  padding: 1rem;
}
.pg header {
  display: flex;
  gap: 1rem;
  align-items: center;
}
.pg h2 {
  font-size: 0.9rem;
  color: var(--plancia-text-muted);
}
.pg-example,
.pg-editor {
  margin-bottom: 2rem;
}
.pg textarea {
  width: 100%;
  font-family: ui-monospace, monospace;
  background: var(--plancia-surface);
  color: var(--plancia-text);
  border: 1px solid var(--plancia-border);
}
.pg-export {
  display: block;
  margin-top: 0.5rem;
  max-width: 100%;
  border: 1px dashed var(--plancia-border);
}
.pg-source {
  font-size: 12px;
  padding: 0.5rem;
  border: 1px dashed var(--plancia-border);
  white-space: pre-wrap;
}
.pg-last {
  font-size: 0.8rem;
  color: var(--plancia-accent);
}
</style>
