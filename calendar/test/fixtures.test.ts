import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { calendarText, isRuleProblem, parseCalendar, writeCalendar } from '../src'

// The examples of gosidian's docs/calendars/examples are the format's
// contract (ADR-041 there, ADR-007 here). This folder holds a copy;
// FIXTURES points at another (gosidian's own, for example).
const root = process.env.FIXTURES ?? join(__dirname, 'fixtures')
const list = (dir: string) =>
  readdirSync(join(root, dir))
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => ({ name: f, src: readFileSync(join(root, dir, f), 'utf8') }))

type Expected = Record<string, { problems?: { line?: number; message: string }[]; text?: string }>

// expected.json is written by gosidian's Go reader: the same problems on
// the same lines, and the same text, but for the checks that need the
// rule's days worked out, which stay with the server (isRuleProblem). The
// times in it are the server's alone.
describe('the Go reader and this one', () => {
  const expected = JSON.parse(readFileSync(join(root, 'expected.json'), 'utf8')) as Expected
  const sorted = (ps: { line?: number; message: string }[]) =>
    ps
      .map((p) => ({ line: p.line ?? 0, message: p.message }))
      .sort((a, b) => a.line - b.line || (a.message < b.message ? -1 : a.message > b.message ? 1 : 0))

  it('see the same examples', () => {
    const files = [...list('valid').map((f) => `valid/${f.name}`), ...list('invalid').map((f) => `invalid/${f.name}`)]
    expect(Object.keys(expected).sort()).toEqual(files.sort())
    expect(files.length).toBeGreaterThanOrEqual(12)
  })

  it.each(Object.entries(expected))('%s', (name, want) => {
    const { calendar, problems } = parseCalendar(readFileSync(join(root, name), 'utf8'))
    const wantProblems = (want.problems ?? []).filter((p) => !isRuleProblem(p.message))
    expect(sorted(problems)).toEqual(sorted(wantProblems))
    // The examples' times are in Europe/Rome, the zone of the Go tests.
    expect(calendarText(calendar, 'Europe/Rome')).toBe(want.text ?? '')
  })

  it('leave some problems to the server', () => {
    const all = Object.values(expected).flatMap((w) => w.problems ?? [])
    expect(all.some((p) => isRuleProblem(p.message))).toBe(true)
    expect(all.some((p) => !isRuleProblem(p.message))).toBe(true)
  })
})

describe('the valid examples', () => {
  it.each(list('valid').map((f) => [f.name, f.src]))('%s read back the same once written', (_name, src) => {
    const first = parseCalendar(src)
    expect(first.problems).toEqual([])
    const again = parseCalendar(writeCalendar(first.calendar!))
    expect(again.problems).toEqual([])
    expect(calendarText(again.calendar, 'Europe/Rome')).toBe(calendarText(first.calendar, 'Europe/Rome'))
  })
})
