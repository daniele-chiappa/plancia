<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { addDays, monthEnd, monthStart, weekStart, type CalendarDate, type Weekday } from '../model/dates'
import type { Placed } from '../model/times'
import type { CalendarRange } from '../model/types'
import { layoutRow, weeksOf, type Bar } from '../layout'
import { hourText, longDate, weekdayNames } from '../format'
import type { CalendarLabels } from '../labels'
import { useDrag } from './drag'

const props = defineProps<{
  range: CalendarRange
  anchor: CalendarDate
  items: Placed[]
  today: CalendarDate
  labels: CalendarLabels
  locale: string
  firstDay: Weekday
  hour12: boolean
  editable: boolean
  maxPerDay: number
}>()

const emit = defineEmits<{
  create: [day: CalendarDate]
  open: [item: Placed]
  more: [day: CalendarDate]
  move: [item: Placed, day: CalendarDate]
  focusDay: [day: CalendarDate]
}>()

const weeks = computed(() => weeksOf(props.range))
const rows = computed(() => weeks.value.map((w) => layoutRow(w, props.items, props.maxPerDay)))
const heads = computed(() => weekdayNames(props.firstDay, props.locale))
const month = computed(() => props.anchor.slice(0, 7))

/** The times of each day, for its name. */
const counts = computed(() => {
  const out = new Map<CalendarDate, number>()
  for (const p of props.items) {
    for (let d = p.start < props.range.from ? props.range.from : p.start; d <= p.end && d <= props.range.to; d = addDays(d, 1)) {
      out.set(d, (out.get(d) ?? 0) + 1)
    }
  }
  return out
})

/** The bars that start in each cell of a week: the cell holds them, so the grid's rows hold only cells. */
function barsAt(w: number, i: number): Bar[] {
  return rows.value[w]!.bars.filter((b) => b.first === i)
}

// The day with the focus: the anchor, kept in the month shown.
const focused = ref<CalendarDate>(props.anchor)
watch(
  () => props.anchor,
  (a) => {
    focused.value = a
  },
)
const grid = ref<HTMLElement | null>(null)

function focusCell(day: CalendarDate) {
  focused.value = day
  void nextTick(() => {
    grid.value?.querySelector<HTMLElement>(`[data-day="${day}"]`)?.focus()
  })
}

function onKey(ev: KeyboardEvent) {
  const cell = (ev.target as HTMLElement).closest<HTMLElement>('[role="gridcell"]')
  if (!cell || ev.target !== cell) return
  const day = cell.dataset.day!
  let next: CalendarDate | null = null
  switch (ev.key) {
    case 'ArrowLeft':
      next = addDays(day, -1)
      break
    case 'ArrowRight':
      next = addDays(day, 1)
      break
    case 'ArrowUp':
      next = addDays(day, -7)
      break
    case 'ArrowDown':
      next = addDays(day, 7)
      break
    case 'Home':
      next = weekStart(day, props.firstDay)
      break
    case 'End':
      next = addDays(weekStart(day, props.firstDay), 6)
      break
    case 'PageUp':
      next = addDays(monthStart(day), -1)
      break
    case 'PageDown':
      next = addDays(monthEnd(day), 1)
      break
    case 'Enter':
    case ' ':
      ev.preventDefault()
      if (props.editable) emit('create', day)
      return
    default:
      return
  }
  ev.preventDefault()
  // Out of the month shown: the view follows.
  if (next.slice(0, 7) !== month.value) emit('focusDay', next)
  focusCell(next)
}

const drag = useDrag({
  enabled: () => props.editable,
  target: (el) => {
    const cell = el?.closest<HTMLElement>('[data-day]')
    return cell ? { day: cell.dataset.day! } : null
  },
  drop: (item, to) => emit('move', item, to.day),
})

function clickDay(day: CalendarDate) {
  if (drag.justDropped()) return
  focused.value = day
  if (props.editable) emit('create', day)
}

function openItem(p: Placed) {
  if (drag.justDropped()) return
  emit('open', p)
}

function itemLabel(p: Placed): string {
  const parts = [p.time.title]
  if (!p.allDay) parts.push(hourText(p.from, props.locale, props.hour12))
  if (p.time.place) parts.push(p.time.place)
  return parts.join(', ')
}

/** The width of a bar in its cell: the cells it spans. */
function barStyle(b: Bar) {
  return { '--span': String(b.last - b.first + 1), '--lane': String(b.lane) }
}

const weekStyle = computed(() => ({ '--lanes': String(props.maxPerDay) }))
</script>

<template>
  <div ref="grid" class="plancia-calendar__month" role="grid" :aria-label="labels.grid" @keydown="onKey">
    <div class="plancia-calendar__month-head" role="row">
      <span v-for="(name, i) in heads" :key="i" role="columnheader" class="plancia-calendar__weekday">{{ name }}</span>
    </div>
    <div v-for="(week, w) in weeks" :key="week[0]" class="plancia-calendar__week" role="row" :style="weekStyle">
      <div
        v-for="(day, i) in week"
        :key="day"
        role="gridcell"
        class="plancia-calendar__day"
        :class="{
          'plancia-calendar__day--outside': day.slice(0, 7) !== month,
          'plancia-calendar__day--today': day === today,
          'plancia-calendar__day--drop': drag.over.value?.day === day,
        }"
        :data-day="day"
        :tabindex="day === focused ? 0 : -1"
        :aria-current="day === today ? 'date' : undefined"
        :aria-label="labels.dayName(longDate(day, locale), counts.get(day) ?? 0)"
        @click.self="clickDay(day)"
        @focus="focused = day"
      >
        <span class="plancia-calendar__num" aria-hidden="true" @click="clickDay(day)">{{ Number(day.slice(8)) }}</span>
        <button
          v-for="b in barsAt(w, i)"
          :key="`${b.item.time.event}:${b.item.start}:${b.item.from}`"
          type="button"
          class="plancia-calendar__event"
          :class="{
            'plancia-calendar__event--bar': b.item.allDay || b.last > b.first || b.before || b.after,
            'plancia-calendar__event--before': b.before,
            'plancia-calendar__event--after': b.after,
            'plancia-calendar__event--changed': !!b.item.time.changed_from,
            'plancia-calendar__event--dragging': drag.dragging.value === b.item,
          }"
          :style="barStyle(b)"
          :tabindex="day === focused ? 0 : -1"
          :aria-label="itemLabel(b.item)"
          :title="itemLabel(b.item)"
          @pointerdown="drag.start($event, b.item)"
          @click.stop="openItem(b.item)"
        >
          <span v-if="!b.item.allDay && !b.before" class="plancia-calendar__time">{{ hourText(b.item.from, locale, hour12) }}</span>
          <span class="plancia-calendar__name">{{ b.item.time.title }}</span>
        </button>
        <button
          v-if="rows[w]!.hidden[i]"
          type="button"
          class="plancia-calendar__more"
          :tabindex="day === focused ? 0 : -1"
          @click.stop="emit('more', day)"
        >
          {{ labels.more(rows[w]!.hidden[i]!) }}
        </button>
      </div>
    </div>
  </div>
</template>
