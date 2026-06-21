import { describe, expect, it } from 'vitest'
import { createArgCodec } from './usePlanciaSync'
import type { WindowInstance } from '../types'

const win = (p: Partial<WindowInstance>): WindowInstance => ({
  id: '1',
  type: 'note',
  key: '',
  title: '',
  props: {},
  tags: [],
  width: 'm',
  minimized: false,
  dirty: false,
  ...p,
})

describe('createArgCodec — gosidian scheme (path string + singletons)', () => {
  const codec = createArgCodec({
    bareToken: 'type',
    types: {
      note: {
        arg: (p) => (typeof p.path === 'string' ? p.path : null),
        props: (a) => (a ? { path: a } : {}),
        title: (a) => (a ? (a.split('/').pop() ?? a) : ''),
      },
    },
    default: { arg: () => null, title: () => 'singleton' },
  })

  it('encodes a note path with encodeURIComponent', () => {
    expect(codec.encode(win({ type: 'note', props: { path: 'gosidian/hot.md' } }))).toBe(
      'note:gosidian%2Fhot.md',
    )
  })

  it('encodes a singleton as a bare type token', () => {
    expect(codec.encode(win({ type: 'settings', props: {} }))).toBe('settings')
  })

  it('round-trips a note token', () => {
    const tok = codec.encode(win({ type: 'note', props: { path: 'a/b.md' } }))!
    const spec = codec.decode(tok)!
    expect(spec.type).toBe('note')
    expect(spec.props).toEqual({ path: 'a/b.md' })
    expect(spec.key).toBe('note:a/b.md')
    expect(spec.title).toBe('b.md')
  })

  it('decodes a singleton bare token', () => {
    const spec = codec.decode('search')!
    expect(spec.type).toBe('search')
    expect(spec.key).toBe('search')
  })
})

describe('createArgCodec — products-dc scheme (numeric id, native bare)', () => {
  const codec = createArgCodec({
    bareToken: 'nativeArg',
    nativeType: 'anagrafica',
    default: {
      arg: (p) => (typeof p.id === 'number' ? String(p.id) : null),
      props: (a) => (a ? { id: Number(a) } : {}),
      title: (a) => (a ? `#${a}` : ''),
    },
  })

  it('encodes the native window as a bare id', () => {
    expect(codec.encode(win({ type: 'anagrafica', props: { id: 12 } }))).toBe('12')
  })

  it('encodes a foreign window as type:id', () => {
    expect(codec.encode(win({ type: 'brand', props: { id: 5 } }))).toBe('brand:5')
  })

  it('returns null for a window without an arg (not serialized)', () => {
    expect(codec.encode(win({ type: 'anagrafica', props: {} }))).toBeNull()
  })

  it('round-trips a bare native id', () => {
    const spec = codec.decode('12')!
    expect(spec.type).toBe('anagrafica')
    expect(spec.props).toEqual({ id: 12 })
    expect(spec.key).toBe('anagrafica:12')
  })

  it('round-trips a foreign token', () => {
    const spec = codec.decode('brand:5')!
    expect(spec.type).toBe('brand')
    expect(spec.props).toEqual({ id: 5 })
    expect(spec.key).toBe('brand:5')
  })

  it('ignores empty tokens', () => {
    expect(codec.decode('')).toBeNull()
    expect(codec.decode('   ')).toBeNull()
  })
})
