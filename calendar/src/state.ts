import { parseDate, type CalendarDate } from './model/dates'
import { CALENDAR_VIEWS, type CalendarViewName } from './layout'

/** What a window of a calendar keeps in its address: the view and a day it shows. */
export interface CalendarState {
  view: CalendarViewName
  date: CalendarDate
}

/**
 * The state as a short token for a window's address, "week.2026-11-23":
 * only characters encodeURIComponent leaves as they are, so it reads in the
 * URL as written. A host puts it in its own arg (plancia's createArgCodec).
 */
export function encodeCalendarState(s: CalendarState): string {
  return `${s.view}.${s.date}`
}

/** The state of a token, or null when it does not read. */
export function decodeCalendarState(token: string): CalendarState | null {
  const cut = token.indexOf('.')
  if (cut < 0) return null
  const view = token.slice(0, cut) as CalendarViewName
  const date = parseDate(token.slice(cut + 1))
  if (!CALENDAR_VIEWS.includes(view) || !date) return null
  return { view, date }
}
