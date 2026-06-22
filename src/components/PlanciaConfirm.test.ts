// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import PlanciaConfirm from './PlanciaConfirm.vue'

enableAutoUnmount(afterEach)
afterEach(() => {
  document.body.innerHTML = ''
  document.body.style.overflow = ''
})

const buttons = () =>
  Array.from(
    document.body.querySelectorAll('.plancia-modal__footer .plancia-btn-text'),
  ) as HTMLElement[]

describe('PlanciaConfirm', () => {
  it('renders the message and two buttons', async () => {
    mount(PlanciaConfirm, { props: { open: true, message: 'Delete?' } })
    await nextTick()
    expect(document.body.querySelector('.plancia-confirm__message')?.textContent).toBe('Delete?')
    expect(buttons()).toHaveLength(2)
  })

  it('confirm emits confirm only (never cancel) and closes', async () => {
    const w = mount(PlanciaConfirm, { props: { open: true, message: 'x' } })
    await nextTick()
    buttons()[1]!.click() // confirm
    expect(w.emitted('confirm')).toHaveLength(1)
    expect(w.emitted('cancel')).toBeUndefined()
    expect(w.emitted('update:open')?.at(-1)).toEqual([false])
  })

  it('cancel emits cancel and closes', async () => {
    const w = mount(PlanciaConfirm, { props: { open: true, message: 'x' } })
    await nextTick()
    buttons()[0]!.click() // cancel
    expect(w.emitted('cancel')).toHaveLength(1)
    expect(w.emitted('confirm')).toBeUndefined()
    expect(w.emitted('update:open')?.at(-1)).toEqual([false])
  })

  it('Escape dismissal counts as cancel', async () => {
    const w = mount(PlanciaConfirm, { props: { open: true, message: 'x' } })
    await nextTick()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(w.emitted('cancel')).toHaveLength(1)
    expect(w.emitted('confirm')).toBeUndefined()
  })

  it('danger styles the confirm button', async () => {
    mount(PlanciaConfirm, { props: { open: true, message: 'x', danger: true } })
    await nextTick()
    expect(buttons()[1]!.classList.contains('plancia-btn-danger')).toBe(true)
  })
})
