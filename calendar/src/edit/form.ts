import { addDays, clock, monthEnd, parseDate, weekdayOf, weekdayIndex, type CalendarDate, type Weekday } from '../model/dates'
import { isLink, parseClock } from '../model/parse'
import type { CalendarEvent, Nth, Repeat, Unit } from '../model/types'
import { clone } from './edit'

// The event form's fields, and the event they make: the form edits plain
// fields, and what the form cannot say (days of the month as written, a
// cycle as a list) is kept from the event it started from.

export type MonthMode = 'day' | 'nth' | 'lastWeekday' | 'last' | 'written'

export interface EventFields {
  title: string
  allDay: boolean
  startDate: string
  startTime: string
  endDate: string
  /** Empty for a moment. */
  endTime: string
  repeat: 'none' | Unit
  every: number
  weekdays: Weekday[]
  monthMode: MonthMode
  ends: 'never' | 'until' | 'times'
  until: string
  times: number
  cycle: 'none' | 'simple' | 'written'
  cycleOn: number
  cycleOff: number
  skip: string[]
  pause: { from: string; to: string }[]
  place: string
  note: string
  tags: string
  text: string
}

/** The keys of the labels that say what is wrong with a field. */
export type FieldError = 'needTitle' | 'needDate' | 'needTime' | 'endBeforeStart' | 'badNote' | 'needTimes'

/** The week of the month of a day: 1 to 5. */
export function nthOf(d: CalendarDate): number {
  return Math.ceil(Number(d.slice(8)) / 7)
}

/** Says d is in the last week of its month: its weekday does not come again. */
export function inLastWeek(d: CalendarDate): boolean {
  return Number(d.slice(8)) + 7 > Number(monthEnd(d).slice(8))
}

function monthModeOf(e: CalendarEvent): MonthMode {
  const rp = e.repeat
  if (!rp || rp.unit !== 'month') return 'day'
  const wd = weekdayOf(e.start)
  if (rp.monthDays.length === 0 && rp.nths.length === 0 && rp.weekdays.length === 0) return 'day'
  if (rp.weekdays.length === 0 && rp.monthDays.length === 0 && rp.nths.length === 1 && rp.nths[0]!.day === wd) {
    if (rp.nths[0]!.n === nthOf(e.start)) return 'nth'
    if (rp.nths[0]!.n === -1 && inLastWeek(e.start)) return 'lastWeekday'
  }
  if (rp.nths.length === 0 && rp.weekdays.length === 0 && rp.monthDays.length === 1 && rp.monthDays[0] === -1 && e.start === monthEnd(e.start)) {
    return 'last'
  }
  return 'written'
}

function cycleModeOf(rp: Repeat | undefined): { mode: EventFields['cycle']; on: number; off: number } {
  const c = rp?.cycle
  if (!c || c.length === 0) return { mode: 'none', on: 3, off: 1 }
  const on = c.findIndex((x) => !x)
  if (on > 0 && c.slice(on).every((x) => !x)) return { mode: 'simple', on, off: c.length - on }
  return { mode: 'written', on: 3, off: 1 }
}

/** The fields of an event, as the form starts. */
export function fieldsOf(e: CalendarEvent): EventFields {
  const rp = e.repeat
  const cycle = cycleModeOf(rp)
  return {
    title: e.title,
    allDay: e.allDay,
    startDate: e.start,
    startTime: e.allDay ? '' : clock(e.from),
    // 24:00 is the next day's 00:00, as a field of time says it.
    endDate: !e.allDay && e.hasEnd && e.to === 1440 ? addDays(e.end, 1) : e.end,
    endTime: e.allDay || !e.hasEnd ? '' : clock(e.to % 1440),
    repeat: rp ? rp.unit : 'none',
    every: rp?.every ?? 1,
    weekdays: rp?.unit === 'week' ? [...rp.weekdays] : [],
    monthMode: monthModeOf(e),
    ends: rp?.until ? 'until' : rp?.times ? 'times' : 'never',
    until: rp?.until ?? '',
    times: rp?.times ?? 10,
    cycle: cycle.mode,
    cycleOn: cycle.on,
    cycleOff: cycle.off,
    skip: [...e.skip],
    pause: e.pause.map((p) => ({ from: p.from, to: p.to })),
    place: e.place ?? '',
    note: e.note ?? '',
    tags: e.tags.join(', '),
    text: e.text ?? '',
  }
}

/** The event the fields make, from base (what they do not say), or what is wrong with them. */
export function eventOf(f: EventFields, base: CalendarEvent): { event: CalendarEvent | null; errors: Partial<Record<keyof EventFields, FieldError>> } {
  const errors: Partial<Record<keyof EventFields, FieldError>> = {}
  const title = f.title.trim()
  if (!title) errors.title = 'needTitle'
  const start = parseDate(f.startDate)
  if (!start) errors.startDate = 'needDate'
  let end = f.endDate.trim() === '' ? start : parseDate(f.endDate)
  if (!end) errors.endDate = 'needDate'
  let from = 0
  let to = 0
  let hasEnd = false
  if (!f.allDay) {
    const s = parseClock(f.startTime)
    if (s === null || s === 1440) errors.startTime = 'needTime'
    else from = s
    if (f.endTime.trim() !== '') {
      const t = parseClock(f.endTime)
      if (t === null) errors.endTime = 'needTime'
      else {
        to = t
        hasEnd = true
      }
    } else to = from
  }
  // An end at the next day's 00:00 is this day's 24:00, as the format says it.
  if (!f.allDay && hasEnd && to === 0 && start && end && end === addDays(start, 1)) {
    to = 1440
    end = start
  }
  if (start && end && !errors.startTime && !errors.endTime) {
    const before = end < start || (!f.allDay && hasEnd && end === start && to <= from)
    if (before) errors.endDate = 'endBeforeStart'
  }
  const note = f.note.trim()
  if (!isLink(note)) errors.note = 'badNote'

  let repeat: Repeat | undefined
  if (f.repeat !== 'none' && start) {
    const old = base.repeat
    repeat = { every: Math.max(1, Math.min(1000, Math.round(f.every) || 1)), unit: f.repeat, weekdays: [], monthDays: [], nths: [], line: old?.line ?? 0 }
    if (f.repeat === 'week' && f.weekdays.length > 0) {
      // Weekdays chosen in the form take the first day's: it is always one
      // of the rule's. Those of the event stay as they are (a time moved
      // off the rule's days shows another first day).
      const kept = old?.unit === 'week' && old.weekdays.join() === f.weekdays.join()
      const days = new Set(kept ? f.weekdays : [...f.weekdays, weekdayOf(start)])
      repeat.weekdays = [...days].sort((a, b) => weekdayIndex(a) - weekdayIndex(b))
    }
    if (f.repeat === 'month') {
      const wd = weekdayOf(start)
      if (f.monthMode === 'nth') repeat.nths = [{ n: nthOf(start), day: wd } satisfies Nth]
      else if (f.monthMode === 'lastWeekday') repeat.nths = [{ n: -1, day: wd }]
      else if (f.monthMode === 'last') repeat.monthDays = [-1]
      else if (f.monthMode === 'written' && old?.unit === 'month') {
        repeat.weekdays = [...old.weekdays]
        repeat.monthDays = [...old.monthDays]
        repeat.nths = old.nths.map((n) => ({ ...n }))
      }
    }
    if (f.ends === 'until') {
      const u = parseDate(f.until)
      if (!u) errors.until = 'needDate'
      else if (u < start) errors.until = 'endBeforeStart'
      else repeat.until = u
    } else if (f.ends === 'times') {
      if (!(f.times >= 1)) errors.times = 'needTimes'
      else repeat.times = Math.round(f.times)
    }
    if (repeat.every === 1 && f.cycle === 'simple') {
      const on = Math.max(1, Math.round(f.cycleOn))
      const off = Math.max(1, Math.round(f.cycleOff))
      repeat.cycle = Array.from({ length: on + off }, (_, i) => i < on)
    } else if (repeat.every === 1 && f.cycle === 'written' && old?.cycle) {
      repeat.cycle = [...old.cycle]
    }
  }
  if (Object.keys(errors).length > 0 || !start || !end) return { event: null, errors }
  const tags = f.tags
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t !== '')
  const event: CalendarEvent = {
    ...clone(base),
    title,
    start,
    end,
    allDay: f.allDay,
    from: f.allDay ? 0 : from,
    to: f.allDay ? 0 : to,
    hasEnd: !f.allDay && hasEnd,
    tags,
    skip: repeat ? f.skip.map((d) => parseDate(d)).filter((d): d is string => d !== null).sort() : [],
    pause: repeat
      ? f.pause
          .map((p) => ({ from: parseDate(p.from), to: parseDate(p.to), line: 0 }))
          .filter((p): p is { from: string; to: string; line: number } => p.from !== null && p.to !== null && p.to >= p.from)
      : [],
  }
  if (repeat) event.repeat = repeat
  else delete event.repeat
  for (const [k, v] of [
    ['place', f.place.trim()],
    ['note', note],
    ['text', f.text.trim()],
  ] as const) {
    if (v) event[k] = v
    else delete event[k]
  }
  // Keep the lines of the pauses that did not change, for a diff.
  event.pause = event.pause.map((p) => base.pause.find((b) => b.from === p.from && b.to === p.to) ?? p)
  return { event, errors }
}
