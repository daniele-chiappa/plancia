import type { CalendarDate, Weekday } from './dates'

/** The format this package reads and writes: `calendar: 1`. */
export const CALENDAR_VERSION = 1
/** The info string of a calendar's fence. */
export const CALENDAR_LANG = 'calendar'
/** The YAML of a calendar is at most this many bytes. */
export const MAX_BYTES = 256 << 10
/** A calendar has at most this many events. */
export const MAX_EVENTS = 2000
/** A cycle has at most this many periods. */
export const MAX_PATTERN = 104
/** The sources of a calendar, at most. */
export const MAX_SOURCES = 10

/** What a rule counts in. */
export type Unit = 'day' | 'week' | 'month' | 'year'
export const UNITS: readonly Unit[] = ['day', 'week', 'month', 'year']

/** A weekday of a month: n 1 to 5, or -1 for the last. */
export interface Nth {
  n: number
  day: Weekday
}

/** The rule of a repeated event. */
export interface Repeat {
  every: number
  unit: Unit
  /** The weekdays of a weekly rule, Monday first; of a monthly rule, every such weekday of the month. */
  weekdays: Weekday[]
  /** The days of a monthly rule: 1 to 31, or -1 to -31 from its end. */
  monthDays: number[]
  nths: Nth[]
  /** The last day a time may start on. */
  until?: CalendarDate
  /** How many times, the skipped ones too. */
  times?: number
  /** Periods on (true) and off, counted from the first date's. */
  cycle?: boolean[]
  /** The line of the rule in the block, 0 for one made by the editor. */
  line: number
}

/** Hours: minutes from midnight; to is from for a moment (hasEnd false). */
export interface Hours {
  from: number
  to: number
  hasEnd: boolean
}

/** One time of a repeated event changed by itself. */
export interface Change {
  /** The day the rule gives that time. */
  date: CalendarDate
  cancel?: boolean
  /** The day it starts on instead. */
  move?: CalendarDate
  /** Its hours instead. */
  time?: Hours
  title?: string
  place?: string
  note?: string
  text?: string
  line: number
}

/** A run of days, both included. */
export interface Period {
  from: CalendarDate
  to: CalendarDate
  line: number
}

/** An event, its short forms made full. */
export interface CalendarEvent {
  id?: string
  title: string
  place?: string
  /** A [[note]] or an http(s) address. */
  note?: string
  text?: string
  tags: string[]
  /** The first day, and the last (the same for one day). */
  start: CalendarDate
  end: CalendarDate
  /** No hours. Otherwise from is the minute it starts on start, to the one it ends on end. */
  allDay: boolean
  from: number
  to: number
  hasEnd: boolean
  repeat?: Repeat
  skip: CalendarDate[]
  pause: Period[]
  changes: Change[]
  /** The line of the event in the block, 0 for one made by the editor. */
  line: number
}

/**
 * A source of a calendar: the rows of a database the host brings to it,
 * on the days of their date fields. The host reads them and sends them
 * with the times; this package reads and writes the source only.
 */
export interface CalendarSource {
  /** The folder of the rows, as a view's. */
  from: string
  /** The field of a row's first day; end the field of its last, title of its title. */
  date: string
  end?: string
  title?: string
  /** The conditions on the rows, each "field op value". */
  where: string[]
  line: number
}

/** A calendar as read. */
export interface Calendar {
  version: number
  title?: string
  description?: string
  /** An IANA zone; without it, the host's. */
  timezone?: string
  events: CalendarEvent[]
  /** The sources, kept as written even when wrong, so that a save does not lose them. */
  sources?: CalendarSource[]
}

/** Something wrong with a calendar; line is 1-based in the block, 0 for the whole block. */
export interface CalendarProblem {
  line: number
  message: string
}

/** What the reader makes of a block: the calendar as far as it reads, null when it does not read at all. */
export interface ParseResult {
  calendar: Calendar | null
  problems: CalendarProblem[]
}

/**
 * A time of an event, as gosidian's POST /api/v1/calendar gives it: start
 * and end a day (YYYY-MM-DD, end the last day included) for a time without
 * hours, else a time with the calendar's offset (RFC 3339), end absent for
 * a moment.
 */
export interface CalendarTime {
  /** The index of the event in the block; not read for a row. */
  event: number
  id?: string
  title: string
  start: string
  end?: string
  all_day?: boolean
  place?: string
  link?: string
  text?: string
  tags?: string[]
  repeats?: boolean
  /** The day the rule gave a time changed or moved. */
  changed_from?: string
  /**
   * A row a source brings, not an event of the YAML: the host's name for
   * it (in gosidian, its note). A click on it emits open-row and a drag
   * move-row: the host changes it, and the editor never does.
   */
  row?: string
  /** The index of its source in the calendar's sources. */
  source?: number
  /** The fields of its days, for the host. */
  field?: string
  end_field?: string
  /** The host lets it be dragged to other days. */
  movable?: boolean
}

/** The times of the days shown, as the host gives them. */
export interface CalendarLoad {
  times: CalendarTime[]
  /** The problems the host found, those of the rules too. */
  problems?: CalendarProblem[]
  truncated?: boolean
}

/** The days shown, both included. */
export interface CalendarRange {
  from: CalendarDate
  to: CalendarDate
}
