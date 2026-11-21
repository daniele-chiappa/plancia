import {
  addDays,
  addMonths,
  daysBetween,
  monthEnd,
  monthStart,
  weekStart,
  type CalendarDate,
  type Weekday,
} from './model/dates'
import { comparePlaced, type Placed } from './model/times'
import type { CalendarRange } from './model/types'

// Where the views put the times: the days a view shows, the lanes of a
// week's bars, the columns of a day's hours.

/** The views of the calendar. */
export type CalendarViewName = 'month' | 'week' | 'day' | 'list'
export const CALENDAR_VIEWS: readonly CalendarViewName[] = ['month', 'week', 'day', 'list']

/** The days a view shows around date. */
export function viewRange(view: CalendarViewName, date: CalendarDate, firstDay: Weekday): CalendarRange {
  switch (view) {
    case 'month': {
      const from = weekStart(monthStart(date), firstDay)
      return { from, to: addDays(weekStart(monthEnd(date), firstDay), 6) }
    }
    case 'week': {
      const from = weekStart(date, firstDay)
      return { from, to: addDays(from, 6) }
    }
    case 'day':
      return { from: date, to: date }
    case 'list':
      return { from: monthStart(date), to: monthEnd(date) }
  }
}

/** The date a step back (-1) or forward (+1) shows. */
export function stepDate(view: CalendarViewName, date: CalendarDate, step: number): CalendarDate {
  switch (view) {
    case 'month':
    case 'list': {
      // The same day of the month when it has one, else its last.
      const first = addMonths(date, step)
      const day = Math.min(Number(date.slice(8)), Number(monthEnd(first).slice(8)))
      return `${first.slice(0, 8)}${String(day).padStart(2, '0')}`
    }
    case 'week':
      return addDays(date, 7 * step)
    case 'day':
      return addDays(date, step)
  }
}

/** The weeks of a range that starts and ends with a week. */
export function weeksOf(range: CalendarRange): CalendarDate[][] {
  const weeks: CalendarDate[][] = []
  for (let d = range.from; d <= range.to; d = addDays(d, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)))
  }
  return weeks
}

/** A time placed in a row of days: its columns (0-based, both included) and its lane. */
export interface Bar {
  item: Placed
  first: number
  last: number
  lane: number
  /** It began before the row, or goes on after it. */
  before: boolean
  after: boolean
}

/** A row of days laid out: the bars shown, and per day the times that did not fit. */
export interface Row {
  bars: Bar[]
  hidden: number[]
  /** The lanes used, at most the lanes given. */
  lanes: number
}

/** Says a time goes in the row of days rather than in the hours: no hours, or more than one day. */
export function isBar(p: Placed): boolean {
  return p.allDay || p.end > p.start
}

/**
 * Lays out the times of a row of days in lanes, at most lanes of them: the
 * longest and earliest first, each in the first lane free on all its days.
 */
export function layoutRow(days: CalendarDate[], items: Placed[], lanes: number): Row {
  const first = days[0]!
  const last = days[days.length - 1]!
  const inRow = items.filter((p) => p.start <= last && p.end >= first)
  inRow.sort((a, b) => {
    const la = daysBetween(a.start, a.end)
    const lb = daysBetween(b.start, b.end)
    if (a.start !== b.start) return a.start < b.start ? -1 : 1
    if (la !== lb) return lb - la
    return comparePlaced(a, b)
  })
  const taken: boolean[][] = []
  const bars: Bar[] = []
  const hidden = days.map(() => 0)
  for (const item of inRow) {
    const a = Math.max(0, daysBetween(first, item.start))
    const b = Math.min(days.length - 1, daysBetween(first, item.end))
    let lane = 0
    for (; ; lane++) {
      const row = (taken[lane] ??= days.map(() => false))
      let free = true
      for (let i = a; i <= b; i++) if (row[i]) free = false
      if (free) break
    }
    for (let i = a; i <= b; i++) taken[lane]![i] = true
    if (lane >= lanes) {
      for (let i = a; i <= b; i++) hidden[i]!++
      continue
    }
    bars.push({ item, first: a, last: b, lane, before: item.start < first, after: item.end > last })
  }
  return { bars, hidden, lanes: Math.min(lanes, taken.length) }
}

/** A time placed in a day's hours: its minutes in that day and its column among those it overlaps. */
export interface Slot {
  item: Placed
  top: number
  bottom: number
  column: number
  columns: number
}

/** The minutes of a time in the day: from its start to its end, at least 30 to be seen. */
function minutes(p: Placed): [number, number] {
  const to = p.hasEnd ? p.to : p.from
  return [p.from, Math.max(to, p.from + 30)]
}

/**
 * Lays out the times with hours of one day: those that overlap side by
 * side, each in the first column free at its start, and every time of a
 * cluster as wide as the cluster's columns allow.
 */
export function layoutDay(items: Placed[]): Slot[] {
  const sorted = [...items].sort(comparePlaced)
  const slots: Slot[] = []
  let cluster: Slot[] = []
  let clusterEnd = -1
  const close = () => {
    const columns = Math.max(1, ...cluster.map((s) => s.column + 1))
    for (const s of cluster) s.columns = columns
    cluster = []
  }
  for (const item of sorted) {
    const [top, bottom] = minutes(item)
    if (top >= clusterEnd) {
      close()
      clusterEnd = -1
    }
    const used = new Set(cluster.filter((s) => s.bottom > top).map((s) => s.column))
    let column = 0
    while (used.has(column)) column++
    const slot: Slot = { item, top, bottom, column, columns: 1 }
    cluster.push(slot)
    slots.push(slot)
    clusterEnd = Math.max(clusterEnd, bottom)
  }
  close()
  return slots
}
