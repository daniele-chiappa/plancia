import type { Calendar, CalendarEvent } from './types'

// The reminders of the events, as gosidian's internal/calendar/remind.go
// reads them: a lead is how long before a time a reminder goes, 0 (at the
// start), or a number with m, h, d or w. The host works out when they go,
// and sends them; this package reads, writes and edits the leads only.

/** An event has at most this many reminders. */
export const MAX_REMINDERS = 4
/** A reminder goes at most four weeks before its time. */
export const MAX_LEAD_DAYS = 28
/** The hour of an all-day event's reminders without remind_at. */
export const DEFAULT_REMIND_AT = '09:00'

const leadRe = /^(\d{1,5})([mhdw])$/

/** Reads a lead: its text as the writer writes it ("0", "15m", "2h", "1d", "1w"), or null. */
export function parseLead(s: string): string | null {
  s = s.trim()
  if (s === '0') return '0'
  const m = leadRe.exec(s)
  if (!m) return null
  const n = Number(m[1])
  return n === 0 ? '0' : `${n}${m[2]}`
}

/** A lead counts days (d, w, or at the start): the only ones an all-day event takes. */
export function leadInDays(lead: string): boolean {
  return lead === '0' || lead.endsWith('d') || lead.endsWith('w')
}

function leadDays(lead: string): number {
  const n = parseInt(lead, 10)
  return lead.endsWith('d') ? n : lead.endsWith('w') ? 7 * n : 0
}

function leadMinutes(lead: string): number {
  const n = parseInt(lead, 10)
  return lead.endsWith('m') ? n : lead.endsWith('h') ? 60 * n : 0
}

export function leadTooLong(lead: string): boolean {
  return leadDays(lead) > MAX_LEAD_DAYS || leadMinutes(lead) > MAX_LEAD_DAYS * 24 * 60
}

/** The same for two leads that remind at the same time: 60m and 1h, 7d and 1w. */
export function leadKey(lead: string): number {
  return leadInDays(lead) ? -leadDays(lead) - 1 : leadMinutes(lead)
}

/** The reminders of an event: its own, or the calendar's; an all-day event takes those in days only. */
export function leadsOf(c: Pick<Calendar, 'remind'>, e: Pick<CalendarEvent, 'remind' | 'allDay'>): string[] {
  const leads = e.remind ?? c.remind ?? []
  return e.allDay ? leads.filter(leadInDays) : leads
}

/** Leads in words: "1d before, 15m before". */
export function leadsText(leads: string[]): string {
  return leads.map((l) => (l === '0' ? 'at the start' : `${l} before`)).join(', ')
}
