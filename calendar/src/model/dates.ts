// Days of a calendar, without a zone: YYYY-MM-DD strings, which sort as
// they compare. The arithmetic runs on UTC midnights, where a day is always
// 24 hours.

/** A day, YYYY-MM-DD. */
export type CalendarDate = string

/** A weekday, by its three letters, Monday first as the format writes it. */
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export const WEEKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

const dateRe = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY = 86_400_000

function utc(y: number, m: number, d: number): Date {
  // setUTCFullYear, not Date.UTC, which reads the years 0 to 99 as 1900 to 1999.
  const t = new Date(0)
  t.setUTCFullYear(y, m - 1, d)
  return t
}

function format(t: Date): CalendarDate {
  const y = t.getUTCFullYear()
  const m = t.getUTCMonth() + 1
  const d = t.getUTCDate()
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** The day s says, as YYYY-MM-DD, or null when it is not a real day. */
export function parseDate(s: string): CalendarDate | null {
  const m = dateRe.exec(s.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const t = utc(y, mo, d)
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null
  return format(t)
}

function time(d: CalendarDate): Date {
  const m = dateRe.exec(d)
  if (!m) throw new Error(`not a day: ${d}`)
  return utc(Number(m[1]), Number(m[2]), Number(m[3]))
}

/** The day n days after d (before, for n < 0). */
export function addDays(d: CalendarDate, n: number): CalendarDate {
  return format(new Date(time(d).getTime() + n * DAY))
}

/** The number of days from a to b. */
export function daysBetween(a: CalendarDate, b: CalendarDate): number {
  return Math.round((time(b).getTime() - time(a).getTime()) / DAY)
}

/** The weekday of d. */
export function weekdayOf(d: CalendarDate): Weekday {
  return WEEKDAYS[(time(d).getUTCDay() + 6) % 7]!
}

/** 0 for Monday to 6 for Sunday. */
export function weekdayIndex(w: Weekday): number {
  return WEEKDAYS.indexOf(w)
}

/** The first day of d's week, for weeks that start on first. */
export function weekStart(d: CalendarDate, first: Weekday = 'mon'): CalendarDate {
  const back = (weekdayIndex(weekdayOf(d)) - weekdayIndex(first) + 7) % 7
  return addDays(d, -back)
}

/** The first day of d's month. */
export function monthStart(d: CalendarDate): CalendarDate {
  return `${d.slice(0, 7)}-01`
}

/** The day n months after d's month starts: its first day. */
export function addMonths(d: CalendarDate, n: number): CalendarDate {
  const t = time(monthStart(d))
  return format(utc(t.getUTCFullYear(), t.getUTCMonth() + 1 + n, 1))
}

/** The last day of d's month. */
export function monthEnd(d: CalendarDate): CalendarDate {
  return addDays(addMonths(d, 1), -1)
}

/** The months from a's to b's: 0 in the same month. */
export function monthsBetween(a: CalendarDate, b: CalendarDate): number {
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7))
}

/** The days from a to b, both included. */
export function daysOf(a: CalendarDate, b: CalendarDate): CalendarDate[] {
  const out: CalendarDate[] = []
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(d)
  return out
}

/** Today in the browser's zone, or in zone. */
export function today(zone?: string): CalendarDate {
  const now = new Date()
  if (zone) {
    try {
      // en-CA writes YYYY-MM-DD.
      return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
    } catch {
      // An unknown zone: the browser's.
    }
  }
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** Minutes from midnight as HH:MM. */
export function clock(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
