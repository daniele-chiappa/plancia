import { LineCounter, parseAllDocuments, isAlias, isMap, isPair, isScalar, isSeq, type Node as YamlNode } from 'yaml'
import { addDays, parseDate, weekdayIndex, type CalendarDate, type Weekday } from './dates'
import {
  CALENDAR_VERSION,
  MAX_BYTES,
  MAX_EVENTS,
  MAX_PATTERN,
  type Calendar,
  type CalendarEvent,
  type CalendarProblem,
  type Change,
  type Hours,
  type Nth,
  type ParseResult,
  type Repeat,
  type Unit,
} from './types'

// The reader of the calendar format, a port of gosidian's
// internal/calendar/parse.go: the same checks, the same messages, the same
// lines. The examples of gosidian's docs/calendars/examples are the
// contract of the two readers (test/fixtures holds a copy); a change here
// goes there too, and the other way round.
//
// One part stays with the server: the checks that need the rule's days
// worked out (the first date is not one of them, a skip or a change of a
// day the rule does not give). The host sends those with the times.

export const idRe = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
const clockRe = /^(\d{1,2}):(\d{2})(?::00)?$/ // seconds, when written, are 00
const everyRe = /^(?:(\d+)\s*)?([a-z]+)$/
const nthRe = /^(1st|2nd|3rd|4th|5th|last)\s+([a-z]+)$/
const intRe = /^[+-]?\d+$/
const wikiLinkRe = /\[\[([^\]]+)\]\]/g

const topFields = ['calendar', 'title', 'description', 'timezone', 'events']
const eventFields = ['id', 'title', 'date', 'time', 'from', 'to', 'repeat', 'skip', 'pause', 'changes', 'place', 'note', 'tags', 'text']
const repeatFields = ['every', 'on', 'until', 'times', 'cycle']
const changeFields = ['date', 'cancel', 'move', 'time', 'title', 'place', 'note', 'text']

const weekdayNames: Record<string, Weekday> = {
  mon: 'mon', monday: 'mon',
  tue: 'tue', tuesday: 'tue',
  wed: 'wed', wednesday: 'wed',
  thu: 'thu', thursday: 'thu',
  fri: 'fri', friday: 'fri',
  sat: 'sat', saturday: 'sat',
  sun: 'sun', sunday: 'sun',
}

const unitNames: Record<string, Unit> = {
  day: 'day', days: 'day', daily: 'day',
  week: 'week', weeks: 'week', weekly: 'week',
  month: 'month', months: 'month', monthly: 'month',
  year: 'year', years: 'year', yearly: 'year',
}

const nthNames: Record<string, number> = { '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5, last: -1 }

/** A node of the YAML as gosidian's reader sees it (yaml.v3's Node). */
interface YNode {
  kind: 'scalar' | 'map' | 'seq' | 'alias'
  line: number
  /** The scalar's text as written (a number stays as typed), '' otherwise. */
  text: string
  /** A scalar whose value is null: empty, ~ or null. */
  isNull: boolean
  pairs: { key: YNode; val: YNode }[]
  items: YNode[]
}

function convert(n: YamlNode | null | undefined, lc: LineCounter, fallbackLine: number): YNode {
  const line = n?.range ? lc.linePos(n.range[0]).line : fallbackLine
  const out: YNode = { kind: 'scalar', line, text: '', isNull: true, pairs: [], items: [] }
  if (!n) return out
  if (isScalar(n)) {
    out.isNull = n.value === null || n.value === undefined
    out.text = typeof n.value === 'string' ? n.value : out.isNull ? (n.source ?? '') : (n.source ?? String(n.value))
    return out
  }
  out.isNull = false
  if (isMap(n)) {
    out.kind = 'map'
    for (const p of n.items) {
      if (!isPair(p)) continue
      const key = convert(p.key as YamlNode | null, lc, line)
      out.pairs.push({ key, val: convert(p.value as YamlNode | null, lc, key.line) })
    }
  } else if (isSeq(n)) {
    out.kind = 'seq'
    for (const it of n.items) out.items.push(convert(it as YamlNode | null, lc, line))
  } else if (isAlias(n)) {
    out.kind = 'alias'
  }
  return out
}

/** Go's %q, for the messages: a double-quoted string. */
function q(s: string): string {
  return JSON.stringify(s)
}

function utf8Length(s: string): number {
  return new TextEncoder().encode(s).length
}

/** Go's strconv.Atoi: an integer as written, or null. */
function atoi(s: string): number | null {
  return intRe.test(s) ? Number(s) : null
}

/** Reads HH:MM as minutes from midnight; 24:00 is the end of the day. */
export function parseClock(s: string): number | null {
  const m = clockRe.exec(s.trim())
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (mi > 59 || h > 24 || (h === 24 && mi !== 0)) return null
  return h * 60 + mi
}

/** Reads "HH:MM-HH:MM" (an en dash too) or "HH:MM". */
export function parseHours(s: string): Hours | null {
  s = s.replaceAll('–', '-')
  const cut = s.indexOf('-')
  const a = cut < 0 ? s : s.slice(0, cut)
  const from = parseClock(a)
  if (from === null || from === 1440) return null
  if (cut < 0) return { from, to: from, hasEnd: false }
  const to = parseClock(s.slice(cut + 1))
  if (to === null) return null
  return { from, to, hasEnd: true }
}

interface Moment {
  date: CalendarDate | null
  minute: number
  hasTime: boolean
}

/** Reads a date, a date and an hour ("2026-11-27 22:00", or with T), or an hour alone. */
function parseMoment(s: string): Moment | null {
  s = s.trim()
  const day = parseDate(s)
  if (day) return { date: day, minute: 0, hasTime: false }
  const m = parseClock(s)
  if (m !== null) return { date: null, minute: m, hasTime: true }
  let cut = s.indexOf(' ')
  if (cut < 0) cut = s.indexOf('T')
  if (cut < 0) return null
  const d = parseDate(s.slice(0, cut))
  const t = parseClock(s.slice(cut + 1).trim())
  if (!d || t === null || t === 1440) return null
  return { date: d, minute: t, hasTime: true }
}

/** Says a zone is one of the IANA database's, as Go's time.LoadLocation reads them. */
export function isZone(zone: string): boolean {
  if (zone === 'Local' || !/^[A-Za-z]/.test(zone)) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/** Says a note link is a [[note]] or an http(s) address. */
export function isLink(link: string): boolean {
  return (
    link === '' ||
    link.startsWith('http://') ||
    link.startsWith('https://') ||
    (link.startsWith('[[') && link.endsWith(']]') && (link.match(wikiLinkRe)?.length ?? 0) === 1)
  )
}

class Reader {
  problems: CalendarProblem[] = []
  /** id → line of its first use */
  ids = new Map<string, number>()

  bad(n: YNode | undefined, message: string) {
    this.problems.push({ line: n?.line ?? 0, message })
  }

  /** Reads a mapping whose keys must be in allowed. */
  fields(n: YNode, what: string, allowed: string[]): Map<string, YNode> {
    const out = new Map<string, YNode>()
    if (n.kind !== 'map') {
      this.bad(n, `${what} is a mapping (key: value)`)
      return out
    }
    for (const p of n.pairs) {
      const k = p.key.text
      if (!allowed.includes(k)) {
        this.bad(p.key, `${what} has no field ${q(k)} (it has ${allowed.join(', ')})`)
        continue
      }
      out.set(k, p.val)
    }
    return out
  }

  str(n: YNode | undefined, what: string): string {
    if (!n || (n.kind === 'scalar' && n.isNull)) return ''
    if (n.kind !== 'scalar') {
      this.bad(n, `${what} is a text`)
      return ''
    }
    return n.text.trim()
  }

  seq(n: YNode | undefined, what: string): YNode[] {
    if (!n || (n.kind === 'scalar' && n.isNull)) return []
    if (n.kind !== 'seq') {
      this.bad(n, `${what} is a list`)
      return []
    }
    return n.items
  }

  /** Reads a list, or a single value as a list of one. */
  list(n: YNode | undefined): YNode[] {
    if (!n || (n.kind === 'scalar' && n.isNull)) return []
    return n.kind === 'seq' ? n.items : [n]
  }

  date(n: YNode | undefined, what: string): CalendarDate | null {
    const v = this.str(n, what)
    const d = parseDate(v)
    if (!d) this.bad(n, `${what} ${q(v)} is a date, YYYY-MM-DD`)
    return d
  }

  link(n: YNode | undefined, what: string): string {
    const link = this.str(n, what)
    if (isLink(link)) return link
    this.bad(n, `${what} ${q(link)} is a [[note]] or an http(s) address`)
    return ''
  }

  event(n: YNode): CalendarEvent | null {
    const e: CalendarEvent = {
      title: '', tags: [], start: '', end: '', allDay: false, from: 0, to: 0, hasEnd: false,
      skip: [], pause: [], changes: [], line: n.line,
    }
    const f = this.fields(n, 'an event', eventFields)
    if (n.kind !== 'map') return null
    e.title = this.str(f.get('title'), 'title')
    if (e.title === '') this.bad(n, 'an event has a title')
    const idn = f.get('id')
    if (idn) {
      const id = this.str(idn, 'id')
      e.id = id
      const first = this.ids.get(id)
      if (!idRe.test(id)) this.bad(idn, `id ${q(id)} is letters, digits, - and _ (at most 64)`)
      else if (first !== undefined) this.bad(idn, `id ${q(id)} is used twice (first at line ${first})`)
      else this.ids.set(id, idn.line)
    }
    const place = this.str(f.get('place'), 'place')
    if (place) e.place = place
    const note = this.link(f.get('note'), 'note')
    if (note) e.note = note
    const text = this.str(f.get('text'), 'text')
    if (text) e.text = text
    for (const t of this.list(f.get('tags'))) {
      const v = this.str(t, 'a tag')
      if (v !== '') e.tags.push(v)
    }
    if (!this.when(e, n, f)) return null
    const rn = f.get('repeat')
    if (rn && !(rn.kind === 'scalar' && rn.isNull)) {
      const rp = this.repeat(e, rn)
      if (rp) e.repeat = rp
    }
    for (const s of this.list(f.get('skip'))) {
      const d = this.date(s, 'skip')
      if (d) e.skip.push(d)
    }
    for (const p of this.seq(f.get('pause'), 'pause')) {
      const pf = this.fields(p, 'a pause', ['from', 'to'])
      const from = this.date(pf.get('from'), "a pause's from")
      const to = this.date(pf.get('to'), "a pause's to")
      if (!from || !to) continue
      if (to < from) this.bad(p, `the pause ends (${to}) before it starts (${from})`)
      else e.pause.push({ from, to, line: p.line })
    }
    for (const cn of this.seq(f.get('changes'), 'changes')) {
      const ch = this.change(e, cn)
      if (ch) e.changes.push(ch)
    }
    if (!e.repeat && (e.skip.length > 0 || e.pause.length > 0 || e.changes.length > 0)) {
      this.bad(n, 'skip, pause and changes are for an event that repeats: this one has no repeat')
      e.skip = []
      e.pause = []
      e.changes = []
    }
    return e
  }

  /** Reads the days and hours of an event: date with time, or from and to. */
  when(e: CalendarEvent, n: YNode, f: Map<string, YNode>): boolean {
    const dn = f.get('date')
    const tn = f.get('time')
    const fn = f.get('from')
    const ton = f.get('to')
    if (dn && (fn || ton)) {
      this.bad(n, 'an event has date (with time) or from and to, not both')
      return false
    }
    if (dn) {
      const d = this.date(dn, 'date')
      if (!d) return false
      e.start = d
      e.end = d
      e.allDay = true
      if (tn) {
        const v = this.str(tn, 'time')
        const h = parseHours(v)
        if (!h) {
          this.bad(tn, `time ${q(v)} is HH:MM-HH:MM, or HH:MM for a moment`)
          return true
        }
        e.allDay = false
        e.from = h.from
        e.to = h.to
        e.hasEnd = h.hasEnd
        if (h.hasEnd && h.to <= h.from) e.end = addDays(d, 1) // past midnight
      }
      return true
    }
    if (fn) {
      if (tn) this.bad(tn, 'time goes with date; with from and to the hours are in them (2026-11-27 22:00)')
      const fv = this.str(fn, 'from')
      const m = parseMoment(fv)
      if (!m || !m.date) {
        this.bad(fn, `from ${q(fv)} is a date (YYYY-MM-DD) or a date and an hour (YYYY-MM-DD HH:MM)`)
        return false
      }
      const day = m.date
      e.start = day
      e.end = day
      if (!m.hasTime) {
        e.allDay = true
        if (!ton) return true
        const to = this.date(ton, 'to')
        if (!to) return true
        if (to < day) {
          this.bad(ton, `to (${to}) is before from (${day})`)
          return true
        }
        e.end = to
        return true
      }
      e.from = m.minute
      e.to = m.minute
      if (!ton) return true
      const tv = this.str(ton, 'to')
      const t = parseMoment(tv)
      if (!t || !t.hasTime) {
        this.bad(ton, `to ${q(tv)} is an hour (HH:MM) or a date and an hour, as from is`)
      } else if (!t.date) {
        e.to = t.minute
        e.hasEnd = true
        if (t.minute <= m.minute) e.end = addDays(day, 1)
      } else if (t.date < day || (t.date === day && t.minute < m.minute)) {
        this.bad(ton, `to (${tv}) is before from (${fv})`)
      } else {
        e.end = t.date
        e.to = t.minute
        e.hasEnd = true
      }
      return true
    }
    if (ton) {
      this.bad(ton, 'to goes with from')
      return false
    }
    this.bad(n, 'an event has a date (YYYY-MM-DD), or from and to')
    return false
  }

  /** Reads a rule: a mapping, or its every alone ("2 weeks"). */
  repeat(e: CalendarEvent, n: YNode): Repeat | null {
    const rp: Repeat = { every: 1, unit: 'day', weekdays: [], monthDays: [], nths: [], line: n.line }
    const f = n.kind === 'scalar' ? new Map([['every', n]]) : this.fields(n, 'repeat', repeatFields)
    const en = f.get('every')
    if (!en) {
      this.bad(n, 'repeat has every: day, week, month or year, with a number before for more (2 weeks)')
      return null
    }
    const v = this.str(en, 'every').toLowerCase()
    const m = everyRe.exec(v.startsWith('every ') ? v.slice('every '.length) : v)
    const unit = m ? unitNames[m[2]!] : undefined
    if (!m || !unit) {
      this.bad(en, `every ${q(v)} is day, week, month or year, with a number before for more (2 weeks)`)
      return null
    }
    rp.unit = unit
    if (m[1]) {
      const k = Number(m[1])
      if (k < 1 || k > 1000) {
        this.bad(en, `every ${q(v)}: the number is 1 to 1000`)
        return null
      }
      rp.every = k
    }
    const on = f.get('on')
    if (on && !(on.kind === 'scalar' && on.isNull)) this.on(rp, on)
    const un = f.get('until')
    const tn = f.get('times')
    if (un && tn) this.bad(n, 'repeat has until or times, not both')
    if (un) {
      const d = this.date(un, 'until')
      if (d) {
        if (d < e.start) this.bad(un, `until (${d}) is before the first date (${e.start})`)
        else rp.until = d
      }
    }
    if (tn && !un) {
      const k = atoi(this.str(tn, 'times'))
      if (k === null || k < 1) this.bad(tn, 'times is a number of times, 1 or more')
      else rp.times = k
    }
    const cn = f.get('cycle')
    if (cn && !(cn.kind === 'scalar' && cn.isNull)) this.cycle(rp, cn)
    return rp
  }

  on(rp: Repeat, n: YNode) {
    for (const it of this.list(n)) {
      const v = this.str(it, 'on').toLowerCase()
      if (v === '') continue
      const wd = weekdayNames[v]
      if (wd) {
        if (rp.unit !== 'week' && rp.unit !== 'month') {
          this.bad(it, `on ${q(v)}: a rule of every ${rp.unit} repeats on the first date's day; weekdays are for weeks and months`)
          continue
        }
        if (!rp.weekdays.includes(wd)) rp.weekdays.push(wd)
        continue
      }
      if (rp.unit === 'week') {
        this.bad(it, `on ${q(v)}: a weekly rule takes weekdays (mon, tue, …)`)
        continue
      }
      if (rp.unit !== 'month') {
        this.bad(it, `on ${q(v)}: a rule of every ${rp.unit} repeats on the first date's day, without on`)
        continue
      }
      const k = atoi(v)
      if (k !== null) {
        if (k === 0 || k < -31 || k > 31) {
          this.bad(it, `on ${k}: a day of the month is 1 to 31, or -1 to -31 from its end`)
          continue
        }
        if (!rp.monthDays.includes(k)) rp.monthDays.push(k)
        continue
      }
      const m = nthRe.exec(v)
      const day = m ? weekdayNames[m[2]!] : undefined
      if (m && day) {
        const nth: Nth = { n: nthNames[m[1]!]!, day }
        if (!rp.nths.some((x) => x.n === nth.n && x.day === nth.day)) rp.nths.push(nth)
        continue
      }
      this.bad(it, `on ${q(v)}: in a month, a day (15, -1 for the last), a weekday (mon) or one of its weeks (2nd tue, last fri)`)
    }
    if (rp.nths.length > 0 && rp.weekdays.length > 0) {
      this.bad(n, "on: a month's weekdays (mon) and its Nth weekdays (2nd tue) do not go together")
    }
    if (rp.monthDays.length > 0 && (rp.nths.length > 0 || rp.weekdays.length > 0)) {
      this.bad(n, "on: a month's days (15) and its weekdays do not go together")
    }
    rp.weekdays.sort((a, b) => weekdayIndex(a) - weekdayIndex(b))
  }

  /** Reads {on: N, off: M} or a list of 1 and 0 (or true and false). */
  cycle(rp: Repeat, n: YNode) {
    if (rp.every !== 1) {
      this.bad(n, `cycle counts the ${rp.unit}s one by one: it goes with every: ${rp.unit}, not every: ${rp.every} ${rp.unit}s`)
      return
    }
    const pattern: boolean[] = []
    if (n.kind === 'map') {
      const f = this.fields(n, 'cycle', ['on', 'off'])
      const on = atoi(this.str(f.get('on'), "cycle's on"))
      const off = atoi(this.str(f.get('off'), "cycle's off"))
      if (on === null || off === null || on < 1 || off < 1 || on + off > MAX_PATTERN) {
        this.bad(n, `cycle is {on: N, off: M}, with N and M 1 or more and at most ${MAX_PATTERN} together`)
        return
      }
      for (let i = 0; i < on + off; i++) pattern.push(i < on)
    } else if (n.kind === 'seq') {
      for (const it of n.items) {
        const v = this.str(it, "a cycle's period").toLowerCase()
        if (['1', 'true', 'yes', 'on'].includes(v)) pattern.push(true)
        else if (['0', 'false', 'no', 'off'].includes(v)) pattern.push(false)
        else {
          this.bad(it, "a cycle's period is 1 (on) or 0 (off)")
          return
        }
      }
      if (pattern.length < 2 || pattern.length > MAX_PATTERN || !pattern.includes(true)) {
        this.bad(n, `a cycle has 2 to ${MAX_PATTERN} periods, one of them on (1)`)
        return
      }
    } else {
      this.bad(n, 'cycle is {on: N, off: M} or a list of 1 and 0')
      return
    }
    rp.cycle = pattern
  }

  change(e: CalendarEvent, n: YNode): Change | null {
    const f = this.fields(n, 'a change', changeFields)
    if (n.kind !== 'map') return null
    const d = this.date(f.get('date'), "a change's date")
    if (!d) return null
    const ch: Change = { date: d, line: n.line }
    const cn = f.get('cancel')
    if (cn) {
      const v = this.str(cn, 'cancel').toLowerCase()
      if (v === 'true' || v === 'yes') ch.cancel = true
      else if (v !== 'false' && v !== 'no' && v !== '') this.bad(cn, 'cancel is true or false')
    }
    const mn = f.get('move')
    if (mn) {
      const md = this.date(mn, 'move')
      if (md) ch.move = md
    }
    const tn = f.get('time')
    if (tn) {
      const v = this.str(tn, 'time')
      const h = parseHours(v)
      if (!h) this.bad(tn, `time ${q(v)} is HH:MM-HH:MM, or HH:MM for a moment`)
      else if (e.allDay) this.bad(tn, 'time changes the hours of an event with hours: this one is all day')
      else ch.time = h
    }
    const title = this.str(f.get('title'), 'title')
    if (title) ch.title = title
    const place = this.str(f.get('place'), 'place')
    if (place) ch.place = place
    const note = this.link(f.get('note'), 'note')
    if (note) ch.note = note
    const text = this.str(f.get('text'), 'text')
    if (text) ch.text = text
    if (ch.cancel && (ch.move || ch.time || ch.title || ch.place || ch.note || ch.text)) {
      this.bad(n, 'a change that cancels a time changes nothing else')
    }
    return ch
  }

  /** The checks of the rule that need no day worked out: a time changed twice. */
  checkChanges(e: CalendarEvent) {
    if (!e.repeat) return
    const seen = new Map<CalendarDate, number>()
    for (const ch of e.changes) {
      const line = seen.get(ch.date)
      if (line !== undefined) {
        this.problems.push({ line: ch.line, message: `the time of ${ch.date} is changed twice (first at line ${line})` })
        continue
      }
      seen.set(ch.date, ch.line)
    }
  }
}

/**
 * Says a problem is one of those only the server finds, since they need the
 * rule's days worked out: the first date that is not one of them, a skip
 * or a change of a day the rule does not give, a rule with no day at all.
 */
export function isRuleProblem(message: string): boolean {
  return (
    message.startsWith('the first date, ') ||
    message.startsWith('the rule gives no date from ') ||
    /^skip \S+ is not a date of the rule$/.test(message) ||
    /^the change of \S+: the rule has no time on /.test(message)
  )
}

/** An empty calendar, as a new note starts. */
export function emptyCalendar(): Calendar {
  return { version: CALENDAR_VERSION, events: [] }
}

/**
 * Reads a calendar's YAML. The calendar comes back as far as it reads, with
 * what is wrong in it; null when it does not read at all.
 */
export function parseCalendar(src: string): ParseResult {
  const size = utf8Length(src)
  if (size > MAX_BYTES) {
    return { calendar: null, problems: [{ line: 0, message: `the calendar is ${size} bytes, at most ${MAX_BYTES}` }] }
  }
  const lc = new LineCounter()
  const docs = parseAllDocuments(src, { lineCounter: lc, prettyErrors: true })
  const doc = Array.isArray(docs) ? docs[0] : undefined
  const err = doc?.errors[0]
  if (err) {
    const line = err.linePos?.[0]?.line ?? 0
    const msg = err.message.split('\n')[0]!.replace(/ at line \d+, column \d+:?$/, '')
    return { calendar: null, problems: [{ line, message: `not valid YAML: ${msg}` }] }
  }
  const c = emptyCalendar()
  if (!doc || doc.contents === null || doc.contents === undefined) return { calendar: c, problems: [] }
  const root = convert(doc.contents as YamlNode, lc, 0)
  const r = new Reader()
  if (root.kind !== 'map') {
    r.bad(root, 'a calendar is a mapping: calendar: 1, then events')
    return { calendar: null, problems: r.problems }
  }
  const top = r.fields(root, 'the calendar', topFields)
  const v = top.get('calendar')
  if (v && atoi(v.text) !== CALENDAR_VERSION) {
    r.bad(v, `calendar: ${v.text} is a format this server does not read (it reads ${CALENDAR_VERSION})`)
    return { calendar: null, problems: r.problems }
  }
  const title = r.str(top.get('title'), 'title')
  if (title) c.title = title
  const description = r.str(top.get('description'), 'description')
  if (description) c.description = description
  const tz = top.get('timezone')
  if (tz) {
    const zone = r.str(tz, 'timezone')
    if (zone !== '') {
      // Kept as written even when wrong, so that a save does not lose it.
      c.timezone = zone
      if (!isZone(zone)) r.bad(tz, `timezone ${q(zone)} is not a zone of the IANA database, as Europe/Rome`)
    }
  }
  let events = r.seq(top.get('events'), 'events')
  if (events.length > MAX_EVENTS) {
    r.bad(top.get('events'), `the calendar has ${events.length} events, at most ${MAX_EVENTS}`)
    events = events.slice(0, MAX_EVENTS)
  }
  for (const en of events) {
    const e = r.event(en)
    if (e) c.events.push(e)
  }
  for (const e of c.events) r.checkChanges(e)
  // In the order of the lines, the whole block's first.
  const problems = r.problems.map((p, i) => ({ p, i }))
  problems.sort((a, b) => a.p.line - b.p.line || a.i - b.i)
  return { calendar: c, problems: problems.map((x) => x.p) }
}
