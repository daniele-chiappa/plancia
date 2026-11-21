import type { CalendarViewName } from './layout'
import type { EditScope } from './edit/edit'
import type { Unit } from './model/types'

/** The words of the calendar, English by default; a consumer passes its own. */
export interface CalendarLabels {
  views: Record<CalendarViewName, string>
  /** The name of the group of the view buttons. */
  viewsName: string
  previous: string
  next: string
  today: string
  newEvent: string
  /** The name of the calendar's grid of days, for a screen reader. */
  grid: string
  allDay: string
  /** "+3": the times of a day that did not fit; the button opens the day. */
  more: (n: number) => string
  /** A day's name for a screen reader, with how many times it has. */
  dayName: (day: string, count: number) => string
  noTimes: string
  loading: string
  failed: string
  truncated: string
  problems: string
  line: string
  repeats: string
  changed: string
  // The form.
  editEvent: string
  /** Said in the form of one time of a repeated event. */
  oneTime: string
  title: string
  date: string
  start: string
  end: string
  startTime: string
  endTime: string
  repeat: string
  repeatNone: string
  units: Record<Unit, string>
  every: string
  on: string
  monthDay: (day: number) => string
  monthNth: (nth: string, weekday: string) => string
  monthLast: string
  monthAsWritten: string
  ends: string
  endsNever: string
  endsOn: string
  endsAfter: string
  times: string
  cycle: string
  cycleNone: string
  cycleOn: string
  cycleOff: string
  cycleAsWritten: string
  skip: string
  pause: string
  add: string
  remove: string
  from: string
  to: string
  place: string
  note: string
  noteHelp: string
  tags: string
  tagsHelp: string
  text: string
  save: string
  cancel: string
  delete: string
  close: string
  // The form's checks.
  needTitle: string
  needDate: string
  needTime: string
  needTimes: string
  endBeforeStart: string
  badNote: string
  // The choice of the times a change is for.
  scopeSave: string
  scopeDelete: string
  scopeMove: string
  scopes: Record<EditScope, string>
  scopeNoThis: string
  scopeNoFollowing: string
  scopeNoAll: string
  ok: string
  readOnly: string
}

export const DEFAULT_CALENDAR_LABELS: CalendarLabels = {
  views: { month: 'Month', week: 'Week', day: 'Day', list: 'List' },
  viewsName: 'View',
  previous: 'Previous',
  next: 'Next',
  today: 'Today',
  newEvent: 'New event',
  grid: 'Calendar',
  allDay: 'All day',
  more: (n) => `+${n}`,
  dayName: (day, count) => (count === 0 ? day : `${day}, ${count === 1 ? '1 event' : `${count} events`}`),
  noTimes: 'Nothing on these days.',
  loading: 'Loading…',
  failed: 'The times could not be loaded:',
  truncated: 'Too many times: some are not shown.',
  problems: 'This calendar has problems:',
  line: 'line',
  repeats: 'repeats',
  changed: 'changed',
  editEvent: 'Event',
  oneTime: "One time of an event that repeats: the days and hours shown are this time's.",
  title: 'Title',
  date: 'Date',
  start: 'Starts',
  end: 'Ends',
  startTime: 'From',
  endTime: 'To',
  repeat: 'Repeat',
  repeatNone: 'Does not repeat',
  units: { day: 'Every day', week: 'Every week', month: 'Every month', year: 'Every year' },
  every: 'Every',
  on: 'On',
  monthDay: (day) => `Day ${day}`,
  monthNth: (nth, weekday) => `The ${nth} ${weekday}`,
  monthLast: 'The last day',
  monthAsWritten: 'As written',
  ends: 'Ends',
  endsNever: 'Never',
  endsOn: 'On',
  endsAfter: 'After',
  times: 'times',
  cycle: 'Cycle',
  cycleNone: 'No cycle',
  cycleOn: 'on',
  cycleOff: 'off',
  cycleAsWritten: 'A cycle as written',
  skip: 'Days skipped',
  pause: 'Pauses',
  add: 'Add',
  remove: 'Remove',
  from: 'From',
  to: 'to',
  place: 'Place',
  note: 'Note',
  noteHelp: '[[note]] or an http(s) address',
  tags: 'Tags',
  tagsHelp: 'separated by commas',
  text: 'Text',
  save: 'Save',
  cancel: 'Cancel',
  delete: 'Delete',
  close: 'Close',
  needTitle: 'An event has a title.',
  needDate: 'A day is YYYY-MM-DD.',
  needTime: 'An hour is HH:MM.',
  needTimes: 'At least once.',
  endBeforeStart: 'The end is before the start.',
  badNote: 'A note is a [[note]] or an http(s) address.',
  scopeSave: 'Save the change for',
  scopeDelete: 'Delete',
  scopeMove: 'Move',
  scopes: { this: 'This time only', following: 'This time and the following', all: 'All the times' },
  scopeNoThis: 'A single time keeps the rule, the days and the tags of its event.',
  scopeNoFollowing: 'Not for a rule of a number of times, or its first time.',
  scopeNoAll: 'The rule cannot move by these days.',
  ok: 'OK',
  readOnly: 'Read only',
}
