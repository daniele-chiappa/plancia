import type { CalendarDate } from './dates'
import type { CalendarTime } from './types'

/**
 * A time as the views place it: its days and its minutes in the calendar's
 * zone. The host's times carry the calendar's offset, so the day and hour
 * written in them are already those of the zone.
 */
export interface Placed {
  time: CalendarTime
  /** The first day and the last (included). */
  start: CalendarDate
  end: CalendarDate
  allDay: boolean
  /** Minutes from midnight on start, and on end; to is 1440 for an end at midnight. */
  from: number
  to: number
  hasEnd: boolean
  /** The day the rule gives the time: changed_from, else its first day. */
  original: CalendarDate
}

const timeRe = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/

function split(s: string): { date: CalendarDate; minute: number; hasTime: boolean } | null {
  const m = timeRe.exec(s)
  if (!m) return null
  return { date: m[1]!, minute: m[2] ? Number(m[2]) * 60 + Number(m[3]) : 0, hasTime: m[2] !== undefined }
}

/** Places a time of the host, or null when its start does not read. */
export function placeTime(t: CalendarTime): Placed | null {
  const s = split(t.start)
  if (!s) return null
  const e = t.end ? split(t.end) : null
  const allDay = t.all_day === true || !s.hasTime
  const out: Placed = {
    time: t,
    start: s.date,
    end: e?.date ?? s.date,
    allDay,
    from: allDay ? 0 : s.minute,
    to: allDay ? 0 : (e?.minute ?? s.minute),
    hasEnd: !allDay && e !== null,
    original: t.changed_from ?? s.date,
  }
  // An end at midnight is the last moment of the day before.
  if (!allDay && e && e.minute === 0 && e.date > s.date) {
    const d = new Date(`${e.date}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - 1)
    out.end = d.toISOString().slice(0, 10)
    out.to = 1440
  }
  if (out.end < out.start) out.end = out.start
  return out
}

/** A key for a view's list: an event's time, or a row by its source and name. */
export function placedKey(p: Placed): string {
  return p.time.row !== undefined ? `r${p.time.source ?? 0}:${p.time.row}:${p.start}` : `${p.time.event}:${p.start}:${p.from}`
}

/** Says a time is a row a source brings, the host's to change. */
export function isRow(p: Placed): boolean {
  return p.time.row !== undefined
}

/** Says a time can be dragged: an event of an editable calendar, or a row the host lets move. */
export function canDrag(p: Placed): boolean {
  return !isRow(p) || p.time.movable === true
}

/** The order of the views: by day, the days without hours first, then by hour and title. */
export function comparePlaced(a: Placed, b: Placed): number {
  if (a.start !== b.start) return a.start < b.start ? -1 : 1
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
  if (a.from !== b.from) return a.from - b.from
  const span = (p: Placed) => (p.end > p.start ? 1 : 0)
  if (span(a) !== span(b)) return span(b) - span(a)
  return a.time.title.localeCompare(b.time.title) || a.time.event - b.time.event
}
