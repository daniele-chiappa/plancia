import {
  addDays,
  clock,
  daysBetween,
  monthEnd,
  monthsBetween,
  weekStart,
  weekdayOf,
  type Calendar,
  type CalendarEvent,
  type CalendarLoad,
  type CalendarRange,
  type CalendarTime,
} from '../src'

// The playground's own days of the repeats, plain and slow, to show the
// views without a server. It is not the package's, nor the reference:
// gosidian's server computes the days a host gives (ADR-007).

function periodOf(e: CalendarEvent, d: string): number {
  const rp = e.repeat!
  switch (rp.unit) {
    case 'day':
      return daysBetween(e.start, d)
    case 'week':
      return daysBetween(weekStart(e.start), weekStart(d)) / 7
    case 'month':
      return monthsBetween(e.start, d)
    case 'year':
      return Number(d.slice(0, 4)) - Number(e.start.slice(0, 4))
  }
}

function onRule(e: CalendarEvent, d: string): boolean {
  const rp = e.repeat!
  const p = periodOf(e, d)
  if (p % rp.every !== 0) return false
  if (rp.cycle && !rp.cycle[(p / rp.every) % rp.cycle.length]) return false
  const day = Number(d.slice(8))
  switch (rp.unit) {
    case 'day':
      return true
    case 'week':
      return (rp.weekdays.length ? rp.weekdays : [weekdayOf(e.start)]).includes(weekdayOf(d))
    case 'month': {
      const last = Number(monthEnd(d).slice(8))
      if (rp.monthDays.length) return rp.monthDays.some((m) => (m > 0 ? m === day : last + m + 1 === day))
      if (rp.nths.length) {
        return rp.nths.some((n) => n.day === weekdayOf(d) && (n.n === -1 ? day + 7 > last : Math.ceil(day / 7) === n.n))
      }
      if (rp.weekdays.length) return rp.weekdays.includes(weekdayOf(d))
      return day === Number(e.start.slice(8))
    }
    case 'year':
      return d.slice(5) === e.start.slice(5)
  }
}

function at(d: string, minute: number): string {
  const day = addDays(d, Math.floor(minute / 1440))
  return `${day}T${clock(minute % 1440)}:00+00:00`
}

function time(i: number, e: CalendarEvent, d: string, extra: Partial<CalendarTime> = {}, hours?: { from: number; to: number; hasEnd: boolean }): CalendarTime {
  const span = daysBetween(e.start, e.end)
  const h = hours ?? e
  const t: CalendarTime = { event: i, title: e.title, start: e.allDay ? d : at(d, h.from), repeats: !!e.repeat }
  if (e.id) t.id = e.id
  if (e.allDay) {
    t.all_day = true
    if (span > 0) t.end = addDays(d, span)
  } else if (h.hasEnd) {
    const end = span * 1440 + h.to + (h.to <= h.from && span === 0 ? 1440 : 0)
    t.end = at(d, end)
  }
  if (e.place) t.place = e.place
  if (e.note) t.link = e.note
  if (e.tags.length) t.tags = e.tags
  return { ...t, ...extra }
}

export function demoLoad(c: Calendar | null, range: CalendarRange): CalendarLoad {
  const times: CalendarTime[] = []
  if (!c) return { times }
  c.events.forEach((e, i) => {
    const span = daysBetween(e.start, e.end) + 1
    const shows = (d: string) => d <= range.to && addDays(d, span) > range.from
    if (!e.repeat) {
      if (shows(e.start)) times.push(time(i, e, e.start))
      return
    }
    const rp = e.repeat
    const last = rp.until && rp.until < range.to ? rp.until : range.to
    let count = 0
    for (let d = e.start; d <= last; d = addDays(d, 1)) {
      if (!onRule(e, d)) continue
      count++
      if (rp.times && count > rp.times) break
      if (e.skip.includes(d) || e.pause.some((p) => d >= p.from && d <= p.to)) continue
      const ch = e.changes.find((x) => x.date === d)
      if (ch?.cancel) continue
      const day = ch?.move ?? d
      if (!shows(day)) continue
      const extra: Partial<CalendarTime> = {}
      if (ch) extra.changed_from = d
      if (ch?.title) extra.title = ch.title
      if (ch?.place) extra.place = ch.place
      if (ch?.note) extra.link = ch.note
      times.push(time(i, e, day, extra, ch?.time))
    }
  })
  return { times }
}
