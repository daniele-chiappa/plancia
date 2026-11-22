import { addDays, clock } from './dates'
import { isZone } from './parse'
import type { Calendar, CalendarEvent, CalendarSource, Change, Repeat } from './types'

// A calendar said in words, as gosidian's internal/calendar/text.go says
// it: the text alternative of the views, in English, the same on both
// sides (the examples' expected.json holds the Go reader's).

const MAX_TEXT = 4000

function ordinal(n: number): string {
  if (n === -1) return 'last'
  if (n % 10 === 1 && n !== 11) return `${n}st`
  if (n % 10 === 2 && n !== 12) return `${n}nd`
  if (n % 10 === 3 && n !== 13) return `${n}rd`
  return `${n}th`
}

const weekdayText = (w: string) => w.charAt(0).toUpperCase() + w.slice(1)

/** "week" for one, "2 weeks" for more: every week, every 2 weeks. */
function plural(n: number, what: string): string {
  return n === 1 ? what : `${n} ${what}s`
}

/** "1 event", "3 events". */
function count(n: number, what: string): string {
  return n === 1 ? `1 ${what}` : `${n} ${what}s`
}

/** The days and hours of an event's first time: "2026-11-24 10:00–11:30", "2026-12-03 to 2026-12-06". */
export function whenText(e: Pick<CalendarEvent, 'start' | 'end' | 'allDay' | 'from' | 'to' | 'hasEnd'>): string {
  if (e.allDay && e.start === e.end) return e.start
  if (e.allDay) return `${e.start} to ${e.end}`
  if (!e.hasEnd) return `${e.start} ${clock(e.from)}`
  // An end at midnight is the day before's last moment.
  const lastDay = e.to === 0 && e.end > e.start ? addDays(e.end, -1) : e.end
  if (e.start === e.end || lastDay === e.start) return `${e.start} ${clock(e.from)}–${clock(e.to)}`
  return `${e.start} ${clock(e.from)} to ${e.end} ${clock(e.to)}`
}

/** A rule in words: "every 2 weeks on Mon, Thu". */
export function ruleText(rp: Repeat | undefined): string {
  if (!rp) return ''
  let out = `every ${plural(rp.every, rp.unit)}`
  const on: string[] = rp.weekdays.map(weekdayText)
  for (const md of rp.monthDays) {
    if (md === -1) on.push('the last day')
    else if (md < 0) on.push(`the ${ordinal(-md)} day from the end`)
    else on.push(`the ${ordinal(md)}`)
  }
  for (const n of rp.nths) on.push(`the ${ordinal(n.n)} ${weekdayText(n.day)}`)
  if (on.length > 0) out += ` on ${on.join(', ')}`
  if (rp.cycle && rp.cycle.length > 0) out += `, ${cycleText(rp)}`
  if (rp.until) out += ` until ${rp.until}`
  else if (rp.times && rp.times > 0) out += `, ${count(rp.times, 'time')}`
  return out
}

/** A cycle: "3 weeks on and 1 off", or its pattern. */
function cycleText(rp: Repeat): string {
  const cycle = rp.cycle ?? []
  let on = 0
  while (on < cycle.length && cycle[on]) on++
  const simple = on > 0 && on < cycle.length && cycle.slice(on).every((c) => !c)
  if (simple) return `${count(on, rp.unit)} on and ${cycle.length - on} off`
  return `${rp.unit}s in a cycle ${cycle.map((c) => (c ? 'on' : 'off')).join(', ')}`
}

function changeText(ch: Change): string {
  if (ch.cancel) return 'cancelled'
  const parts: string[] = []
  if (ch.move) parts.push(`moved to ${ch.move}`)
  if (ch.time) parts.push(`at ${clock(ch.time.from)}${ch.time.hasEnd ? `–${clock(ch.time.to)}` : ''}`)
  if (ch.title) parts.push(`as ${JSON.stringify(ch.title)}`)
  if (ch.place) parts.push(`at ${ch.place}`)
  if (ch.note || ch.text) parts.push('with its own note')
  return parts.length === 0 ? 'unchanged' : parts.join(', ')
}

/** An event in words. */
export function eventText(e: CalendarEvent): string {
  let out = e.title
  if (e.id) out += ` [${e.id}]`
  if (!e.repeat) {
    out += ` — ${whenText(e)}`
    if (e.allDay) out += ' (all day)'
  } else {
    out += ` — ${ruleText(e.repeat)}, from ${whenText(e)}`
    if (e.allDay) out += ' (all day)'
    if (e.skip.length > 0) out += `; skips ${e.skip.join(', ')}`
    for (const p of e.pause) out += `; paused ${p.from} to ${p.to}`
    for (const ch of e.changes) out += `; on ${ch.date} ${changeText(ch)}`
  }
  if (e.place) out += `; at ${e.place}`
  if (e.note) out += `; note ${e.note}`
  if (e.tags.length > 0) out += `; tags ${e.tags.join(', ')}`
  return out
}

/** A source in words: rows of p/plans on due to due_end, title name, where status = open; due exists. */
export function sourceText(s: CalendarSource): string {
  let out = `rows of ${s.from} on ${s.date}`
  if (s.end) out += ` to ${s.end}`
  if (s.title) out += `, title ${s.title}`
  if (s.where.length > 0) out += `, where ${s.where.join('; ')}`
  return out
}

/** The zone of a calendar's hours: its own, or the host's. */
export function calendarZone(c: Calendar | null, hostZone: string): string {
  return c?.timezone && isZone(c.timezone) ? c.timezone : hostZone
}

/** A calendar in words, its events one per line; hostZone names the zone of a calendar without one. */
export function calendarText(c: Calendar | null, hostZone = 'UTC'): string {
  if (!c) return ''
  let out = c.title ? `${c.title} — ` : ''
  out += `calendar of ${count(c.events.length, 'event')}, times in ${calendarZone(c, hostZone)}`
  for (const e of c.events) out += `\n- ${eventText(e)}`
  for (const s of c.sources ?? []) out += `\n- ${sourceText(s)}`
  const bytes = new TextEncoder().encode(out)
  if (bytes.length > MAX_TEXT) {
    // Go cuts at a byte and drops a broken last character.
    const cut = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, MAX_TEXT)).replace(/�$/, '')
    out = `${cut}…`
  }
  return out
}
