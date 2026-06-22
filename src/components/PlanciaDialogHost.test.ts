// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import PlanciaDialogHost from './PlanciaDialogHost.vue'
import { useDialogs } from '../dialog/dialogStore'

enableAutoUnmount(afterEach)
let pinia: ReturnType<typeof createPinia>
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
})
afterEach(() => {
  document.body.innerHTML = ''
  document.body.style.overflow = ''
})

const mountHost = () => mount(PlanciaDialogHost, { global: { plugins: [pinia] } })
const footerButtons = () =>
  Array.from(
    document.body.querySelectorAll('.plancia-modal__footer .plancia-btn-text'),
  ) as HTMLElement[]

describe('PlanciaDialogHost', () => {
  it('renders a confirm and resolves true on confirm (then removes it)', async () => {
    mountHost()
    const p = useDialogs().confirm('Delete?')
    await nextTick()
    expect(document.body.querySelector('.plancia-confirm__message')?.textContent).toBe('Delete?')
    footerButtons()[1]!.click()
    await nextTick()
    await expect(p).resolves.toBe(true)
    expect(document.body.querySelector('.plancia-modal')).toBeNull()
  })

  it('resolves false on cancel', async () => {
    mountHost()
    const p = useDialogs().confirm('x')
    await nextTick()
    footerButtons()[0]!.click()
    await nextTick()
    await expect(p).resolves.toBe(false)
  })

  it('alert shows a single button and resolves on OK', async () => {
    mountHost()
    const p = useDialogs().alert('Saved')
    await nextTick()
    expect(footerButtons()).toHaveLength(1)
    footerButtons()[0]!.click()
    await nextTick()
    await expect(p).resolves.toBeUndefined()
  })

  it('prompt returns the typed value', async () => {
    mountHost()
    const p = useDialogs().prompt('Name?')
    await nextTick()
    const input = document.body.querySelector('.plancia-prompt__input') as HTMLInputElement
    input.value = 'Ada'
    input.dispatchEvent(new Event('input'))
    await nextTick()
    footerButtons()[1]!.click()
    await nextTick()
    await expect(p).resolves.toBe('Ada')
  })

  it('stacks two dialogs', async () => {
    mountHost()
    const a = useDialogs().confirm('a')
    const b = useDialogs().confirm('b')
    await nextTick()
    expect(document.body.querySelectorAll('.plancia-modal')).toHaveLength(2)
    void a
    void b
  })
})
