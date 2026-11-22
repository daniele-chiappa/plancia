# Changelog — plancia-calendar

All notable changes to this package. It follows [Semantic Versioning](https://semver.org);
its tags are `calendar-vX.Y.Z`.

## [0.2.0] - 2026-11-22

### Added

- **Sources**: the format's `sources`, the rows of a database a host
  brings to a calendar on the days of a date field (`{from, date, end,
  title, where}`, as gosidian's IMP-240 F4 reads them). `parseCalendar`
  reads them with the Go reader's checks and messages, keeps a source
  with a problem as written so that a save does not lose it,
  `writeCalendar` writes them back, `calendarText` and `sourceText` say
  them. The host reads the rows: the package never does.
- **The host's rows among the times**: a time with `row` is the host's,
  not an event of the YAML. The views draw it in outline, apart from the
  events, with the label `row` (`labels.row`). A click on it emits
  `open-row` and never opens the form; a drag to another day, when the
  time says `movable` and the calendar is not read only, emits
  `move-row` with the days it would start and end on, its length kept.
  The host changes it and calls `reload()`: the YAML never changes.
- `placedKey`, `isRow` and `canDrag`: the keys of the views' lists, two
  rows on one day included, and the tests the views use.

## [0.1.0] - 2026-11-22

### Added

- `<CalendarView>`: a calendar of gosidian's format `calendar: 1`, in
  four views, month, week, day and list. The times come from the host
  (`load(range)`), in the shape of gosidian's `POST /api/v1/calendar`:
  the package never works a rule out.
  - The month draws the times of several days as bars across their
    days, and the times a day has no room for in a "+N" that opens it.
  - The week and the day place the times by their hours, those that
    overlap side by side, with a row for the times without hours.
  - The list says the days with times, one after the other; it is the
    view to start with below 600 px.
- The editor: a click on a day or an hour makes an event, a click on a
  time opens it in a form (title, all day or hours, days, repeat with
  its weekdays or day of the month, end, cycle, days skipped and pauses,
  place, note, tags, text); a time can be dragged to another day or
  hour. For a repeated event it asks which times a change is for: this
  one (a `changes` entry), this one and the following (the rule ends the
  day before and a new event goes on, its cycle in phase), or all (the
  rule moved with it when it can say it). It writes an `id` for every
  event it makes or changes.
- The keyboard: arrows, Home, End, Page Up, Page Down and Enter in the
  month's grid of days, arrows and Enter in the hours of the week and
  the day; Tab reaches the times of the day with the focus. ARIA roles
  for the grid, the dialogs and the view buttons, and the calendar said
  in words for a screen reader.
- The model: `parseCalendar` (a port of gosidian's Go reader, the same
  messages on the same lines, but for the checks of the rule's days),
  `writeCalendar` (the full form, one line for the small parts),
  `calendarText`, and the editor's changes as pure functions.
  `encodeCalendarState` and `decodeCalendarState` keep the view and the
  day in a window's address.
- The words come from the host (`labels`, English by default), the days
  and hours from Intl (`locale`, `firstDay`, `hour12`), the colours
  from plancia's `--plancia-*` variables, light and dark.
- gosidian's examples (`docs/calendars/examples`) in `test/fixtures`,
  with what the Go reader makes of them.
