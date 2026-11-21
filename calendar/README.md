# plancia-calendar

> Calendars for Vue 3 from a YAML source: month, week, day and list views,
> an editor of events and of the rules that repeat them, the format read and
> written as [gosidian](https://github.com/daniele-chiappa/gosidian)'s
> server reads it.

A calendar is a small YAML document: its events, the days and hours of each,
and the rules that repeat them, with the days a rule skips and the times
changed one by one. The YAML stays the source: a person or a language model
writes it as text, and this package reads it, draws it and edits it.

The package never works a rule out. The days of the repeats come from the
host (`load`), so that every reader of a calendar (an agent, the web UI, an
`.ics` feed) sees the same days: in gosidian, `POST /api/v1/calendar`
computes them. It lives in the [plancia](../README.md) repository but is a
package of its own: plancia does not need it, and it does not need plancia
(it takes plancia's `--plancia-*` colours when the page has them).

```yaml
calendar: 1
timezone: Europe/Rome
events:
  - title: Lesson
    date: 2026-11-23
    time: 18:00-19:30
    repeat: {every: 2 weeks, on: [mon, thu], until: 2027-06-30}
    skip: [2026-12-24]
    changes:
      - {date: 2027-01-18, time: 19:00-20:30}
    place: Main hall
    note: "[[courses/programme]]"
```

The format is gosidian's `calendar: 1`, described in its
[docs/calendars.md](https://github.com/daniele-chiappa/gosidian/blob/main/docs/calendars.md).

## Install

```bash
npm install https://github.com/daniele-chiappa/plancia/releases/download/calendar-v0.1.0/plancia-calendar-0.1.0.tgz
# peer: vue ^3.5
```

Each `calendar-vX.Y.Z` tag attaches the package to its GitHub release.

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { CalendarView, type CalendarRange, type CalendarLoad } from 'plancia-calendar'
import 'plancia-calendar/style.css'

const source = ref(`calendar: 1
events:
  - {title: Meeting, date: 2026-11-24, time: 10:00-11:00, repeat: week}`)
const view = ref<'month' | 'week' | 'day' | 'list'>()
const date = ref('2026-11-23')

// The host computes the times of the days shown: here gosidian's server.
async function load(range: CalendarRange): Promise<CalendarLoad> {
  const res = await fetch('/api/v1/calendar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ yaml: source.value, from: range.from, to: range.to }),
  })
  const { calendars } = await res.json()
  return calendars[0]
}
</script>

<template>
  <CalendarView v-model="source" v-model:view="view" v-model:date="date" :load="load" @link="(l) => open(l.target)" />
</template>
```

## The component

`<CalendarView>` takes:

| Prop | |
|---|---|
| `modelValue` | The YAML. Every change from the editor comes back as `update:modelValue`, the calendar written in its full form. |
| `load(range)` | The times of the days `{from, to}` shown, as `{times, problems?, truncated?}`: a time is `{event, title, start, end?, all_day?, place?, link?, tags?, repeats?, changed_from?}`, its `start` and `end` a day (`2026-11-24`) or a time with the calendar's offset (`2026-11-24T10:00:00+01:00`). Called again when the days shown or the YAML change. |
| `view`, `date` | The view (`month`, `week`, `day`, `list`) and a day it shows, with `v-model`. Without a view, the list below `compactWidth` (600 px), the month above. |
| `readonly` | Draws without editing. |
| `labels` | The words, English by default (`DEFAULT_CALENDAR_LABELS`). |
| `locale`, `firstDay`, `hour12` | How days and hours are written (Intl), the first day of the week (`mon`), 12 or 24 hours. |
| `timezone`, `today` | The zone of a calendar without one, for its text alternative; today, by default the day in the calendar's zone. |

It emits `link` with `{target}`, the `note` of an event: a `[[note]]` or an
address, which the host opens.

**Editing.** A click on a day, or on an hour of the week and day views, makes
an event there; a click on a time opens it in the form. A time can be dragged
to another day or hour. For a repeated event the editor asks which times a
change is for:
- *this time only* writes a `changes` entry;
- *this time and the following* ends the rule the day before (`until`) and starts a new event, with its own `id` and its cycle in phase;
- *all the times* changes the event, its rule moved with it when the rule can say it.

The editor writes an `id` for every event it makes or changes. Comments
written by hand in the YAML are not kept by a save.

**Keyboard.** In the month, the arrows move between days, Home and End go to
the week's ends, Page Up and Page Down change month, and Enter makes an event;
Tab reaches the times of the day with the focus. In the week and day views,
up and down move by half hours, left and right by days, and Enter makes an
event at that hour. The form says the days and hours as fields, so it does
what a drag does.

**Problems.** The component shows what is wrong with the YAML: what its own
reader finds while you type, and what the host sends with the times (the
checks that need the rule's days worked out stay with the host).

## The model

The functions under the component are exported too:

- `parseCalendar(yaml)` → `{calendar, problems}`: a port of gosidian's Go reader, with the same messages on the same lines, but for the checks that need the days of a rule (`isRuleProblem`);
- `writeCalendar(calendar)` → the YAML in its full form;
- `calendarText(calendar, zone)`: the calendar in words, as gosidian says it to its agents;
- `addEvent`, `applyEdit`, `deleteTime`, `splitEvent`, `shiftEvent`, `scopesFor`…: the editor's changes, as pure functions;
- `encodeCalendarState` and `decodeCalendarState`: the view and the day as a token for a window's address (`week.2026-11-23`).

gosidian's examples (`docs/calendars/examples`) are the contract of the two
readers; `test/fixtures` holds a copy, and `FIXTURES=<dir> npm test` reads
another.

## Develop

```bash
npm install
npm test            # vitest
npm run typecheck
npm run build       # dist/: the ESM bundle, its CSS and one .d.ts
npm run dev         # the playground, with a plain repeat of its own
```

The playground (`docker compose up calendar` in the repository, port 5183)
shows the examples in every view, light and dark, in English and Italian. Its
days of the repeats are its own, plain and only for the demo.

## License

MIT
