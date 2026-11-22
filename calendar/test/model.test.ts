import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  calendarText,
  daysBetween,
  eventText,
  isLink,
  isRuleProblem,
  monthEnd,
  monthsBetween,
  parseCalendar,
  parseDate,
  ruleText,
  weekStart,
  weekdayOf,
  writeCalendar,
} from '../src'
import { lessons } from './samples'

// The cases of gosidian's internal/calendar/parse_test.go: the same
// messages, so the two readers agree beyond the examples too.


const event = (date: string, repeat: string) =>
  `events:\n  - title: e\n    date: ${date}\n    time: 09:00-10:00\n    repeat: ${repeat}\n`

function must(src: string) {
  const { calendar, problems } = parseCalendar(src)
  expect(problems).toEqual([])
  return calendar!
}

describe('the days', () => {
  it('count as the calendar does', () => {
    expect(parseDate('2026-02-29')).toBeNull()
    expect(parseDate('2028-02-29')).toBe('2028-02-29')
    expect(parseDate(' 2026-11-23 ')).toBe('2026-11-23')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(daysBetween('2026-11-23', '2027-01-01')).toBe(39)
    expect(weekdayOf('2026-11-23')).toBe('mon')
    expect(weekStart('2026-11-29')).toBe('2026-11-23')
    expect(weekStart('2026-11-29', 'sun')).toBe('2026-11-29')
    expect(weekStart('2026-11-28', 'sun')).toBe('2026-11-22')
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-01')
    expect(monthEnd('2028-02-10')).toBe('2028-02-29')
    expect(monthsBetween('2026-11-30', '2027-02-01')).toBe(3)
  })
})

describe('the reader', () => {
  it('finds the [[links]] as gosidian does', () => {
    // One link from the first "[[" to the last "]]", as \[\[([^\]]+)\]\] finds them.
    for (const ok of ['[[a]]', '[[p/a|A]]', '[[[a]]', '[[a]]b]]', 'https://x.org', '']) expect(isLink(ok), ok).toBe(true)
    for (const bad of ['[[]]', '[[a]] [[b]]', '[[a]b]]', '[a]]', 'x[[a]]', 'ftp://x.org']) expect(isLink(bad), bad).toBe(false)
    // A long "[[[[…" with no link in it takes a time in step with its length.
    const t = performance.now()
    expect(isLink('[['.repeat(200_000) + ']x]]')).toBe(false)
    expect(isLink('[['.repeat(200_000) + ']]')).toBe(true)
    expect(performance.now() - t).toBeLessThan(500)
  })

  it('reads the short forms and the full ones', () => {
    const c = must(`calendar: 1
title: Redazione
timezone: Europe/Rome
events:
  - title: Consegna
    date: 2026-12-03
  - title: Festival
    from: 2026-12-03
    to: 2026-12-06
  - title: Riunione
    date: 2026-11-24
    time: 10:00–11:30
  - title: Sveglia
    date: 2026-11-24
    time: "07:00"
  - title: Turno
    from: 2026-11-27 22:00:00
    to: "06:00"
  - title: Corso
    date: 2026-11-23
    repeat: 2 weeks
    note: "[[corsi/programma]]"
    tags: corso
`)
    expect(c.title).toBe('Redazione')
    expect(c.timezone).toBe('Europe/Rome')
    const e = c.events
    expect(e).toHaveLength(6)
    expect(e[0]).toMatchObject({ allDay: true, start: '2026-12-03', end: '2026-12-03' })
    expect(e[1]).toMatchObject({ allDay: true, end: '2026-12-06' })
    expect(e[2]).toMatchObject({ allDay: false, from: 600, to: 690, hasEnd: true })
    expect(e[3]).toMatchObject({ hasEnd: false, from: 420 })
    expect(e[4]).toMatchObject({ end: '2026-11-28', to: 360 })
    expect(e[5]!.repeat).toMatchObject({ every: 2, unit: 'week' })
    expect(e[5]!.tags).toEqual(['corso'])
    expect(e[5]!.note).toBe('[[corsi/programma]]')
  })

  it('reads an empty block as an empty calendar', () => {
    const { calendar, problems } = parseCalendar('')
    expect(problems).toEqual([])
    expect(calendar?.events).toEqual([])
    expect(parseCalendar('# nothing yet\n').calendar?.events).toEqual([])
  })

  it.each([
    ['version', 'calendar: 2\n', 'format this server does not read'],
    ['unknown field', 'events:\n  - title: a\n    date: 2026-11-01\n    colour: red\n', 'no field "colour"'],
    ['no title', 'events:\n  - date: 2026-11-01\n', 'has a title'],
    ['no day', 'events:\n  - title: a\n', 'has a date'],
    ['bad date', 'events:\n  - title: a\n    date: 2026-13-01\n', 'is a date'],
    ['bad hours', 'events:\n  - title: a\n    date: 2026-11-01\n    time: 25:00\n', 'HH:MM-HH:MM'],
    ['date and from', 'events:\n  - title: a\n    date: 2026-11-01\n    from: 2026-11-01\n', 'not both'],
    ['to before from', 'events:\n  - title: a\n    from: 2026-11-05\n    to: 2026-11-01\n', 'before from'],
    ['bad every', 'events:\n  - title: a\n    date: 2026-11-01\n    repeat: fortnight\n', 'day, week, month or year'],
    ['on with days', 'events:\n  - title: a\n    date: 2026-11-01\n    repeat: {every: day, on: mon}\n', 'weekdays are for weeks and months'],
    ['month day with weekly', 'events:\n  - title: a\n    date: 2026-11-02\n    repeat: {every: week, on: 15}\n', 'weekly rule takes weekdays'],
    ['bad on', 'events:\n  - title: a\n    date: 2026-11-02\n    repeat: {every: month, on: 6th mon}\n', 'in a month'],
    ['until and times', 'events:\n  - title: a\n    date: 2026-11-02\n    repeat: {every: week, until: 2026-12-01, times: 3}\n', 'not both'],
    ['until before', 'events:\n  - title: a\n    date: 2026-11-02\n    repeat: {every: week, until: 2026-10-01}\n', 'before the first date'],
    ['cycle with every 2', 'events:\n  - title: a\n    date: 2026-11-02\n    repeat: {every: 2 weeks, cycle: {on: 1, off: 1}}\n', 'one by one'],
    ['cycle all off', 'events:\n  - title: a\n    date: 2026-11-02\n    repeat: {every: week, cycle: [0, 0]}\n', 'one of them on'],
    ['timezone', 'timezone: Europe/Atlantis\n', 'IANA'],
    ['skip without repeat', 'events:\n  - title: a\n    date: 2026-11-02\n    skip: 2026-11-09\n', 'has no repeat'],
    ['change twice', 'events:\n  - title: a\n    date: 2026-11-02\n    repeat: week\n    changes:\n      - {date: 2026-11-09, cancel: true}\n      - {date: 2026-11-09, move: 2026-11-10}\n', 'changed twice'],
    ['cancel and move', 'events:\n  - title: a\n    date: 2026-11-02\n    repeat: week\n    changes:\n      - {date: 2026-11-09, cancel: true, move: 2026-11-10}\n', 'changes nothing else'],
    ['hours of an all-day', 'events:\n  - title: a\n    date: 2026-11-02\n    repeat: week\n    changes:\n      - {date: 2026-11-09, time: 10:00}\n', 'this one is all day'],
    ['duplicate id', 'events:\n  - {title: a, id: x, date: 2026-11-02}\n  - {title: b, id: x, date: 2026-11-03}\n', 'used twice'],
    ['bad note', 'events:\n  - {title: a, date: 2026-11-02, note: corsi}\n', '[[note]]'],
    ['not YAML', 'events: [\n', 'not valid YAML'],
  ])('says %s', (_name, src, want) => {
    const { problems } = parseCalendar(src)
    expect(problems.map((p) => p.message).join('\n')).toContain(want)
  })

  it('gives the line of each problem', () => {
    const { problems } = parseCalendar('events:\n  - title: a\n    date: 2026-11-01\n    colour: red\n  - date: 2026-11-02\n')
    expect(problems).toEqual([
      { line: 4, message: 'an event has no field "colour" (it has id, title, date, time, from, to, repeat, skip, pause, changes, place, note, tags, text)' },
      { line: 5, message: 'an event has a title' },
    ])
  })

  it('leaves to the server the checks of the rule days', () => {
    for (const src of [
      'events:\n  - title: a\n    date: 2026-11-04\n    repeat: {every: week, on: [mon, thu]}\n',
      'events:\n  - title: a\n    date: 2026-11-02\n    repeat: week\n    skip: 2026-11-10\n',
      'events:\n  - title: a\n    date: 2026-11-02\n    repeat: week\n    changes:\n      - {date: 2026-11-10, cancel: true}\n',
    ]) {
      expect(parseCalendar(src).problems).toEqual([])
    }
    expect(isRuleProblem('the first date, 2026-11-04 (Wed), is not a date of the rule: the first time is 2026-11-05; make the event\'s date 2026-11-05')).toBe(true)
    expect(isRuleProblem('skip 2026-11-10 is not a date of the rule')).toBe(true)
    expect(isRuleProblem('the change of 2026-11-10: the rule has no time on 2026-11-10')).toBe(true)
    expect(isRuleProblem('an event has a title')).toBe(false)
  })

  it('keeps a wrong timezone, so that a save does not lose it', () => {
    const { calendar, problems } = parseCalendar('timezone: Europe/Atlantis\n')
    expect(problems).toHaveLength(1)
    expect(calendar?.timezone).toBe('Europe/Atlantis')
    expect(calendarText(calendar, 'UTC')).toContain('times in UTC')
  })
})

describe('the text', () => {
  it('says an event as the server does', () => {
    const c = must(lessons)
    expect(eventText(c.events[0]!)).toBe(
      'Lezione [lez] — every 2 weeks on Mon, Thu until 2027-02-28, from 2026-11-23 18:00–19:30; skips 2026-12-10; ' +
        'paused 2026-12-21 to 2027-01-06; on 2027-01-18 at 19:00–20:30; on 2027-01-21 moved to 2027-01-22, at Aula 2; ' +
        'on 2027-02-01 cancelled; at Sala grande',
    )
  })

  it.each([
    ['{every: month, on: 2nd tue}', 'every month on the 2nd Tue'],
    ['{every: month, on: [-1]}', 'every month on the last day'],
    ['{every: week, on: [mon], cycle: {on: 3, off: 1}}', 'every week on Mon, 3 weeks on and 1 off'],
    ['{every: day, times: 1}', 'every day, 1 time'],
    ['{every: day, cycle: [1, 0, 1]}', 'every day, days in a cycle on, off, on'],
  ])('says the rule %s', (repeat, want) => {
    const c = must(event('2026-11-02', repeat))
    expect(ruleText(c.events[0]!.repeat)).toBe(want)
  })
})

describe('the writer', () => {
  it('writes the full form, one line for the small parts', () => {
    expect(writeCalendar(must(lessons))).toBe(`calendar: 1
timezone: Europe/Rome
events:
  - title: Lezione
    id: lez
    date: 2026-11-23
    time: 18:00-19:30
    repeat: {every: 2 weeks, on: [mon, thu], until: 2027-02-28}
    skip: [2026-12-10]
    pause:
      - {from: 2026-12-21, to: 2027-01-06}
    changes:
      - {date: 2027-01-18, time: 19:00-20:30}
      - {date: 2027-01-21, move: 2027-01-22, place: Aula 2}
      - {date: 2027-02-01, cancel: true}
    place: Sala grande
`)
  })

  it('writes each form of the days and hours back as it reads', () => {
    const src = `events:
  - {title: a, date: 2026-11-24, time: "07:00"}
  - {title: b, date: 2026-11-27, time: 22:00-06:00}
  - {title: c, from: 2026-11-27 22:00, to: 2026-11-29 06:00}
  - {title: d, date: 2026-11-27, time: 18:00-24:00}
  - {title: e, from: 2026-11-27 18:00, to: 24:00}
  - {title: f, from: 2026-12-03, to: 2026-12-06}
  - {title: g, date: 2026-11-02, repeat: {every: month, on: [2nd tue, last fri]}}
  - {title: h, date: 2026-11-02, repeat: {every: week, cycle: [1, 1, 0, 1], times: 8}, tags: [x, "y z"]}
  - {title: "yes", date: 2026-11-02, place: "1", note: "https://example.org/a: b"}
`
    const c = must(src)
    const again = must(writeCalendar(c))
    const strip = (x: typeof c) => x.events.map(({ line: _l, repeat, ...rest }) => ({ ...rest, repeat: repeat && { ...repeat, line: 0 } }))
    expect(strip(again)).toEqual(strip(c))
  })

  it('writes an empty calendar', () => {
    expect(writeCalendar(must(''))).toBe('calendar: 1\nevents: []\n')
  })
})
