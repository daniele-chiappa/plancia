<script setup lang="ts">
import { computed } from 'vue'
import { addDays, type CalendarDate } from '../model/dates'
import type { Placed } from '../model/times'
import type { CalendarRange } from '../model/types'
import { hourText, longDate } from '../format'
import type { CalendarLabels } from '../labels'

const props = defineProps<{
  range: CalendarRange
  items: Placed[]
  today: CalendarDate
  labels: CalendarLabels
  locale: string
  hour12: boolean
}>()

const emit = defineEmits<{
  open: [item: Placed]
  link: [target: string]
}>()

/** The days with times, each with those it has: a time of several days on each of them. */
const days = computed(() => {
  const out = new Map<CalendarDate, Placed[]>()
  for (const p of props.items) {
    const from = p.start < props.range.from ? props.range.from : p.start
    for (let d = from; d <= p.end && d <= props.range.to; d = addDays(d, 1)) {
      const list = out.get(d) ?? []
      list.push(p)
      out.set(d, list)
    }
  }
  return [...out.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
})

function hours(p: Placed, day: CalendarDate): string {
  if (p.allDay) return props.labels.allDay
  const from = p.start === day ? hourText(p.from, props.locale, props.hour12) : '…'
  if (!p.hasEnd) return from
  const to = p.end === day ? hourText(p.to, props.locale, props.hour12) : '…'
  return `${from}–${to}`
}
</script>

<template>
  <div class="plancia-calendar__list">
    <p v-if="days.length === 0" class="plancia-calendar__empty">{{ labels.noTimes }}</p>
    <section
      v-for="[day, list] in days"
      :key="day"
      class="plancia-calendar__list-day"
      :class="{ 'plancia-calendar__list-day--today': day === today }"
      :aria-current="day === today ? 'date' : undefined"
    >
      <h3 class="plancia-calendar__list-date">{{ longDate(day, locale) }}</h3>
      <ul>
        <li v-for="p in list" :key="`${p.time.event}:${p.start}:${p.from}`" class="plancia-calendar__list-item">
          <span class="plancia-calendar__list-hours">{{ hours(p, day) }}</span>
          <button type="button" class="plancia-calendar__list-title" @click="emit('open', p)">
            {{ p.time.title }}
          </button>
          <span v-if="p.time.place" class="plancia-calendar__place">{{ p.time.place }}</span>
          <span v-if="p.time.changed_from" class="plancia-calendar__tag">{{ labels.changed }}</span>
          <a
            v-if="p.time.link"
            class="plancia-calendar__link"
            :href="p.time.link.startsWith('http') ? p.time.link : '#'"
            @click.prevent="emit('link', p.time.link)"
          >
            {{ p.time.link }}
          </a>
        </li>
      </ul>
    </section>
  </div>
</template>
