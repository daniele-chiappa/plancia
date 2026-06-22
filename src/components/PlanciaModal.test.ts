// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { h, nextTick } from 'vue'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import PlanciaModal from './PlanciaModal.vue'

enableAutoUnmount(afterEach)
afterEach(() => {
  document.body.innerHTML = ''
  document.body.style.overflow = ''
})

const panel = () => document.body.querySelector('.plancia-modal__panel') as HTMLElement | null

describe('PlanciaModal', () => {
  it('renders nothing when closed', () => {
    mount(PlanciaModal, { props: { open: false } })
    expect(panel()).toBeNull()
  })

  it('teleports an accessible dialog, locks scroll, focuses in; unlocks on close', async () => {
    const w = mount(PlanciaModal, { props: { open: true }, slots: { default: () => h('p', 'hi') } })
    await nextTick()
    const p = panel()!
    expect(p).not.toBeNull()
    expect(p.getAttribute('role')).toBe('dialog')
    expect(p.getAttribute('aria-modal')).toBe('true')
    expect(document.body.style.overflow).toBe('hidden')
    expect(p.contains(document.activeElement)).toBe(true)
    await w.setProps({ open: false })
    expect(panel()).toBeNull()
    expect(document.body.style.overflow).toBe('')
  })

  it('the close button (in the header) requests close', async () => {
    const w = mount(PlanciaModal, { props: { open: true, title: 'T' }, slots: { default: () => h('p', 'x') } })
    await nextTick()
    ;(document.body.querySelector('.plancia-modal__close') as HTMLElement).click()
    expect(w.emitted('update:open')?.at(-1)).toEqual([false])
    expect(w.emitted('close')).toHaveLength(1)
  })

  it('Escape closes when closeOnEsc (default)', async () => {
    const w = mount(PlanciaModal, { props: { open: true } })
    await nextTick()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(w.emitted('update:open')?.at(-1)).toEqual([false])
  })

  it('Escape is ignored when closeOnEsc=false', async () => {
    const w = mount(PlanciaModal, { props: { open: true, closeOnEsc: false } })
    await nextTick()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(w.emitted('update:open')).toBeUndefined()
  })

  it('backdrop mousedown closes, panel mousedown does not', async () => {
    const w = mount(PlanciaModal, { props: { open: true } })
    await nextTick()
    panel()!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(w.emitted('update:open')).toBeUndefined()
    ;(document.body.querySelector('.plancia-modal') as HTMLElement).dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true }),
    )
    expect(w.emitted('update:open')?.at(-1)).toEqual([false])
  })

  it('closeOnBackdrop=false keeps it open on backdrop click', async () => {
    const w = mount(PlanciaModal, { props: { open: true, closeOnBackdrop: false } })
    await nextTick()
    ;(document.body.querySelector('.plancia-modal') as HTMLElement).dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true }),
    )
    expect(w.emitted('update:open')).toBeUndefined()
  })

  it('renders a title (with aria-labelledby) and the footer slot', async () => {
    const w = mount(PlanciaModal, {
      props: { open: true, title: 'Hello' },
      slots: { default: () => h('p', 'body'), footer: () => h('button', 'OK') },
    })
    await nextTick()
    const titleEl = document.body.querySelector('.plancia-modal__title') as HTMLElement
    expect(titleEl.textContent).toContain('Hello')
    expect(panel()!.getAttribute('aria-labelledby')).toBe(titleEl.id)
    expect(document.body.querySelector('.plancia-modal__footer')).not.toBeNull()
    void w
  })

  it('ref-counts the scroll-lock across stacked modals', async () => {
    const a = mount(PlanciaModal, { props: { open: true } })
    const b = mount(PlanciaModal, { props: { open: true } })
    await nextTick()
    expect(document.body.style.overflow).toBe('hidden')
    await a.setProps({ open: false })
    expect(document.body.style.overflow).toBe('hidden') // b still open
    await b.setProps({ open: false })
    expect(document.body.style.overflow).toBe('')
  })
})
