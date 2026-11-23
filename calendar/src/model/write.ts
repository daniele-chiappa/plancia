import { Document, isMap, isPair, isScalar, isSeq, type Node as YamlNode } from 'yaml'
import { addDays, clock } from './dates'
import { CALENDAR_VERSION, type Calendar, type CalendarEvent, type CalendarSource, type Change, type Hours, type Repeat } from './types'

// The writer of the format: a calendar in its full form, as the editor
// saves it. Its fields come in a fixed order, the small mappings and lists
// on one line ({every: 2 weeks, on: [mon, thu]}, [2026-12-24]), so a diff
// shows what changed. Comments written by hand are not kept: the host says
// so before the first save.

type Plain = string | number | boolean | Plain[] | { [k: string]: Plain }

function hours(h: Hours): string {
  return h.hasEnd ? `${clock(h.from)}-${clock(h.to)}` : clock(h.from)
}

function everyText(rp: Repeat): string {
  return rp.every === 1 ? rp.unit : `${rp.every} ${rp.unit}s`
}

function repeatOf(rp: Repeat): Record<string, Plain> {
  const out: Record<string, Plain> = { every: everyText(rp) }
  const on: Plain[] = [...rp.weekdays, ...rp.monthDays, ...rp.nths.map((n) => `${n.n === -1 ? 'last' : ordinal(n.n)} ${n.day}`)]
  if (on.length > 0) out.on = on
  if (rp.until) out.until = rp.until
  else if (rp.times) out.times = rp.times
  if (rp.cycle && rp.cycle.length > 0) {
    const ons = rp.cycle.findIndex((c) => !c)
    const simple = ons > 0 && rp.cycle.slice(ons).every((c) => !c)
    out.cycle = simple ? { on: ons, off: rp.cycle.length - ons } : rp.cycle.map((c) => (c ? 1 : 0))
  }
  return out
}

function ordinal(n: number): string {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`
}

function changeOf(ch: Change): Record<string, Plain> {
  const out: Record<string, Plain> = { date: ch.date }
  if (ch.cancel) {
    out.cancel = true
    return out
  }
  if (ch.move) out.move = ch.move
  if (ch.time) out.time = hours(ch.time)
  if (ch.title) out.title = ch.title
  if (ch.place) out.place = ch.place
  if (ch.note) out.note = ch.note
  if (ch.text) out.text = ch.text
  return out
}

/** The days and hours of an event in the shortest form that says them. */
function whenOf(e: CalendarEvent): Record<string, Plain> {
  if (e.allDay) return e.start === e.end ? { date: e.start } : { from: e.start, to: e.end }
  const pastMidnight = e.hasEnd && e.to <= e.from && e.end === addDays(e.start, 1)
  if (e.end === e.start || pastMidnight) {
    return { date: e.start, time: hours({ from: e.from, to: e.to, hasEnd: e.hasEnd }) }
  }
  // 24:00 does not go with a day: it is the next one's 00:00.
  const [end, to] = e.to === 1440 ? [addDays(e.end, 1), 0] : [e.end, e.to]
  return { from: `${e.start} ${clock(e.from)}`, to: `${end} ${clock(to)}` }
}

function eventOf(e: CalendarEvent): Record<string, Plain> {
  const out: Record<string, Plain> = { title: e.title }
  if (e.id) out.id = e.id
  Object.assign(out, whenOf(e))
  if (e.repeat) {
    out.repeat = repeatOf(e.repeat)
    if (e.skip.length > 0) out.skip = [...e.skip]
    if (e.pause.length > 0) out.pause = e.pause.map((p) => ({ from: p.from, to: p.to }))
    if (e.changes.length > 0) out.changes = e.changes.map(changeOf)
  }
  if (e.remind) out.remind = remindOf(e.remind)
  if (e.place) out.place = e.place
  if (e.note) out.note = e.note
  if (e.tags.length > 0) out.tags = [...e.tags]
  if (e.text) out.text = e.text
  return out
}

/** Leads as the writer writes them: one alone, or a list; 0 a number, as written by hand. */
function remindOf(leads: string[]): Plain {
  const value = (l: string): Plain => (l === '0' ? 0 : l)
  return leads.length === 1 ? value(leads[0]!) : leads.map(value)
}

function sourceOf(s: CalendarSource): Record<string, Plain> {
  const out: Record<string, Plain> = { from: s.from }
  if (s.date) out.date = s.date
  if (s.end) out.end = s.end
  if (s.title) out.title = s.title
  if (s.where.length > 0) out.where = [...s.where]
  return out
}

/** The keys whose value goes on one line. */
const flowKeys = new Set(['repeat', 'skip', 'tags', 'on', 'cycle', 'where', 'remind'])
/** The lists whose items each go on one line. */
const flowItems = new Set(['pause', 'changes'])

function setFlow(n: YamlNode | null | undefined) {
  if (isMap(n)) {
    for (const p of n.items) {
      if (!isPair(p) || !isScalar(p.key)) continue
      const key = String(p.key.value)
      const val = p.value as YamlNode | null
      if (flowKeys.has(key) && (isMap(val) || isSeq(val))) val.flow = true
      else if (flowItems.has(key) && isSeq(val)) {
        for (const it of val.items) if (isMap(it)) it.flow = true
      } else setFlow(val)
    }
  } else if (isSeq(n)) {
    for (const it of n.items) setFlow(it as YamlNode)
  }
}

/** The YAML of a calendar, in its full form. */
export function writeCalendar(c: Calendar): string {
  const top: Record<string, Plain> = { calendar: CALENDAR_VERSION }
  if (c.title) top.title = c.title
  if (c.description) top.description = c.description
  if (c.timezone) top.timezone = c.timezone
  if (c.remind && c.remind.length > 0) top.remind = remindOf(c.remind)
  if (c.remindAt) top.remind_at = c.remindAt
  top.events = c.events.map(eventOf)
  if (c.sources && c.sources.length > 0) top.sources = c.sources.map(sourceOf)
  const doc = new Document(top)
  setFlow(doc.contents as YamlNode)
  return doc.toString({ lineWidth: 0, flowCollectionPadding: false })
}
