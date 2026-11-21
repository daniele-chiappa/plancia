import { WEEKDAYS, weekdayIndex, type CalendarDate, type Weekday } from './model/dates'

// Days and hours in the words of a locale, with Intl. Days have no zone
// here: each is formatted as its UTC midnight in UTC.

function at(d: CalendarDate): Date {
  return new Date(`${d}T00:00:00Z`)
}

function fmt(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' })
  } catch {
    return new Intl.DateTimeFormat('en', { ...opts, timeZone: 'UTC' })
  }
}

/** "November 2026". */
export function monthTitle(d: CalendarDate, locale: string): string {
  return fmt(locale, { month: 'long', year: 'numeric' }).format(at(d))
}

/** "Monday 23 November 2026", as the locale orders it. */
export function longDate(d: CalendarDate, locale: string): string {
  return fmt(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(at(d))
}

/** "23 – 29 Nov 2026". */
export function rangeTitle(from: CalendarDate, to: CalendarDate, locale: string): string {
  const f = fmt(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  return typeof f.formatRange === 'function' ? f.formatRange(at(from), at(to)) : `${f.format(at(from))} – ${f.format(at(to))}`
}

/** The weekdays from first, short ("Mon") or long ("Monday"). */
export function weekdayNames(first: Weekday, locale: string, width: 'short' | 'long' = 'short'): string[] {
  const f = fmt(locale, { weekday: width })
  // 2026-11-23 is a Monday.
  const start = weekdayIndex(first)
  return WEEKDAYS.map((_, i) => f.format(at(`2026-11-${String(23 + ((start + i) % 7)).padStart(2, '0')}`)))
}

/** The name of a weekday. */
export function weekdayName(w: Weekday, locale: string, width: 'short' | 'long' = 'long'): string {
  return weekdayNames(w, locale, width)[0]!
}

/** "Mon 23". */
export function dayHeading(d: CalendarDate, locale: string): string {
  return fmt(locale, { weekday: 'short', day: 'numeric' }).format(at(d))
}

/** An hour of the day: 18:00, or 6:00 PM with hour12. */
export function hourText(minute: number, locale: string, hour12: boolean): string {
  const h = Math.floor(minute / 60) % 24
  const m = minute % 60
  const t = new Date(Date.UTC(2026, 10, 23, h, m))
  return fmt(locale, { hour: hour12 ? 'numeric' : '2-digit', minute: '2-digit', hour12 }).format(t)
}

/** The ordinal of a week of the month in words: 1st, 2nd…, or last. */
export function nthText(n: number): string {
  if (n === -1) return 'last'
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`
}
