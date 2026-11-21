<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CalendarView, parseCalendar, type CalendarRange, type CalendarViewName, type Weekday } from '../src'
import { demoLoad } from './expand'
import { italian } from './italian'

// The examples of test/fixtures, and a demo of the calendar a team keeps.
const files = import.meta.glob('../test/fixtures/valid/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const demo = `calendar: 1
title: Redazione
timezone: Europe/Rome
events:
  - title: Lezione di fotografia
    id: lezione
    date: 2026-11-24
    time: 18:00-19:30
    repeat: {every: week, on: [tue, fri], until: 2027-06-30}
    skip: [2026-12-08]
    pause:
      - {from: 2026-12-22, to: 2027-01-06}
    changes:
      - {date: 2026-11-27, time: 19:00-20:30}
    place: Aula 3
    note: "[[corsi/fotografia]]"
  - title: Riunione di redazione
    date: 2026-11-23
    time: 10:00-11:00
    repeat: {every: 2 weeks, on: [mon]}
  - title: Turno in libreria
    date: 2026-11-02
    time: 15:00-19:00
    repeat: {every: week, on: [mon, wed], cycle: {on: 3, off: 1}}
  - title: Mercatino
    from: 2026-11-28
    to: 2026-11-29
    place: Piazza
  - title: Consegna del catalogo
    date: 2026-11-27
  - title: Notte bianca
    from: 2026-11-21 22:00
    to: 2026-11-22 03:00
`
const samples: Record<string, string> = { demo }
for (const [path, src] of Object.entries(files)) samples[path.split('/').pop()!.replace('.yaml', '')] = src

const sample = ref('demo')
const source = ref(demo)
watch(sample, (s) => {
  source.value = samples[s] ?? ''
})

// No view at first: the calendar picks one, the list on a phone.
const view = ref<CalendarViewName | undefined>(undefined)
const date = ref('2026-11-23')
const dark = ref(false)
const lang = ref<'en' | 'it'>('en')
const firstDay = ref<Weekday>('mon')
const readonly = ref(false)
const links = ref<string[]>([])

const parsed = computed(() => parseCalendar(source.value).calendar)
async function load(range: CalendarRange) {
  // As slow as a server, a little.
  await new Promise((r) => setTimeout(r, 60))
  return demoLoad(parsed.value, range)
}
</script>

<template>
  <div class="page" :class="{ dark }">
    <header class="tools">
      <label>Example <select v-model="sample"><option v-for="(_, k) in samples" :key="k" :value="k">{{ k }}</option></select></label>
      <label>Language <select v-model="lang"><option value="en">English</option><option value="it">Italiano</option></select></label>
      <label>Week from <select v-model="firstDay"><option value="mon">Monday</option><option value="sun">Sunday</option></select></label>
      <label><input v-model="dark" type="checkbox" /> Dark</label>
      <label><input v-model="readonly" type="checkbox" /> Read only</label>
      <span class="state">view={{ view ?? '(its own)' }} date={{ date }}</span>
    </header>
    <main class="main">
      <CalendarView
        v-model="source"
        v-model:view="view"
        v-model:date="date"
        class="cal"
        :load="load"
        :readonly="readonly"
        :locale="lang"
        :labels="lang === 'it' ? italian : {}"
        :first-day="firstDay"
        timezone="Europe/Rome"
        @link="(l) => links.unshift(l.target)"
      />
      <aside class="side">
        <h2>YAML</h2>
        <textarea v-model="source" spellcheck="false" aria-label="YAML" />
        <p v-if="links.length">Links asked: {{ links.slice(0, 3).join(', ') }}</p>
      </aside>
    </main>
  </div>
</template>

<style>
body {
  margin: 0;
  font-family: system-ui, sans-serif;
}
.page {
  --plancia-surface: #ffffff;
  --plancia-text: #1f2328;
  --plancia-text-muted: #59636e;
  --plancia-border: #d0d7de;
  --plancia-accent: #2563eb;
  min-height: 100vh;
  padding: 12px 16px;
  background: var(--plancia-surface);
  color: var(--plancia-text);
}
.page.dark {
  --plancia-surface: #0d1117;
  --plancia-text: #e6edf3;
  --plancia-text-muted: #9198a1;
  --plancia-border: #30363d;
  --plancia-accent: #4493f8;
  color-scheme: dark;
}
.tools {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
  font-size: 13px;
}
.state {
  color: var(--plancia-text-muted);
  font-family: ui-monospace, monospace;
}
.main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 16px;
}
@media (max-width: 900px) {
  .main {
    grid-template-columns: minmax(0, 1fr);
  }
}
.cal {
  min-height: 620px;
}
.side textarea {
  width: 100%;
  min-height: 540px;
  font: 12px/1.4 ui-monospace, monospace;
  background: var(--plancia-surface);
  color: var(--plancia-text);
  border: 1px solid var(--plancia-border);
}
.side h2 {
  margin: 0 0 6px;
  font-size: 14px;
}
</style>
