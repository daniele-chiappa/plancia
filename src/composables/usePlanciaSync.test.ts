// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KeepAlive, defineComponent, h, nextTick, type Component } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { RouterView, createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'
import { createArgCodec, usePlanciaSync } from './usePlanciaSync'
import { useWindowsStore } from '../store/windows'
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

describe('usePlanciaSync — the URL belongs to the shell (IMP-009)', () => {
  const codec = createArgCodec({
    types: {
      note: {
        arg: (p) => (typeof p.path === 'string' ? p.path : null),
        props: (a) => (a ? { path: a } : {}),
      },
    },
  })
  const Shell = defineComponent({
    setup() {
      usePlanciaSync(codec, { useLocalStorage: true })
      return () => h('div', [h(RouterView)])
    },
  })
  const Page = defineComponent({ render: () => h('p') })

  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
  })

  /** A shell on '/', with child pages, and a login page beside it. */
  async function setup(opts: { keepAlive?: boolean } = {}) {
    vi.useFakeTimers()
    const routes: RouteRecordRaw[] = [
      {
        path: '/',
        component: Shell,
        children: [
          { path: '', name: 'home', component: Page },
          { path: 'other', name: 'other', component: Page },
        ],
      },
      { path: '/login', name: 'login', component: Page },
    ]
    const router = createRouter({ history: createMemoryHistory(), routes })
    router.push('/')
    await router.isReady()
    const pinia = createPinia()
    const Root = opts.keepAlive
      ? defineComponent({
          render: () =>
            h(RouterView, null, {
              default: ({ Component }: { Component?: Component }) =>
                h(KeepAlive, null, Component ? [h(Component)] : []),
            }),
        })
      : RouterView
    const wrapper = mount(Root, { global: { plugins: [router, pinia] } })
    const store = useWindowsStore(pinia)
    return { router, wrapper, store }
  }

  const openNote = async (store: ReturnType<typeof useWindowsStore>) => {
    store.open({ type: 'note', key: 'note:a.md', title: 'a', props: { path: 'a.md' } })
    await nextTick() // the watcher arms the debounce
  }

  it('writes the windows to the URL of its own page, child pages included', async () => {
    const { router, store } = await setup()
    await router.push('/other')
    await openNote(store)
    vi.advanceTimersByTime(200)
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('other')
    expect(router.currentRoute.value.query).toEqual({ w: 'note:a.md', f: 'note:a.md' })
  })

  it('leaves the URL alone once the shell is gone, and keeps the windows locally', async () => {
    const { router, wrapper, store } = await setup()
    await openNote(store)
    const replace = vi.spyOn(router, 'replace')
    wrapper.unmount()
    vi.advanceTimersByTime(200)
    await flushPromises()
    expect(replace).not.toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem('plancia') ?? 'null')).toEqual({
      w: 'note:a.md',
      f: 'note:a.md',
    })
  })

  it("keeps another page's query intact, and saves the windows locally", async () => {
    const { router, store } = await setup({ keepAlive: true })
    await openNote(store)
    await router.push('/login?next=%2F&expired=1')
    vi.advanceTimersByTime(200)
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/login?next=%2F&expired=1')
    expect(JSON.parse(localStorage.getItem('plancia') ?? 'null')).toEqual({
      w: 'note:a.md',
      f: 'note:a.md',
    })
    // Back on its page, the shell has its windows and writes them again.
    await router.push('/')
    vi.advanceTimersByTime(200)
    await flushPromises()
    expect(store.windows.map((w) => w.key)).toEqual(['note:a.md'])
    expect(router.currentRoute.value.query).toEqual({ w: 'note:a.md', f: 'note:a.md' })
  })
})
