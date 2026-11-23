import { describe, expect, it } from 'vitest'
import {
  addEvent,
  applyEdit,
  deleteScopes,
  deleteTime,
  eventAt,
  eventIn,
  eventOf,
  fieldsOf,
  makeId,
  newEvent,
  parseCalendar,
  scopesFor,
  shiftEvent,
  splitEvent,
  writeCalendar,
  type Calendar,
} from '../src'
import { lessons } from './samples'

function must(src: string): Calendar {
  const { calendar, problems } = parseCalendar(src)
  expect(problems).toEqual([])
  return calendar!
}

/** The YAML of the calendar's events, without the head. */
function events(c: Calendar): string {
  return writeCalendar(c).split('events:\n')[1] ?? ''
}

describe('the ids', () => {
  it('come from the title, unique and as the format wants them', () => {
    const c = must('events:\n  - {title: Lesson, id: lesson, date: 2026-11-23}\n')
    expect(makeId(c, 'Lesson')).toBe('lesson-2')
    expect(makeId(c, 'Così è (se vi pare)')).toBe('cosi-e-se-vi-pare')
    expect(makeId(c, '日本')).toBe('event')
    expect(makeId(c, '-'.repeat(80) + 'x')).toBe('x')
    expect(makeId(c, '  a -- b  ')).toBe('a-b')
    expect(makeId(c, 'a'.repeat(39) + ' bc')).toBe('a'.repeat(39))
    // A run of dashes takes a time in step with its length.
    const t = performance.now()
    expect(makeId(c, '-'.repeat(200_000) + 'x' + '-'.repeat(200_000))).toBe('x')
    expect(performance.now() - t).toBeLessThan(500)
  })

  it('name only the events of the list', () => {
    const c = must('events:\n  - {title: Lesson, date: 2026-11-23}\n')
    expect(eventIn(c, 0).title).toBe('Lesson')
    for (const bad of [1, -1, 0.5, NaN, '__proto__' as unknown as number, 'constructor' as unknown as number]) {
      expect(() => eventIn(c, bad)).toThrow(RangeError)
      expect(() => eventAt(c, { event: bad, date: '2026-11-23' })).toThrow(RangeError)
      expect(() => applyEdit(c, { event: bad, date: '2026-11-23' }, newEvent('2026-11-23'), 'all')).toThrow(RangeError)
    }
    expect(({} as Record<string, unknown>).title).toBeUndefined()
  })

  it('are written for an event added', () => {
    const c = must('')
    const e = { ...newEvent('2026-11-24', 600), title: 'Riunione' }
    const { calendar, index } = addEvent(c, e)
    expect(index).toBe(0)
    expect(events(calendar)).toBe('  - title: Riunione\n    id: riunione\n    date: 2026-11-24\n    time: 10:00-11:00\n')
  })
})

describe('one time of a repeated event', () => {
  it('moved by itself is a change, and moved back is none', () => {
    const c = must(lessons)
    const ref = { event: 0, date: '2026-11-26' }
    const draft = { ...eventAt(c, ref), start: '2026-11-27', end: '2026-11-27' }
    expect(scopesFor(c, ref, draft)).toEqual({ this: true, following: true, all: true })
    const moved = applyEdit(c, ref, draft, 'this')
    expect(moved.events[0]!.changes.map((ch) => [ch.date, ch.move])).toEqual([
      ['2026-11-26', '2026-11-27'],
      ['2027-01-18', undefined],
      ['2027-01-21', '2027-01-22'],
      ['2027-02-01', undefined],
    ])
    const back = applyEdit(moved, ref, { ...eventAt(moved, ref), start: '2026-11-26', end: '2026-11-26' }, 'this')
    expect(back.events[0]!.changes).toHaveLength(3)
  })

  it('keeps what a change has, and drops what goes back to the event', () => {
    const c = must(lessons)
    const ref = { event: 0, date: '2027-01-21' }
    const shown = eventAt(c, ref)
    expect(shown).toMatchObject({ start: '2027-01-22', place: 'Aula 2', title: 'Lezione' })
    const next = applyEdit(c, ref, { ...shown, title: 'Esame', place: 'Sala grande' }, 'this')
    const ch = next.events[0]!.changes.find((x) => x.date === '2027-01-21')
    expect(ch).toMatchObject({ move: '2027-01-22', title: 'Esame' })
    expect(ch?.place).toBeUndefined()
  })

  it('takes other hours by itself', () => {
    const c = must(lessons)
    const ref = { event: 0, date: '2026-12-03' }
    const next = applyEdit(c, ref, { ...eventAt(c, ref), from: 19 * 60, to: 20 * 60 + 30 }, 'this')
    expect(writeCalendar(next)).toContain('- {date: 2026-12-03, time: 19:00-20:30}')
  })

  it('cannot change its rule, its length or its tags by itself', () => {
    const c = must(lessons)
    const ref = { event: 0, date: '2026-11-26' }
    const shown = eventAt(c, ref)
    expect(scopesFor(c, ref, { ...shown, allDay: true }).this).toBe(false)
    expect(scopesFor(c, ref, { ...shown, tags: ['x'] }).this).toBe(false)
    expect(scopesFor(c, ref, { ...shown, repeat: { ...shown.repeat!, every: 1 } }).this).toBe(false)
    expect(scopesFor(c, ref, { ...shown, to: 20 * 60 }).this).toBe(false)
  })

  it('is cancelled by a delete of that time alone', () => {
    const c = must(lessons)
    const ref = { event: 0, date: '2027-01-21' }
    const next = deleteTime(c, ref, 'this')
    expect(next.events[0]!.changes.find((x) => x.date === '2027-01-21')).toEqual({ date: '2027-01-21', cancel: true, line: 0 })
  })
})

describe('the times from one on', () => {
  it('cut the event: it ends the day before, a new one goes on', () => {
    const c = must(lessons)
    const ref = { event: 0, date: '2027-01-11' }
    const next = applyEdit(c, ref, { ...eventAt(c, ref), from: 17 * 60, to: 18 * 60 + 30 }, 'following')
    expect(events(next)).toBe(`  - title: Lezione
    id: lez
    date: 2026-11-23
    time: 18:00-19:30
    repeat: {every: 2 weeks, on: [mon, thu], until: 2027-01-10}
    skip: [2026-12-10]
    pause:
      - {from: 2026-12-21, to: 2027-01-06}
    place: Sala grande
  - title: Lezione
    id: lez-2
    date: 2027-01-11
    time: 17:00-18:30
    repeat: {every: 2 weeks, on: [mon, thu], until: 2027-02-28}
    changes:
      - {date: 2027-01-18, time: 19:00-20:30}
      - {date: 2027-01-21, move: 2027-01-22, place: Aula 2}
      - {date: 2027-02-01, cancel: true}
    place: Sala grande
`)
  })

  it('keep a cycle in its phase', () => {
    const c = must('events:\n  - {title: Turno, date: 2026-11-02, repeat: {every: week, cycle: {on: 3, off: 1}}}\n')
    // 2026-11-02 is week 0; 2026-11-16 week 2, the last on.
    const { calendar } = splitEvent(c, 0, '2026-11-16')
    expect(calendar.events[1]!.repeat!.cycle).toEqual([true, false, true, true])
    expect(calendar.events[0]!.repeat!.until).toBe('2026-11-15')
  })

  it('split a pause across the day', () => {
    const c = must('events:\n  - {title: a, date: 2026-11-02, repeat: week, pause: [{from: 2026-11-10, to: 2026-11-20}]}\n')
    const { calendar } = splitEvent(c, 0, '2026-11-16')
    expect(calendar.events[0]!.pause.map((p) => [p.from, p.to])).toEqual([['2026-11-10', '2026-11-15']])
    expect(calendar.events[1]!.pause.map((p) => [p.from, p.to])).toEqual([['2026-11-16', '2026-11-20']])
  })

  it('are not for a rule of a number of times, nor from its first time', () => {
    const c = must('events:\n  - {title: a, date: 2026-11-02, repeat: {every: week, times: 5}}\n')
    const ref = { event: 0, date: '2026-11-09' }
    expect(scopesFor(c, ref, eventAt(c, ref)).following).toBe(false)
    expect(deleteScopes(c, ref)).toEqual({ this: true, following: false, all: true })
    const first = { event: 0, date: '2026-11-02' }
    expect(deleteScopes(must(lessons), { event: 0, date: '2026-11-23' }).following).toBe(false)
    expect(scopesFor(c, first, eventAt(c, first)).following).toBe(false)
  })

  it('are deleted by ending the rule the day before', () => {
    const c = must(lessons)
    const next = deleteTime(c, { event: 0, date: '2027-01-11' }, 'following')
    expect(next.events).toHaveLength(1)
    expect(next.events[0]!.repeat!.until).toBe('2027-01-10')
    expect(next.events[0]!.changes).toEqual([])
  })
})

describe('all the times', () => {
  it('move with their rule: weekdays turned, the rest moved', () => {
    const c = must('events:\n  - {title: a, date: 2026-11-23, time: 10:00-11:00, repeat: {every: week, on: [mon, thu]}, skip: [2026-11-26]}\n')
    const ref = { event: 0, date: '2026-11-30' }
    const next = applyEdit(c, ref, { ...eventAt(c, ref), start: '2026-12-01', end: '2026-12-01' }, 'all')
    expect(events(next)).toBe(`  - title: a
    id: a
    date: 2026-11-24
    time: 10:00-11:00
    repeat: {every: week, on: [tue, fri]}
    skip: [2026-11-27]
`)
  })

  it('move only when the rule can say it', () => {
    const weekly2 = must('events:\n  - {title: a, date: 2026-11-23, repeat: {every: 2 weeks, on: [mon, thu]}}\n')
    expect(shiftEvent(weekly2.events[0]!, 1)?.repeat?.weekdays).toEqual(['tue', 'fri'])
    expect(shiftEvent(weekly2.events[0]!, 4)).toBeNull()
    expect(shiftEvent(weekly2.events[0]!, 7)?.start).toBe('2026-11-30')
    const nth = must('events:\n  - {title: a, date: 2026-11-10, repeat: {every: month, on: 2nd tue}}\n')
    expect(shiftEvent(nth.events[0]!, 1)).toBeNull()
    const day = must('events:\n  - {title: a, date: 2026-11-10, repeat: {every: month, on: [10, 20]}}\n')
    expect(shiftEvent(day.events[0]!, 2)?.repeat?.monthDays).toEqual([12, 22])
    expect(shiftEvent(day.events[0]!, 9)).toBeNull()
    const ref = { event: 0, date: '2026-11-26' }
    expect(scopesFor(weekly2, ref, { ...eventAt(weekly2, ref), start: '2026-11-30', end: '2026-11-30' }).all).toBe(false)
  })

  it('take a new rule from the form, the first day moved as the time was', () => {
    const c = must(lessons)
    const ref = { event: 0, date: '2026-11-26' }
    const f = fieldsOf(eventAt(c, ref))
    f.every = 1
    f.ends = 'times'
    f.times = 12
    const { event } = eventOf(f, eventAt(c, ref))
    const next = applyEdit(c, ref, event!, 'all')
    expect(next.events[0]!.start).toBe('2026-11-23')
    expect(next.events[0]!.repeat).toMatchObject({ every: 1, times: 12, weekdays: ['mon', 'thu'] })
    expect(next.events[0]!.repeat!.until).toBeUndefined()
  })

  it('without a rule become one time, on the day shown', () => {
    const c = must(lessons)
    const ref = { event: 0, date: '2026-11-26' }
    const f = fieldsOf(eventAt(c, ref))
    f.repeat = 'none'
    const next = applyEdit(c, ref, eventOf(f, eventAt(c, ref)).event!, 'all')
    expect(events(next)).toBe('  - title: Lezione\n    id: lez\n    date: 2026-11-26\n    time: 18:00-19:30\n    place: Sala grande\n')
  })
})

describe('the form', () => {
  it('gives back the event it shows, untouched', () => {
    const c = must(lessons)
    for (const date of ['2026-11-23', '2027-01-21', '2027-01-18']) {
      const shown = eventAt(c, { event: 0, date })
      expect(eventOf(fieldsOf(shown), shown).event).toEqual(shown)
    }
    const night = must('events:\n  - {title: n, date: 2026-11-27, time: 18:00-24:00}\n  - {title: m, from: 2026-11-27 22:00, to: 06:00}\n')
    for (const e of night.events) {
      const back = eventOf(fieldsOf(e), e).event!
      expect(writeCalendar({ ...night, events: [back] })).toBe(writeCalendar({ ...night, events: [e] }))
    }
  })

  it('says what is wrong', () => {
    const e = newEvent('2026-11-24', 600)
    const f = fieldsOf(e)
    f.endTime = '09:00'
    f.note = 'corsi'
    expect(eventOf(f, e).errors).toEqual({ title: 'needTitle', endDate: 'endBeforeStart', note: 'badNote' })
  })

  it('writes the month rules it offers', () => {
    const e = { ...newEvent('2026-11-24'), title: 'a' }
    const f = fieldsOf(e)
    f.repeat = 'month'
    f.monthMode = 'nth'
    expect(eventOf(f, e).event!.repeat!.nths).toEqual([{ n: 4, day: 'tue' }])
    f.monthMode = 'lastWeekday'
    expect(eventOf(f, e).event!.repeat!.nths).toEqual([{ n: -1, day: 'tue' }])
    f.repeat = 'week'
    f.weekdays = ['fri']
    expect(eventOf(f, e).event!.repeat!.weekdays).toEqual(['tue', 'fri'])
    f.cycle = 'simple'
    f.cycleOn = 2
    f.cycleOff = 1
    expect(eventOf(f, e).event!.repeat!.cycle).toEqual([true, true, false])
  })
})

describe('the reminders', () => {
  const src =
    'remind: 30m\nevents:\n' +
    '  - {title: Lesson, id: lesson, date: 2026-11-23, time: 18:00-19:30, repeat: {every: week}, remind: [1d, 15m]}\n' +
    '  - {title: Call, id: call, date: 2026-11-24, time: "10:00"}\n' +
    '  - {title: Due, id: due, date: 2026-11-25}\n'

  it('stay as they are when a time moves, or the event is cut', () => {
    const c = must(src)
    const ref = { event: 0, date: '2026-11-30' }
    const moved = applyEdit(c, ref, { ...eventAt(c, ref), start: '2026-12-01', end: '2026-12-01' }, 'all')
    expect(moved.events[0]!.remind).toEqual(['1d', '15m'])
    const cut = splitEvent(c, 0, '2026-12-07')
    expect(cut.calendar.events.map((e) => e.remind)).toEqual([['1d', '15m'], ['1d', '15m'], undefined, undefined])
    expect(writeCalendar(cut.calendar)).toContain('repeat: {every: week, until: 2026-12-06}\n    remind: [1d, 15m]\n')
  })

  it('are the event\'s, not one time\'s', () => {
    const c = must(src)
    const ref = { event: 0, date: '2026-11-30' }
    const shown = eventAt(c, ref)
    expect(scopesFor(c, ref, { ...shown, remind: ['1h'] }).this).toBe(false)
    const next = applyEdit(c, ref, { ...shown, remind: ['1h'] }, 'following')
    expect(next.events.map((e) => e.remind)).toEqual([['1d', '15m'], ['1h'], undefined, undefined])
  })

  it('come from the form: the calendar\'s, none, or the event\'s own', () => {
    const c = must(src)
    const call = c.events[1]!
    const f = fieldsOf(call)
    expect([f.remindMode, f.remind]).toEqual(['calendar', ''])
    expect(eventOf(f, call).event!.remind).toBeUndefined()
    f.remindMode = 'own'
    f.remind = '1d, 60m 1h, 0'
    expect(eventOf(f, call).event!.remind).toEqual(['1d', '60m', '0'])
    f.remindMode = 'none'
    expect(eventOf(f, call).event!.remind).toEqual([])
    expect(writeCalendar({ ...c, events: [eventOf(f, call).event!] })).toContain('    remind: []\n')
    const lesson = c.events[0]!
    expect(eventOf(fieldsOf(lesson), lesson).event).toEqual(lesson)
  })

  it('say what is wrong in the form', () => {
    const c = must(src)
    const due = c.events[2]!
    const f = fieldsOf(due)
    f.remindMode = 'own'
    for (const [text, error] of [
      ['15', 'badRemind'],
      ['5w', 'badRemind'],
      ['2h', 'remindInDays'],
      ['1m 2d 3d 4d 5d', 'remindInDays'],
      ['1d 2d 3d 4d 5d', 'tooManyReminders'],
    ] as const) {
      f.remind = text
      expect(eventOf(f, due).errors.remind).toBe(error)
    }
  })

  it('are written as the server writes them', () => {
    const c = must('remind: [1d, 0]\nremind_at: "8:00"\nevents:\n  - {title: a, id: a, date: 2026-11-24, remind: 0}\n')
    expect(writeCalendar(c)).toBe('calendar: 1\nremind: [1d, 0]\nremind_at: 08:00\nevents:\n  - title: a\n    id: a\n    date: 2026-11-24\n    remind: 0\n')
  })
})
