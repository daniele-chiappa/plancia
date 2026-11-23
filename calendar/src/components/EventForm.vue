<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, useId, watch } from 'vue'
import { monthEnd, WEEKDAYS, weekdayOf, type Weekday } from '../model/dates'
import { isLink } from '../model/parse'
import { DEFAULT_REMIND_AT, leadsOf } from '../model/remind'
import { UNITS, type CalendarEvent } from '../model/types'
import { eventOf, fieldsOf, inLastWeek, nthOf, type EventFields, type FieldError } from '../edit/form'
import { nthText, weekdayName } from '../format'
import type { CalendarLabels } from '../labels'

const props = defineProps<{
  draft: CalendarEvent
  /** An event of the calendar, not a new one: it may be deleted. */
  existing: boolean
  /** One time of a repeated event: its days and hours are that time's. */
  repeats: boolean
  labels: CalendarLabels
  locale: string
  /** The calendar's reminders, which an event without its own takes, and the hour of an all-day one's. */
  calendarRemind?: string[]
  remindAt?: string
}>()

const emit = defineEmits<{
  save: [event: CalendarEvent]
  delete: []
  cancel: []
  link: [target: string]
}>()

const f = reactive<EventFields>(fieldsOf(props.draft))
const errors = ref<Partial<Record<keyof EventFields, FieldError>>>({})
const box = ref<HTMLElement | null>(null)
const uid = `plancia-calendar-form-${useId()}`
const fid = (name: string) => `${uid}-${name}`

watch(
  () => f.startDate,
  (d, old) => {
    // The end follows the start, by as many days as it was after it.
    if (!old || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{4}-\d{2}-\d{2}$/.test(old) || !f.endDate) return
    const days = (Date.parse(f.endDate) - Date.parse(old)) / 86_400_000
    if (Number.isFinite(days) && days >= 0) {
      const end = new Date(Date.parse(d) + days * 86_400_000)
      f.endDate = end.toISOString().slice(0, 10)
    }
  },
)

const startDay = computed<Weekday | null>(() => (/^\d{4}-\d{2}-\d{2}$/.test(f.startDate) ? weekdayOf(f.startDate) : null))
const monthChoices = computed(() => {
  const d = f.startDate
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return []
  const wd = weekdayName(weekdayOf(d), props.locale)
  const out: { value: EventFields['monthMode']; label: string }[] = [
    { value: 'day', label: props.labels.monthDay(Number(d.slice(8))) },
    { value: 'nth', label: props.labels.monthNth(nthText(nthOf(d)), wd) },
  ]
  if (inLastWeek(d)) out.push({ value: 'lastWeekday', label: props.labels.monthNth(nthText(-1), wd) })
  if (d === monthEnd(d)) out.push({ value: 'last', label: props.labels.monthLast })
  if (f.monthMode === 'written') out.push({ value: 'written', label: props.labels.monthAsWritten })
  return out
})

// The calendar's reminders this event would take: in days only, all day.
const calendarLeads = computed(() => leadsOf({ remind: props.calendarRemind ?? [] }, { allDay: f.allDay }))

const noteTarget = computed(() => {
  const n = f.note.trim()
  if (!n || !isLink(n)) return ''
  return n
})

function toggleDay(w: Weekday) {
  f.weekdays = f.weekdays.includes(w) ? f.weekdays.filter((x) => x !== w) : [...f.weekdays, w]
}

const newSkip = ref('')
function addSkip() {
  if (/^\d{4}-\d{2}-\d{2}$/.test(newSkip.value) && !f.skip.includes(newSkip.value)) {
    f.skip = [...f.skip, newSkip.value].sort()
  }
  newSkip.value = ''
}
const newPause = reactive({ from: '', to: '' })
function addPause() {
  if (/^\d{4}-\d{2}-\d{2}$/.test(newPause.from) && /^\d{4}-\d{2}-\d{2}$/.test(newPause.to) && newPause.to >= newPause.from) {
    f.pause = [...f.pause, { from: newPause.from, to: newPause.to }]
  }
  newPause.from = ''
  newPause.to = ''
}

function message(k: keyof EventFields): string {
  const e = errors.value[k]
  return e ? props.labels[e] : ''
}

function submit() {
  const res = eventOf(f, props.draft)
  errors.value = res.errors
  if (!res.event) {
    void nextTick(() => box.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
    return
  }
  emit('save', res.event)
}

onMounted(() => {
  void nextTick(() => box.value?.querySelector<HTMLInputElement>('input')?.focus())
})

/** Esc closes; Tab stays in the form. */
function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    ev.preventDefault()
    ev.stopPropagation()
    emit('cancel')
    return
  }
  if (ev.key !== 'Tab' || !box.value) return
  const all = [...box.value.querySelectorAll<HTMLElement>('input, select, textarea, button, a[href]')].filter(
    (el) => !(el as HTMLInputElement).disabled && el.offsetParent !== null,
  )
  if (all.length === 0) return
  const first = all[0]!
  const last = all[all.length - 1]!
  if (ev.shiftKey && document.activeElement === first) {
    ev.preventDefault()
    last.focus()
  } else if (!ev.shiftKey && document.activeElement === last) {
    ev.preventDefault()
    first.focus()
  }
}
</script>

<template>
  <div class="plancia-calendar__overlay" @keydown="onKey">
    <form
      ref="box"
      class="plancia-calendar__dialog"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="fid('heading')"
      novalidate
      @submit.prevent="submit"
    >
      <h3 :id="fid('heading')" class="plancia-calendar__dialog-title">{{ labels.editEvent }}</h3>
      <p v-if="repeats" class="plancia-calendar__help">{{ labels.oneTime }}</p>

      <div class="plancia-calendar__field">
        <label :for="fid('title')">{{ labels.title }}</label>
        <input
          :id="fid('title')"
          v-model="f.title"
          type="text"
          :aria-invalid="!!errors.title"
          :aria-describedby="errors.title ? fid('title-error') : undefined"
        />
        <small v-if="errors.title" :id="fid('title-error')" class="plancia-calendar__error">{{ message('title') }}</small>
      </div>

      <label class="plancia-calendar__check">
        <input v-model="f.allDay" type="checkbox" />
        {{ labels.allDay }}
      </label>

      <div class="plancia-calendar__row">
        <div class="plancia-calendar__field">
          <label :for="fid('start')">{{ labels.start }}</label>
          <input :id="fid('start')" v-model="f.startDate" type="date" :aria-invalid="!!errors.startDate" />
        </div>
        <div v-if="!f.allDay" class="plancia-calendar__field">
          <label :for="fid('start-time')">{{ labels.startTime }}</label>
          <input :id="fid('start-time')" v-model="f.startTime" type="time" step="300" :aria-invalid="!!errors.startTime" />
        </div>
      </div>
      <div class="plancia-calendar__row">
        <div class="plancia-calendar__field">
          <label :for="fid('end')">{{ labels.end }}</label>
          <input
            :id="fid('end')"
            v-model="f.endDate"
            type="date"
            :aria-invalid="!!errors.endDate"
            :aria-describedby="errors.endDate ? fid('end-error') : undefined"
          />
        </div>
        <div v-if="!f.allDay" class="plancia-calendar__field">
          <label :for="fid('end-time')">{{ labels.endTime }}</label>
          <input :id="fid('end-time')" v-model="f.endTime" type="time" step="300" :aria-invalid="!!errors.endTime" />
        </div>
      </div>
      <small v-if="errors.startDate || errors.startTime || errors.endDate || errors.endTime" :id="fid('end-error')" class="plancia-calendar__error">
        {{ message('startDate') || message('startTime') || message('endDate') || message('endTime') }}
      </small>

      <fieldset class="plancia-calendar__group">
        <legend>{{ labels.repeat }}</legend>
        <div class="plancia-calendar__row">
          <select v-model="f.repeat" :aria-label="labels.repeat">
            <option value="none">{{ labels.repeatNone }}</option>
            <option v-for="u in UNITS" :key="u" :value="u">{{ labels.units[u] }}</option>
          </select>
          <template v-if="f.repeat !== 'none'">
            <label :for="fid('every')">{{ labels.every }}</label>
            <input :id="fid('every')" v-model.number="f.every" type="number" min="1" max="1000" class="plancia-calendar__small" />
          </template>
        </div>

        <div v-if="f.repeat === 'week'" class="plancia-calendar__weekdays" role="group" :aria-label="labels.on">
          <label v-for="w in WEEKDAYS" :key="w" class="plancia-calendar__weekday-choice">
            <input
              type="checkbox"
              :checked="f.weekdays.includes(w) || (f.weekdays.length === 0 && w === startDay)"
              @change="toggleDay(w)"
            />
            {{ weekdayName(w, locale, 'short') }}
          </label>
        </div>

        <div v-if="f.repeat === 'month'" class="plancia-calendar__row">
          <label :for="fid('month')">{{ labels.on }}</label>
          <select :id="fid('month')" v-model="f.monthMode">
            <option v-for="c in monthChoices" :key="c.value" :value="c.value">{{ c.label }}</option>
          </select>
        </div>

        <div v-if="f.repeat !== 'none'" class="plancia-calendar__row">
          <label :for="fid('ends')">{{ labels.ends }}</label>
          <select :id="fid('ends')" v-model="f.ends">
            <option value="never">{{ labels.endsNever }}</option>
            <option value="until">{{ labels.endsOn }}</option>
            <option value="times">{{ labels.endsAfter }}</option>
          </select>
          <input
            v-if="f.ends === 'until'"
            v-model="f.until"
            type="date"
            :aria-label="labels.endsOn"
            :aria-invalid="!!errors.until"
          />
          <template v-if="f.ends === 'times'">
            <input
              v-model.number="f.times"
              type="number"
              min="1"
              class="plancia-calendar__small"
              :aria-label="labels.times"
              :aria-invalid="!!errors.times"
            />
            <span>{{ labels.times }}</span>
          </template>
        </div>
        <small v-if="errors.until || errors.times" class="plancia-calendar__error">{{ message('until') || message('times') }}</small>

        <div v-if="f.repeat !== 'none' && f.every === 1" class="plancia-calendar__row">
          <label :for="fid('cycle')">{{ labels.cycle }}</label>
          <select :id="fid('cycle')" v-model="f.cycle">
            <option value="none">{{ labels.cycleNone }}</option>
            <option value="simple">{{ f.cycleOn }} {{ labels.cycleOn }} / {{ f.cycleOff }} {{ labels.cycleOff }}</option>
            <option v-if="f.cycle === 'written'" value="written">{{ labels.cycleAsWritten }}</option>
          </select>
          <template v-if="f.cycle === 'simple'">
            <input v-model.number="f.cycleOn" type="number" min="1" class="plancia-calendar__small" :aria-label="labels.cycleOn" />
            <span>{{ labels.cycleOn }}</span>
            <input v-model.number="f.cycleOff" type="number" min="1" class="plancia-calendar__small" :aria-label="labels.cycleOff" />
            <span>{{ labels.cycleOff }}</span>
          </template>
        </div>

        <template v-if="f.repeat !== 'none'">
          <div class="plancia-calendar__field">
            <span class="plancia-calendar__label">{{ labels.skip }}</span>
            <ul class="plancia-calendar__chips">
              <li v-for="d in f.skip" :key="d">
                {{ d }}
                <button type="button" class="plancia-calendar__x" :aria-label="`${labels.remove} ${d}`" @click="f.skip = f.skip.filter((x) => x !== d)">×</button>
              </li>
            </ul>
            <div class="plancia-calendar__row">
              <input v-model="newSkip" type="date" :aria-label="labels.skip" />
              <button type="button" class="plancia-calendar__button" @click="addSkip">{{ labels.add }}</button>
            </div>
          </div>
          <div class="plancia-calendar__field">
            <span class="plancia-calendar__label">{{ labels.pause }}</span>
            <ul class="plancia-calendar__chips">
              <li v-for="(p, i) in f.pause" :key="`${p.from}:${p.to}`">
                {{ p.from }} – {{ p.to }}
                <button
                  type="button"
                  class="plancia-calendar__x"
                  :aria-label="`${labels.remove} ${p.from} – ${p.to}`"
                  @click="f.pause = f.pause.filter((_, j) => j !== i)"
                >
                  ×
                </button>
              </li>
            </ul>
            <div class="plancia-calendar__row">
              <span>{{ labels.from }}</span>
              <input v-model="newPause.from" type="date" :aria-label="`${labels.pause}: ${labels.from}`" />
              <span>{{ labels.to }}</span>
              <input v-model="newPause.to" type="date" :aria-label="`${labels.pause}: ${labels.to}`" />
              <button type="button" class="plancia-calendar__button" @click="addPause">{{ labels.add }}</button>
            </div>
          </div>
        </template>
      </fieldset>

      <div class="plancia-calendar__field">
        <label :for="fid('remind')">{{ labels.remind }}</label>
        <div class="plancia-calendar__row">
          <select :id="fid('remind')" v-model="f.remindMode">
            <option value="calendar">{{ labels.remindCalendar(calendarLeads) }}</option>
            <option value="none">{{ labels.remindNone }}</option>
            <option value="own">{{ labels.remindOwn }}</option>
          </select>
          <input
            v-if="f.remindMode === 'own'"
            v-model="f.remind"
            type="text"
            :placeholder="f.allDay ? '1d' : '1d, 15m'"
            :aria-label="labels.remind"
            :aria-invalid="!!errors.remind"
            :aria-describedby="fid('remind-help')"
          />
        </div>
        <small v-if="f.remindMode === 'own'" :id="fid('remind-help')" :class="errors.remind ? 'plancia-calendar__error' : 'plancia-calendar__help'">
          {{ errors.remind ? message('remind') : labels.remindHelp(f.allDay, remindAt ?? DEFAULT_REMIND_AT) }}
        </small>
      </div>
      <div class="plancia-calendar__field">
        <label :for="fid('place')">{{ labels.place }}</label>
        <input :id="fid('place')" v-model="f.place" type="text" />
      </div>
      <div class="plancia-calendar__field">
        <label :for="fid('note')">{{ labels.note }}</label>
        <div class="plancia-calendar__row">
          <input
            :id="fid('note')"
            v-model="f.note"
            type="text"
            :placeholder="labels.noteHelp"
            :aria-invalid="!!errors.note"
            :aria-describedby="fid('note-help')"
          />
          <button v-if="noteTarget" type="button" class="plancia-calendar__button" @click="emit('link', noteTarget)">↗</button>
        </div>
        <small :id="fid('note-help')" :class="errors.note ? 'plancia-calendar__error' : 'plancia-calendar__help'">
          {{ errors.note ? message('note') : labels.noteHelp }}
        </small>
      </div>
      <div class="plancia-calendar__field">
        <label :for="fid('tags')">{{ labels.tags }}</label>
        <input :id="fid('tags')" v-model="f.tags" type="text" :aria-describedby="fid('tags-help')" />
        <small :id="fid('tags-help')" class="plancia-calendar__help">{{ labels.tagsHelp }}</small>
      </div>
      <div class="plancia-calendar__field">
        <label :for="fid('text')">{{ labels.text }}</label>
        <textarea :id="fid('text')" v-model="f.text" rows="2" />
      </div>

      <div class="plancia-calendar__actions">
        <button v-if="existing" type="button" class="plancia-calendar__button plancia-calendar__button--danger" @click="emit('delete')">
          {{ labels.delete }}
        </button>
        <span class="plancia-calendar__spacer" />
        <button type="button" class="plancia-calendar__button" @click="emit('cancel')">{{ labels.cancel }}</button>
        <button type="submit" class="plancia-calendar__button plancia-calendar__button--primary">{{ labels.save }}</button>
      </div>
    </form>
  </div>
</template>
