// plancia-calendar: calendars for Vue 3 from a YAML source (ADR-007).
// The model reads and writes the format of gosidian's calendars; the views
// draw the times the host gives them, and the editor changes the YAML.

import './style.css'

export { default as CalendarView } from './components/CalendarView.vue'

export * from './model/dates'
export * from './model/types'
export { parseCalendar, emptyCalendar, isRuleProblem, isZone, isLink, parseClock, parseHours, idRe } from './model/parse'
export { writeCalendar } from './model/write'
export { parseLead, leadsOf, leadsText, leadInDays, MAX_REMINDERS, MAX_LEAD_DAYS, DEFAULT_REMIND_AT } from './model/remind'
export { calendarText, eventText, ruleText, whenText, calendarZone, sourceText } from './model/text'
export { placeTime, comparePlaced, placedKey, isRow, canDrag, type Placed } from './model/times'
export {
  addEvent,
  applyEdit,
  changeAt,
  deleteScopes,
  deleteTime,
  eventAt,
  eventIn,
  makeId,
  newEvent,
  removeEvent,
  replaceEvent,
  sameRepeat,
  scopesFor,
  shiftEvent,
  splitEvent,
  type EditScope,
  type OccurrenceRef,
} from './edit/edit'
export { eventOf, fieldsOf, type EventFields, type FieldError, type MonthMode } from './edit/form'
export { CALENDAR_VIEWS, viewRange, stepDate, layoutRow, layoutDay, isBar, type CalendarViewName, type Bar, type Row, type Slot } from './layout'
export { DEFAULT_CALENDAR_LABELS, type CalendarLabels } from './labels'
export { encodeCalendarState, decodeCalendarState, type CalendarState } from './state'
