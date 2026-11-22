<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { addDays, daysOf, type CalendarDate } from '../model/dates'
import { canDrag, isRow, placedKey, type Placed } from '../model/times'
import type { CalendarRange } from '../model/types'
import { isBar, layoutDay, layoutRow, type Bar, type Slot } from '../layout'
import { dayHeading, hourText, longDate } from '../format'
import type { CalendarLabels } from '../labels'
import { useDrag } from './drag'

const props = defineProps<{
  range: CalendarRange
  anchor: CalendarDate
  items: Placed[]
  today: CalendarDate
  labels: CalendarLabels
  locale: string
  hour12: boolean
  editable: boolean
  scrollHour: number
}>()

const emit = defineEmits<{
  create: [day: CalendarDate, minute?: number]
  open: [item: Placed]
  move: [item: Placed, day: CalendarDate, minute?: number]
  focusDay: [day: CalendarDate]
}>()

/** The height of an hour, in pixels. */
const HOUR = 48
const STEP = 30
const days = computed(() => daysOf(props.range.from, props.range.to))
const hours = Array.from({ length: 24 }, (_, h) => h)

const allDay = computed(() => layoutRow(days.value, props.items.filter(isBar), 3))
const columns = computed(() => {
  const out = new Map<CalendarDate, Slot[]>()
  for (const d of days.value) {
    out.set(
      d,
      layoutDay(props.items.filter((p) => !isBar(p) && p.start === d)),
    )
  }
  return out
})

function barsAt(i: number): Bar[] {
  return allDay.value.bars.filter((b) => b.first === i)
}

// The day and the half hour with the focus.
const focusDay = ref<CalendarDate>(props.anchor)
const focusMinute = ref(props.scrollHour * 60)
watch(
  () => props.anchor,
  (a) => {
    if (a >= props.range.from && a <= props.range.to) focusDay.value = a
  },
)
watch(
  () => props.range.from,
  () => {
    if (focusDay.value < props.range.from || focusDay.value > props.range.to) focusDay.value = props.range.from
  },
)

const scroller = ref<HTMLElement | null>(null)
onMounted(() => {
  if (scroller.value) scroller.value.scrollTop = props.scrollHour * HOUR
})

function focusColumn(day: CalendarDate) {
  focusDay.value = day
  void nextTick(() => scroller.value?.querySelector<HTMLElement>(`[data-day="${day}"]`)?.focus())
}

function onKey(ev: KeyboardEvent) {
  const col = ev.target as HTMLElement
  if (!col.dataset.day || !col.classList.contains('plancia-calendar__column')) return
  const day = col.dataset.day
  switch (ev.key) {
    case 'ArrowUp':
      focusMinute.value = Math.max(0, focusMinute.value - STEP)
      break
    case 'ArrowDown':
      focusMinute.value = Math.min(1440 - STEP, focusMinute.value + STEP)
      break
    case 'ArrowLeft':
    case 'ArrowRight': {
      const next = addDays(day, ev.key === 'ArrowLeft' ? -1 : 1)
      ev.preventDefault()
      if (next < props.range.from || next > props.range.to) emit('focusDay', next)
      focusColumn(next)
      return
    }
    case 'Enter':
    case ' ':
      ev.preventDefault()
      if (props.editable) emit('create', day, focusMinute.value)
      return
    default:
      return
  }
  ev.preventDefault()
  const y = (focusMinute.value / 60) * HOUR
  const s = scroller.value
  if (s && (y < s.scrollTop || y > s.scrollTop + s.clientHeight - HOUR)) s.scrollTop = y - HOUR
}

function minuteAt(el: HTMLElement, clientY: number, grab = 0, snap = STEP): number {
  const top = el.getBoundingClientRect().top
  const m = ((clientY - grab - top) / HOUR) * 60
  return Math.max(0, Math.min(1440 - snap, Math.round(m / snap) * snap))
}

const drag = useDrag({
  enabled: () => props.editable,
  can: canDrag,
  target: (el, ev, grab) => {
    const col = el?.closest<HTMLElement>('[data-day]')
    if (!col) return null
    if (!col.classList.contains('plancia-calendar__column')) return { day: col.dataset.day! }
    return { day: col.dataset.day!, minute: minuteAt(col, ev.clientY, grab, 15) }
  },
  drop: (item, to) => emit('move', item, to.day, isBar(item) ? undefined : to.minute),
})

function clickColumn(ev: MouseEvent, day: CalendarDate) {
  if (drag.justDropped() || !props.editable) return
  const minute = minuteAt(ev.currentTarget as HTMLElement, ev.clientY)
  focusDay.value = day
  focusMinute.value = minute
  emit('create', day, minute)
}

function clickAllDay(day: CalendarDate) {
  if (drag.justDropped() || !props.editable) return
  emit('create', day)
}

function openItem(p: Placed) {
  if (drag.justDropped()) return
  emit('open', p)
}

function slotStyle(s: Slot) {
  return {
    top: `${(s.top / 60) * HOUR}px`,
    height: `${Math.max(((s.bottom - s.top) / 60) * HOUR - 2, 18)}px`,
    left: `${(s.column / s.columns) * 100}%`,
    width: `${100 / s.columns}%`,
  }
}

function itemLabel(p: Placed): string {
  const parts = [p.time.title]
  if (!p.allDay) {
    parts.push(p.hasEnd ? `${hourText(p.from, props.locale, props.hour12)}–${hourText(p.to, props.locale, props.hour12)}` : hourText(p.from, props.locale, props.hour12))
  }
  if (p.time.place) parts.push(p.time.place)
  if (isRow(p)) parts.push(props.labels.row)
  return parts.join(', ')
}

function columnLabel(day: CalendarDate): string {
  const n = columns.value.get(day)?.length ?? 0
  const name = props.labels.dayName(longDate(day, props.locale), n)
  return day === focusDay.value ? `${name}, ${hourText(focusMinute.value, props.locale, props.hour12)}` : name
}

const gridStyle = computed(() => ({ '--days': String(days.value.length), '--hour': `${HOUR}px` }))
</script>

<template>
  <div class="plancia-calendar__grid" :style="gridStyle">
    <div class="plancia-calendar__grid-head">
      <span class="plancia-calendar__gutter" />
      <span
        v-for="d in days"
        :key="d"
        class="plancia-calendar__grid-day"
        :class="{ 'plancia-calendar__grid-day--today': d === today }"
        :aria-current="d === today ? 'date' : undefined"
      >
        {{ dayHeading(d, locale) }}
      </span>
    </div>
    <div class="plancia-calendar__allday">
      <span class="plancia-calendar__gutter plancia-calendar__gutter--label">{{ labels.allDay }}</span>
      <div
        v-for="(d, i) in days"
        :key="d"
        class="plancia-calendar__allday-day"
        :class="{ 'plancia-calendar__day--drop': drag.over.value?.day === d && drag.over.value.minute === undefined }"
        :data-day="d"
        :style="{ '--lanes': String(Math.max(1, allDay.lanes)) }"
        @click.self="clickAllDay(d)"
      >
        <button
          v-for="b in barsAt(i)"
          :key="placedKey(b.item)"
          type="button"
          class="plancia-calendar__event plancia-calendar__event--bar"
          :class="{
            'plancia-calendar__event--before': b.before,
            'plancia-calendar__event--after': b.after,
            'plancia-calendar__event--changed': !!b.item.time.changed_from,
            'plancia-calendar__event--row': isRow(b.item),
            'plancia-calendar__event--dragging': drag.dragging.value === b.item,
          }"
          :style="{ '--span': String(b.last - b.first + 1), '--lane': String(b.lane) }"
          :aria-label="itemLabel(b.item)"
          :title="itemLabel(b.item)"
          @pointerdown="drag.start($event, b.item)"
          @click.stop="openItem(b.item)"
        >
          <span class="plancia-calendar__name">{{ b.item.time.title }}</span>
        </button>
        <span v-if="allDay.hidden[i]" class="plancia-calendar__more">{{ labels.more(allDay.hidden[i]!) }}</span>
      </div>
    </div>
    <div ref="scroller" class="plancia-calendar__scroll" @keydown="onKey">
      <div class="plancia-calendar__hours">
        <div class="plancia-calendar__gutter">
          <span v-for="h in hours" :key="h" class="plancia-calendar__hour">{{ h === 0 ? '' : hourText(h * 60, locale, hour12) }}</span>
        </div>
        <div
          v-for="d in days"
          :key="d"
          class="plancia-calendar__column"
          :class="{
            'plancia-calendar__column--today': d === today,
            'plancia-calendar__column--drop': drag.over.value?.day === d && drag.over.value.minute !== undefined,
          }"
          :data-day="d"
          role="group"
          :tabindex="d === focusDay ? 0 : -1"
          :aria-label="columnLabel(d)"
          @click.self="clickColumn($event, d)"
          @focus="focusDay = d"
        >
          <span
            v-if="d === focusDay"
            class="plancia-calendar__cursor"
            aria-hidden="true"
            :style="{ top: `${(focusMinute / 60) * HOUR}px` }"
          />
          <span
            v-if="drag.over.value?.day === d && drag.over.value.minute !== undefined"
            class="plancia-calendar__ghost"
            aria-hidden="true"
            :style="{ top: `${(drag.over.value.minute / 60) * HOUR}px` }"
          >
            {{ hourText(drag.over.value.minute, locale, hour12) }}
          </span>
          <button
            v-for="s in columns.get(d) ?? []"
            :key="placedKey(s.item)"
            type="button"
            class="plancia-calendar__event plancia-calendar__event--timed"
            :class="{
              'plancia-calendar__event--changed': !!s.item.time.changed_from,
              'plancia-calendar__event--dragging': drag.dragging.value === s.item,
            }"
            :style="slotStyle(s)"
            :tabindex="d === focusDay ? 0 : -1"
            :aria-label="itemLabel(s.item)"
            :title="itemLabel(s.item)"
            @pointerdown="drag.start($event, s.item)"
            @click.stop="openItem(s.item)"
          >
            <span class="plancia-calendar__time">{{ hourText(s.item.from, locale, hour12) }}</span>
            <span class="plancia-calendar__name">{{ s.item.time.title }}</span>
            <span v-if="s.item.time.place" class="plancia-calendar__place">{{ s.item.time.place }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
