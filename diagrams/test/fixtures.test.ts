import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseDiagram, diagramText, DIAGRAM_KINDS } from '../src'

// The examples of gosidian's docs/diagrams/examples are the format's
// contract (ADR-036 there, ADR-006 here): every valid one reads without
// problems, every invalid one has the problem its first line names. This
// folder holds a copy; gosidian runs this reader on the originals too.
// FIXTURES points at another copy (gosidian's own, for example).
const root = process.env.FIXTURES ?? join(__dirname, 'fixtures')
const list = (dir: string) =>
  readdirSync(join(root, dir))
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => ({ name: f, src: readFileSync(join(root, dir, f), 'utf8') }))

describe('the examples', () => {
  const valid = list('valid')
  const invalid = list('invalid')

  it('are all there', () => {
    expect(valid.length).toBeGreaterThanOrEqual(10)
    expect(invalid.length).toBeGreaterThanOrEqual(25)
    const kinds = new Set(valid.map((f) => parseDiagram(f.src).diagram?.kind))
    for (const k of DIAGRAM_KINDS) expect(kinds, k).toContain(k)
  })

  it.each(valid.map((f) => [f.name, f.src]))('%s reads without problems', (_name, src) => {
    const { diagram, problems } = parseDiagram(src)
    expect(problems).toEqual([])
    expect(diagram).not.toBeNull()
    expect(diagramText(diagram)).not.toBe('')
  })

  it.each(invalid.map((f) => [f.name, f.src]))('%s has its problem', (_name, src) => {
    const want = /^# error: (.*)$/m.exec(src.split('\n')[0] ?? '')?.[1]
    expect(want, 'the first line is # error: …').toBeTruthy()
    const { problems } = parseDiagram(src)
    expect(problems.map((p) => p.message).some((m) => m.includes(want!)), JSON.stringify(problems)).toBe(true)
  })
})

// expected.json is written by gosidian's Go reader: the same problems on the
// same lines, and the same text. Only a YAML that does not parse is said in
// each YAML library's own words, so there the two agree on "not valid YAML".
describe('the Go reader and this one', () => {
  const expected = JSON.parse(readFileSync(join(root, 'expected.json'), 'utf8')) as Record<
    string,
    { problems: { line: number; message: string }[]; text?: string }
  >
  const sorted = (ps: { line: number; message: string }[]) =>
    [...ps].sort((a, b) => a.line - b.line || (a.message < b.message ? -1 : a.message > b.message ? 1 : 0))

  it('see the same examples', () => {
    const files = [...list('valid').map((f) => `valid/${f.name}`), ...list('invalid').map((f) => `invalid/${f.name}`)]
    expect(Object.keys(expected).sort()).toEqual(files.sort())
  })

  it.each(Object.entries(expected))('%s', (name, want) => {
    const { diagram, problems } = parseDiagram(readFileSync(join(root, name), 'utf8'))
    if (want.problems[0]?.message.startsWith('not valid YAML')) {
      expect(problems).toHaveLength(1)
      expect(problems[0]!.message).toMatch(/^not valid YAML: /)
      return
    }
    expect(sorted(problems)).toEqual(want.problems)
    expect(diagramText(diagram)).toBe(want.text ?? '')
  })
})
