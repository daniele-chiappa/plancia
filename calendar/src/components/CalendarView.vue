<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { addDays, daysBetween, today as todayIn, type CalendarDate, type Weekday } from '../model/dates'
import { emptyCalendar, parseCalendar } from '../model/parse'
import { writeCalendar } from '../model/write'
import { calendarText } from '../model/text'
import { comparePlaced, placeTime, type Placed } from '../model/times'
import type { Calendar, CalendarEvent, CalendarLoad, CalendarProblem, CalendarRange } from '../model/types'
import {
  addEvent,
  applyEdit,
  deleteScopes,
  deleteTime,
  eventAt,
  newEvent,
  scopesFor,
  type EditScope,
  type OccurrenceRef,
} from '../edit/edit'
import { CALENDAR_VIEWS, stepDate, viewRange, type CalendarViewName } from '../layout'
import { DEFAULT_CALENDAR_LABELS, type CalendarLabels } from '../labels'
import { longDate, monthTitle, rangeTitle } from '../format'
import MonthView from './MonthView.vue'
import TimeGrid from './TimeGrid.vue'
import ListView from './ListView.vue'
import EventForm from './EventForm.vue'
import ScopeDialog from './ScopeDialog.vue'

const props = withDefaults(
  defineProps<{
    /** The calendar's YAML. */
    modelValue: string
    /** Gives the times of the days shown: the host computes the rules. */
    load: (range: CalendarRange) => Promise<CalendarLoad> | CalendarLoad
    view?: CalendarViewName
    /** A day the view shows, YYYY-MM-DD. */
    date?: CalendarDate
    readonly?: boolean
    labels?: Partial<CalendarLabels>
    locale?: string
    firstDay?: Weekday
    hour12?: boolean
    /** The zone of a calendar without its own, for its text; the browser's by default. */
    timezone?: string
    /** Today, YYYY-MM-DD; by default the day in the calendar's zone. */
    today?: CalendarDate
    /** Below this width the view to start with is the list. */
    compactWidth?: number
    /** The hour the week and day views scroll to. */
    scrollHour?: number
    /** The times a day of the month shows before a "+N". */
    maxPerDay?: number
  }>(),
  {
    view: undefined,
    date: undefined,
    readonly: false,
    labels: () => ({}),
    locale: 'en',
    firstDay: 'mon',
    hour12: false,
    timezone: undefined,
    today: undefined,
    compactWidth: 600,
    scrollHour: 8,
    maxPerDay: 3,
  },
)

const emit = defineEmits<{
  'update:modelValue': [yaml: string]
  'update:view': [view: CalendarViewName]
  'update:date': [date: CalendarDate]
  /** The note or address of an event, to open. */
  link: [payload: { target: string }]
}>()

const words = computed<CalendarLabels>(() => ({ ...DEFAULT_CALENDAR_LABELS, ...props.labels }))
const hostZone = computed(() => props.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC')

const parsed = computed(() => parseCalendar(props.modelValue))
const calendar = computed<Calendar | null>(() => parsed.value.calendar)
const editable = computed(() => !props.readonly && calendar.value !== null)
const zone = computed(() => calendar.value?.timezone ?? hostZone.value)
const todayDate = computed(() => props.today ?? todayIn(zone.value))

// The view and the day: the props when the host gives them, else our own.
const root = ref<HTMLElement | null>(null)
const narrow = ref(false)
const ownView = ref<CalendarViewName | null>(null)
const ownDate = ref<CalendarDate | null>(null)
const view = computed<CalendarViewName>(() => props.view ?? ownView.value ?? (narrow.value ? 'list' : 'month'))
const anchor = computed<CalendarDate>(() => props.date ?? ownDate.value ?? todayDate.value)
const range = computed(() => viewRange(view.value, anchor.value, props.firstDay))

function setView(v: CalendarViewName) {
  ownView.value = v
  emit('update:view', v)
}
function setDate(d: CalendarDate) {
  ownDate.value = d
  emit('update:date', d)
}

let observer: ResizeObserver | null = null
onMounted(() => {
  // The width first, so a phone asks for the list's days, not the month's.
  if (root.value && root.value.clientWidth > 0) narrow.value = root.value.clientWidth < props.compactWidth
  void reload()
  if (typeof ResizeObserver === 'undefined' || !root.value) return
  observer = new ResizeObserver(([entry]) => {
    if (entry && entry.contentRect.width > 0) narrow.value = entry.contentRect.width < props.compactWidth
  })
  observer.observe(root.value)
})
onBeforeUnmount(() => observer?.disconnect())

// The times, from the host, for the days shown and the YAML as it is.
const loaded = shallowRef<CalendarLoad | null>(null)
const loading = ref(false)
const failure = ref('')
let asked = 0
let lastAsked = ''
let timer: ReturnType<typeof setTimeout> | undefined

/** Asks the host for the times again; force asks even for the same days and YAML. */
async function reload(force = false) {
  const key = `${range.value.from}..${range.value.to}\n${props.modelValue}`
  if (!force && key === lastAsked) return
  lastAsked = key
  const n = ++asked
  loading.value = true
  try {
    const res = await props.load({ ...range.value })
    if (n !== asked) return
    loaded.value = res
    failure.value = ''
  } catch (err) {
    if (n !== asked) return
    failure.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (n === asked) loading.value = false
  }
}

watch(range, () => reload(), { deep: true })
watch(
  () => props.modelValue,
  () => {
    clearTimeout(timer)
    timer = setTimeout(() => reload(), 150)
  },
)
onBeforeUnmount(() => clearTimeout(timer))

const placed = computed<Placed[]>(() =>
  (loaded.value?.times ?? [])
    .map(placeTime)
    .filter((p): p is Placed => p !== null)
    .sort(comparePlaced),
)

const problems = computed<CalendarProblem[]>(() => {
  const seen = new Set<string>()
  const out: CalendarProblem[] = []
  for (const p of [...parsed.value.problems, ...(loaded.value?.problems ?? [])]) {
    const key = `${p.line ?? 0}:${p.message}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ line: p.line ?? 0, message: p.message })
  }
  return out.sort((a, b) => a.line - b.line)
})

const heading = computed(() => {
  switch (view.value) {
    case 'month':
    case 'list':
      return monthTitle(anchor.value, props.locale)
    case 'week':
      return rangeTitle(range.value.from, range.value.to, props.locale)
    case 'day':
      return longDate(anchor.value, props.locale)
  }
  return ''
})

const altText = computed(() => calendarText(calendar.value, hostZone.value))

// The form and the choice of the times a change is for.
interface FormState {
  ref: OccurrenceRef | null
  draft: CalendarEvent
}
const form = ref<FormState | null>(null)
interface ScopeState {
  action: 'save' | 'delete' | 'move'
  allowed: Record<EditScope, boolean>
  run: (scope: EditScope) => void
}
const scope = ref<ScopeState | null>(null)
let returnFocus: HTMLElement | null = null

function remember() {
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
}
function restoreFocus() {
  const el = returnFocus
  returnFocus = null
  if (el && el.isConnected) el.focus()
}

function save(next: Calendar) {
  emit('update:modelValue', writeCalendar(next))
}

function create(day: CalendarDate, minute?: number) {
  if (!editable.value) return
  remember()
  form.value = { ref: null, draft: newEvent(day, minute) }
}

function refOf(p: Placed): OccurrenceRef {
  return { event: p.time.event, date: p.original }
}

function open(p: Placed) {
  const c = calendar.value
  if (!c || !c.events[p.time.event]) return
  remember()
  form.value = { ref: refOf(p), draft: eventAt(c, refOf(p)) }
}

function closeForm() {
  form.value = null
  restoreFocus()
}

/** One scope: runs it; more: asks. */
function choose(action: ScopeState['action'], allowed: Record<EditScope, boolean>, run: (s: EditScope) => void) {
  const can = (Object.keys(allowed) as EditScope[]).filter((k) => allowed[k])
  if (can.length === 1) return run(can[0]!)
  if (can.length === 0) return
  scope.value = { action, allowed, run }
}

function onScope(s: EditScope | null) {
  const st = scope.value
  scope.value = null
  if (s && st) st.run(s)
  else if (!form.value) restoreFocus()
}

function submit(draft: CalendarEvent) {
  const c = calendar.value ?? emptyCalendar()
  const st = form.value
  if (!st) return
  if (!st.ref) {
    save(addEvent(c, draft).calendar)
    closeForm()
    return
  }
  const r = st.ref
  choose('save', scopesFor(c, r, draft), (s) => {
    save(applyEdit(c, r, draft, s))
    closeForm()
  })
}

function remove() {
  const c = calendar.value
  const st = form.value
  if (!c || !st?.ref) return
  const r = st.ref
  choose('delete', deleteScopes(c, r), (s) => {
    save(deleteTime(c, r, s))
    closeForm()
  })
}

/** A time dragged to another day, or another hour: its length kept. */
function move(p: Placed, day: CalendarDate, minute?: number) {
  const c = calendar.value
  if (!editable.value || !c || !c.events[p.time.event]) return
  const r = refOf(p)
  const draft = eventAt(c, r)
  const days = daysBetween(draft.start, day)
  if (days === 0 && (minute === undefined || draft.allDay || minute === draft.from)) return
  const length = daysBetween(draft.start, draft.end)
  draft.start = day
  draft.end = addDays(day, length)
  if (minute !== undefined && !draft.allDay) {
    const duration = draft.hasEnd ? length * 1440 + draft.to - draft.from : 0
    const end = minute + duration
    draft.from = minute
    draft.to = draft.hasEnd ? end % 1440 : minute
    draft.end = addDays(day, Math.floor(end / 1440))
  }
  remember()
  choose('move', scopesFor(c, r, draft), (s) => {
    save(applyEdit(c, r, draft, s))
    restoreFocus()
  })
}

function link(target: string) {
  emit('link', { target })
}

function goToday() {
  setDate(todayDate.value)
}

function step(n: number) {
  setDate(stepDate(view.value, anchor.value, n))
}

function showDay(d: CalendarDate) {
  setDate(d)
  setView('day')
}

defineExpose({ reload: () => reload(true), create })
</script>

<template>
  <section
    ref="root"
    class="plancia-calendar"
    :class="{ 'plancia-calendar--narrow': narrow }"
    :data-view="view"
  >
    <header class="plancia-calendar__bar">
      <div class="plancia-calendar__nav">
        <button type="button" class="plancia-calendar__button" :aria-label="words.previous" :title="words.previous" @click="step(-1)">
          ‹
        </button>
        <button type="button" class="plancia-calendar__button" @click="goToday">{{ words.today }}</button>
        <button type="button" class="plancia-calendar__button" :aria-label="words.next" :title="words.next" @click="step(1)">
          ›
        </button>
      </div>
      <h2 class="plancia-calendar__title" aria-live="polite">{{ heading }}</h2>
      <div class="plancia-calendar__views" role="group" :aria-label="words.viewsName">
        <button
          v-for="v in CALENDAR_VIEWS"
          :key="v"
          type="button"
          class="plancia-calendar__button"
          :aria-pressed="view === v"
          @click="setView(v)"
        >
          {{ words.views[v] }}
        </button>
      </div>
      <button
        v-if="editable"
        type="button"
        class="plancia-calendar__button plancia-calendar__button--primary"
        @click="create(anchor)"
      >
        {{ words.newEvent }}
      </button>
      <span v-else-if="readonly" class="plancia-calendar__badge">{{ words.readOnly }}</span>
    </header>

    <p class="plancia-calendar__alt">{{ altText }}</p>

    <div v-if="problems.length" class="plancia-calendar__problems" role="status">
      <p>{{ words.problems }}</p>
      <ul>
        <li v-for="(p, i) in problems" :key="i">
          <template v-if="p.line">{{ words.line }} {{ p.line }}: </template>{{ p.message }}
        </li>
      </ul>
    </div>
    <p v-if="failure" class="plancia-calendar__problems" role="alert">{{ words.failed }} {{ failure }}</p>
    <p v-if="loaded?.truncated" class="plancia-calendar__note">{{ words.truncated }}</p>

    <div class="plancia-calendar__body" :aria-busy="loading">
      <MonthView
        v-if="view === 'month'"
        :range="range"
        :anchor="anchor"
        :items="placed"
        :today="todayDate"
        :labels="words"
        :locale="locale"
        :first-day="firstDay"
        :hour12="hour12"
        :editable="editable"
        :max-per-day="maxPerDay"
        @create="create"
        @open="open"
        @more="showDay"
        @move="(p, d) => move(p, d)"
        @focus-day="setDate"
      />
      <TimeGrid
        v-else-if="view === 'week' || view === 'day'"
        :range="range"
        :anchor="anchor"
        :items="placed"
        :today="todayDate"
        :labels="words"
        :locale="locale"
        :hour12="hour12"
        :editable="editable"
        :scroll-hour="scrollHour"
        @create="create"
        @open="open"
        @move="move"
        @focus-day="setDate"
      />
      <ListView
        v-else
        :range="range"
        :items="placed"
        :today="todayDate"
        :labels="words"
        :locale="locale"
        :hour12="hour12"
        @open="open"
        @link="link"
      />
    </div>

    <EventForm
      v-if="form"
      :draft="form.draft"
      :existing="form.ref !== null"
      :repeats="form.ref !== null && !!calendar?.events[form.ref.event]?.repeat"
      :labels="words"
      :locale="locale"
      @save="submit"
      @delete="remove"
      @cancel="closeForm"
      @link="link"
    />
    <ScopeDialog
      v-if="scope"
      :action="scope.action"
      :allowed="scope.allowed"
      :labels="words"
      @choose="onScope"
    />
  </section>
</template>
