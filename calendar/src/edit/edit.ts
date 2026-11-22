import {
  addDays,
  daysBetween,
  monthsBetween,
  weekStart,
  WEEKDAYS,
  weekdayIndex,
  weekdayOf,
  type CalendarDate,
} from '../model/dates'
import { idRe } from '../model/parse'
import type { Calendar, CalendarEvent, Change, Hours, Repeat } from '../model/types'

// The editor's changes to a calendar, as pure functions: each takes a
// calendar and gives a new one. They work on the rules as written, never on
// their days, which the host computes: a time of a repeated event is named
// by the day its rule gives it (OccurrenceRef), as changes: name it.

/** Which times of a repeated event a change is for. */
export type EditScope = 'this' | 'following' | 'all'

/** A time of an event: its index, and the day the rule gives the time. */
export interface OccurrenceRef {
  event: number
  date: CalendarDate
}

/**
 * A deep copy. The model is plain data (strings, numbers, booleans, arrays
 * and objects), and a copy through JSON takes it from Vue's reactive
 * proxies too, which structuredClone refuses.
 */
export function clone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T)
}

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** An id for a new event, from its title, unique in the calendar. */
export function makeId(c: Calendar, title: string, taken: Set<string> = new Set()): string {
  for (const e of c.events) if (e.id) taken.add(e.id)
  // The words of the title joined by dashes. A split, not a regexp that
  // trims dashes at the ends, which takes a time growing with the square
  // of a long run of them.
  let base = stripDiacritics(title)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join('-')
    .slice(0, 40)
  if (base.endsWith('-')) base = base.slice(0, -1)
  if (!idRe.test(base)) base = 'event'
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  return id
}

/** A new event on day: all day, or an hour from the minute from. */
export function newEvent(day: CalendarDate, from?: number): CalendarEvent {
  const timed = from !== undefined
  const to = timed ? Math.min(from + 60, 1440) : 0
  return {
    title: '',
    tags: [],
    start: day,
    end: day,
    allDay: !timed,
    from: timed ? from : 0,
    to,
    hasEnd: timed,
    skip: [],
    pause: [],
    changes: [],
    line: 0,
  }
}

/**
 * The event at index, which must be one of the list's: what a page passes
 * as an index, a string such as "__proto__" among them, never reads
 * another property of the list.
 */
export function eventIn(c: Calendar, index: number): CalendarEvent {
  const e = Number.isInteger(index) && index >= 0 ? c.events.at(index) : undefined
  if (!e) throw new RangeError(`no event at ${String(index)}`)
  return e
}

function withId(c: Calendar, e: CalendarEvent, index: number): CalendarEvent {
  if (e.id) return e
  const others: Calendar = { ...c, events: c.events.filter((_, i) => i !== index) }
  return { ...e, id: makeId(others, e.title) }
}

/** Adds an event, with an id; index is where it went. */
export function addEvent(c: Calendar, e: CalendarEvent): { calendar: Calendar; index: number } {
  const out = clone(c)
  const index = out.events.length
  out.events.push(withId(out, clone(e), index))
  return { calendar: out, index }
}

/** Replaces an event, giving it an id when it has none. */
export function replaceEvent(c: Calendar, index: number, e: CalendarEvent): Calendar {
  eventIn(c, index)
  const out = clone(c)
  out.events.splice(index, 1, withId(out, clone(e), index))
  return out
}

/** Takes an event out. */
export function removeEvent(c: Calendar, index: number): Calendar {
  eventIn(c, index)
  const out = clone(c)
  out.events.splice(index, 1)
  return out
}

function span(e: CalendarEvent): number {
  return daysBetween(e.start, e.end)
}

/** The change of the time ref names, if the event has one. */
export function changeAt(e: CalendarEvent, date: CalendarDate): Change | undefined {
  return e.changes.find((ch) => ch.date === date)
}

/**
 * An event as one of its times shows it: its days and hours, its title,
 * place, note and text, as the time's change has them. The form edits
 * this, and the scope of a save is worked out against it.
 */
export function eventAt(c: Calendar, ref: OccurrenceRef): CalendarEvent {
  const e = clone(eventIn(c, ref.event))
  if (!e.repeat) return e
  const ch = changeAt(e, ref.date)
  const start = ch?.move ?? ref.date
  const shown: CalendarEvent = { ...e, start, end: addDays(start, span(e)) }
  if (ch?.time) {
    shown.from = ch.time.from
    shown.to = ch.time.to
    shown.hasEnd = ch.time.hasEnd
    // The hours of a change keep the event's days; past midnight takes one more.
    if (shown.hasEnd && shown.to <= shown.from && span(e) === 0) shown.end = addDays(start, 1)
  }
  if (ch?.title) shown.title = ch.title
  if (ch?.place) shown.place = ch.place
  if (ch?.note) shown.note = ch.note
  if (ch?.text) shown.text = ch.text
  return shown
}

/** The minutes from an event's start to its end, its days counted. */
function endMinute(e: CalendarEvent): number {
  return daysBetween(e.start, e.end) * 1440 + (e.hasEnd ? e.to : e.from)
}

/** Says two events last the same: as many days, or as many minutes. */
function sameLength(a: CalendarEvent, b: CalendarEvent): boolean {
  if (a.allDay !== b.allDay) return false
  return a.allDay ? span(a) === span(b) : endMinute(a) - a.from === endMinute(b) - b.from
}

function sameHours(a: CalendarEvent, b: CalendarEvent): boolean {
  return a.allDay === b.allDay && (a.allDay || (a.from === b.from && a.hasEnd === b.hasEnd && sameLength(a, b)))
}

function sameList<T>(a: T[], b: T[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Says two rules are the same, their lines aside. */
export function sameRepeat(a: Repeat | undefined, b: Repeat | undefined): boolean {
  if (!a || !b) return !a && !b
  return (
    a.every === b.every &&
    a.unit === b.unit &&
    sameList(a.weekdays, b.weekdays) &&
    sameList(a.monthDays, b.monthDays) &&
    sameList(
      a.nths.map((n) => [n.n, n.day]),
      b.nths.map((n) => [n.n, n.day]),
    ) &&
    (a.until ?? '') === (b.until ?? '') &&
    (a.times ?? 0) === (b.times ?? 0) &&
    sameList(a.cycle ?? [], b.cycle ?? [])
  )
}

function samePauses(a: CalendarEvent, b: CalendarEvent): boolean {
  return sameList(
    a.pause.map((p) => [p.from, p.to]),
    b.pause.map((p) => [p.from, p.to]),
  )
}

/** Says the rule of the draft is not the shown one's: its repeat, skips or pauses. */
function ruleChanged(shown: CalendarEvent, draft: CalendarEvent): boolean {
  return !sameRepeat(shown.repeat, draft.repeat) || !sameList(shown.skip, draft.skip) || !samePauses(shown, draft)
}

/**
 * The event moved by days, its rule with it: its weekdays or days of the
 * month turned, its skips, pauses and changes moved. Null when the rule
 * cannot say it: weekdays that would cross the week of a rule every 2 or
 * more weeks or in a cycle, Nth weekdays of a month, days of the month
 * past the 28th or into another month.
 */
export function shiftEvent(e: CalendarEvent, days: number): CalendarEvent | null {
  const out = clone(e)
  if (days === 0) return out
  out.start = addDays(e.start, days)
  out.end = addDays(e.end, days)
  const rp = out.repeat
  if (rp) {
    if (rp.unit === 'week' && rp.weekdays.length > 1) {
      // Whole weeks move the rule as it is; the days left turn its
      // weekdays, which must stay in their week when the weeks are counted.
      const rest = ((days % 7) + 7) % 7
      const crosses = rp.weekdays.some((w) => weekdayIndex(w) + rest > 6)
      if (crosses && (rp.every > 1 || rp.cycle)) return null
      const turned = rp.weekdays.map((w) => weekdayIndex(w) + rest)
      rp.weekdays = [...new Set(turned.map((i) => WEEKDAYS[i % 7]!))].sort(
        (a, b) => weekdayIndex(a) - weekdayIndex(b),
      )
    } else if (rp.unit === 'week' && rp.weekdays.length === 1) {
      rp.weekdays = [weekdayOf(out.start)]
    } else if (rp.unit === 'month') {
      if (rp.nths.length > 0 || rp.weekdays.length > 0) return null
      if (out.start.slice(0, 7) !== e.start.slice(0, 7)) return null
      const day = Number(out.start.slice(8))
      if (day > 28 && rp.monthDays.length === 0) return null
      const moved = rp.monthDays.map((d) => d + days)
      if (moved.some((d, i) => (rp.monthDays[i]! > 0 ? d < 1 || d > 28 : d > -1 || d < -28))) return null
      rp.monthDays = moved
    } else if (rp.unit === 'year') {
      if (e.start.slice(5) === '02-29' || out.start.slice(5) === '02-29') return null
    }
    if (rp.until) rp.until = addDays(rp.until, days)
    out.skip = out.skip.map((d) => addDays(d, days))
    out.pause = out.pause.map((p) => ({ ...p, from: addDays(p.from, days), to: addDays(p.to, days) }))
    out.changes = out.changes.map((ch) => ({
      ...ch,
      date: addDays(ch.date, days),
      ...(ch.move ? { move: addDays(ch.move, days) } : {}),
    }))
  }
  return out
}

/** The periods of a rule from the first date's to date's: its phase in a cycle. */
function periodsBetween(rp: Repeat, from: CalendarDate, to: CalendarDate): number {
  switch (rp.unit) {
    case 'day':
      return daysBetween(from, to)
    case 'week':
      return daysBetween(weekStart(from), weekStart(to)) / 7
    case 'month':
      return monthsBetween(from, to)
    case 'year':
      return Number(to.slice(0, 4)) - Number(from.slice(0, 4))
  }
}

/** Which scopes can say the change from shown (the time as eventAt gives it) to draft. */
export function scopesFor(c: Calendar, ref: OccurrenceRef, draft: CalendarEvent): Record<EditScope, boolean> {
  const e = eventIn(c, ref.event)
  const shown = eventAt(c, ref)
  if (!e.repeat) return { this: false, following: false, all: true }
  const delta = daysBetween(shown.start, draft.start)
  const onlyThis =
    !ruleChanged(shown, draft) &&
    sameLength(shown, draft) &&
    sameList(shown.tags, draft.tags)
  const all = delta === 0 || ruleChanged(shown, draft) || shiftEvent(e, delta) !== null
  const following = ref.date > e.start && !e.repeat.times && (delta === 0 || ruleChanged(shown, draft) || shiftEvent(e, delta) !== null)
  return { this: onlyThis, following, all }
}

/** Applies to the whole event what the draft changes of the time shown. */
function applyAll(c: Calendar, ref: OccurrenceRef, draft: CalendarEvent): Calendar {
  const e = eventIn(c, ref.event)
  const shown = eventAt(c, ref)
  const delta = daysBetween(shown.start, draft.start)
  const rule = ruleChanged(shown, draft)
  let next: CalendarEvent
  if (rule) {
    next = clone(e)
    next.start = addDays(e.start, delta)
    next.repeat = draft.repeat && { ...clone(draft.repeat), line: e.repeat?.line ?? 0 }
    next.skip = [...draft.skip]
    next.pause = clone(draft.pause)
    if (!next.repeat) {
      // No rule left: one time, on the day the form shows.
      next.start = draft.start
      next.skip = []
      next.pause = []
      next.changes = []
    }
  } else {
    const moved = shiftEvent(e, delta)
    if (!moved) throw new Error('the rule cannot move by these days')
    next = moved
  }
  if (!sameHours(shown, draft)) {
    next.allDay = draft.allDay
    next.from = draft.allDay ? 0 : draft.from
    next.to = draft.allDay ? 0 : draft.to
    next.hasEnd = !draft.allDay && draft.hasEnd
    if (next.allDay) for (const ch of next.changes) delete ch.time
  }
  next.end = addDays(next.start, span(draft))
  if (draft.title !== shown.title) next.title = draft.title
  for (const k of ['place', 'note', 'text'] as const) {
    if ((draft[k] ?? '') !== (shown[k] ?? '')) {
      if (draft[k]) next[k] = draft[k]
      else delete next[k]
    }
  }
  next.tags = [...draft.tags]
  return replaceEvent(c, ref.event, next)
}

/** Writes in the event's changes what the draft changes of one time. */
function applyThis(c: Calendar, ref: OccurrenceRef, draft: CalendarEvent): Calendar {
  const out = clone(c)
  const e = eventIn(out, ref.event)
  const shown = eventAt(c, ref)
  const ch: Change = { ...(changeAt(e, ref.date) ?? { date: ref.date, line: 0 }) }
  delete ch.cancel
  if (draft.start !== shown.start) {
    if (draft.start === ref.date) delete ch.move
    else ch.move = draft.start
  }
  if (!sameHours(shown, draft)) {
    const h: Hours = { from: draft.from, to: draft.to, hasEnd: draft.hasEnd }
    if (h.from === e.from && h.to === e.to && h.hasEnd === e.hasEnd) delete ch.time
    else ch.time = h
  }
  if (draft.title !== shown.title) {
    if (draft.title === e.title) delete ch.title
    else ch.title = draft.title
  }
  for (const k of ['place', 'note', 'text'] as const) {
    if ((draft[k] ?? '') === (shown[k] ?? '')) continue
    if ((draft[k] ?? '') === (e[k] ?? '')) delete ch[k]
    else ch[k] = draft[k] ?? ''
  }
  const rest = e.changes.filter((x) => x.date !== ref.date)
  const empty = !ch.move && !ch.time && !ch.title && !ch.place && !ch.note && !ch.text
  e.changes = empty ? rest : [...rest, ch].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return replaceEvent(out, ref.event, e)
}

/**
 * Cuts a repeated event at date: the event keeps its times before, and a
 * new one, right after it, the times from date on, with its own id and the
 * cycle in the same phase. Gives the calendar and the new event's index.
 */
export function splitEvent(c: Calendar, index: number, date: CalendarDate): { calendar: Calendar; index: number } {
  const e = eventIn(c, index)
  const rp = e.repeat
  if (!rp || date <= e.start) throw new Error('only a repeated event, after its first time, is cut')
  if (rp.times) throw new Error('a rule of a number of times is not cut: its times before are not counted here')
  const head = clone(e)
  head.repeat = { ...clone(rp), until: addDays(date, -1) }
  head.skip = e.skip.filter((d) => d < date)
  head.pause = e.pause.filter((p) => p.from < date).map((p) => ({ ...p, to: p.to < date ? p.to : addDays(date, -1) }))
  head.changes = e.changes.filter((ch) => ch.date < date)
  const tail = clone(e)
  delete tail.id
  tail.line = 0
  tail.start = date
  tail.end = addDays(date, span(e))
  tail.repeat = { ...clone(rp), line: 0 }
  if (rp.cycle) {
    const n = rp.cycle.length
    const phase = ((periodsBetween(rp, e.start, date) % n) + n) % n
    tail.repeat.cycle = rp.cycle.map((_, i) => rp.cycle![(i + phase) % n]!)
  }
  tail.skip = e.skip.filter((d) => d >= date)
  tail.pause = e.pause.filter((p) => p.to >= date).map((p) => ({ ...p, line: 0, from: p.from >= date ? p.from : date }))
  tail.changes = e.changes.filter((ch) => ch.date >= date).map((ch) => ({ ...ch, line: 0 }))
  const out = clone(c)
  out.events.splice(index, 1, head)
  const taken = new Set<string>()
  if (e.id) taken.add(e.id)
  tail.id = makeId(out, e.id ?? e.title, taken)
  out.events.splice(index + 1, 0, tail)
  return { calendar: out, index: index + 1 }
}

/**
 * Saves the form's draft of the time ref names: for that time alone, from
 * it on, or for all the event's times (the only scope of an event without
 * a rule). scopesFor says which can say the draft.
 */
export function applyEdit(c: Calendar, ref: OccurrenceRef, draft: CalendarEvent, scope: EditScope): Calendar {
  const e = eventIn(c, ref.event)
  if (!e.repeat) {
    const next = clone(draft)
    next.changes = []
    if (!next.repeat) {
      next.skip = []
      next.pause = []
    }
    return replaceEvent(c, ref.event, { ...next, line: e.line })
  }
  if (scope === 'this') return applyThis(c, ref, draft)
  if (scope === 'following' && ref.date > e.start) {
    const rule = ruleChanged(eventAt(c, ref), draft)
    const cut = splitEvent(c, ref.event, ref.date)
    const tail = eventIn(cut.calendar, cut.index)
    const d = clone(draft)
    if (!rule) {
      // The rule as the cut left it: the cycle in its phase, the skips and pauses from the day on.
      d.repeat = clone(tail.repeat)
      d.skip = [...tail.skip]
      d.pause = clone(tail.pause)
    } else {
      d.skip = d.skip.filter((x) => x >= ref.date)
      d.pause = d.pause.filter((p) => p.to >= ref.date).map((p) => ({ ...p, from: p.from >= ref.date ? p.from : ref.date }))
    }
    return applyAll(cut.calendar, { event: cut.index, date: ref.date }, d)
  }
  return applyAll(c, ref, draft)
}

/** Deletes one time (a change that cancels it), the times from it on, or the event. */
export function deleteTime(c: Calendar, ref: OccurrenceRef, scope: EditScope): Calendar {
  const e = eventIn(c, ref.event)
  if (!e.repeat || scope === 'all' || (scope === 'following' && ref.date <= e.start)) return removeEvent(c, ref.event)
  if (scope === 'following') {
    const cut = splitEvent(c, ref.event, ref.date)
    return removeEvent(cut.calendar, cut.index)
  }
  const out = clone(c)
  const ev = eventIn(out, ref.event)
  ev.changes = [...ev.changes.filter((ch) => ch.date !== ref.date), { date: ref.date, cancel: true, line: 0 }].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  )
  return replaceEvent(out, ref.event, ev)
}

/** Which scopes a delete of the time ref names can take. */
export function deleteScopes(c: Calendar, ref: OccurrenceRef): Record<EditScope, boolean> {
  const e = eventIn(c, ref.event)
  if (!e.repeat) return { this: false, following: false, all: true }
  return { this: true, following: ref.date > e.start && !e.repeat.times, all: true }
}
