// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { CalendarView, decodeCalendarState, encodeCalendarState, type CalendarLoad, type CalendarRange, type CalendarTime } from '../src'
import { lessons } from './samples'

// The times of the lessons from 2026-11-23 to 2026-12-06, as gosidian's
// server gives them (POST /api/v1/calendar).
const times: CalendarTime[] = [
  { event: 0, id: 'lez', title: 'Lezione', start: '2026-11-23T18:00:00+01:00', end: '2026-11-23T19:30:00+01:00', place: 'Sala grande', repeats: true },
  { event: 0, id: 'lez', title: 'Lezione', start: '2026-11-26T18:00:00+01:00', end: '2026-11-26T19:30:00+01:00', place: 'Sala grande', repeats: true },
  { event: 0, id: 'lez', title: 'Lezione', start: '2026-12-07T18:00:00+01:00', end: '2026-12-07T19:30:00+01:00', place: 'Sala grande', repeats: true },
]

let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

function setup(props: Record<string, unknown> = {}, extra: CalendarTime[] = []) {
  const load = vi.fn(async (range: CalendarRange): Promise<CalendarLoad> => ({
    times: [...times, ...extra].filter((t) => t.start.slice(0, 10) >= range.from && t.start.slice(0, 10) <= range.to),
  }))
  wrapper = mount(CalendarView, {
    props: { modelValue: lessons, load, date: '2026-11-23', today: '2026-11-21', view: 'month', ...props },
    attachTo: document.body,
  })
  return { w: wrapper, load }
}

/** The last YAML the calendar wrote. */
function written(w: VueWrapper): string {
  const ev = w.emitted('update:modelValue') as string[][] | undefined
  return ev?.[ev.length - 1]?.[0] ?? ''
}

describe('the month', () => {
  it('asks the host for the days it shows and draws its times', async () => {
    const { w, load } = setup()
    await flushPromises()
    expect(load).toHaveBeenCalledWith({ from: '2026-10-26', to: '2026-12-06' })
    expect(w.findAll('[role="gridcell"]')).toHaveLength(42)
    const cell = w.find('[data-day="2026-11-26"]')
    expect(cell.attributes('aria-label')).toContain('1 event')
    expect(cell.text()).toContain('Lezione')
    expect(w.find('[data-day="2026-11-21"]').attributes('aria-current')).toBe('date')
  })

  it('puts in a "+N" the times a day has no room for', async () => {
    const many = Array.from({ length: 5 }, (_, i): CalendarTime => ({ event: 1, title: `T${i}`, start: '2026-11-25', all_day: true }))
    const { w } = setup({}, many)
    await flushPromises()
    const more = w.find('[data-day="2026-11-25"] .plancia-calendar__more')
    expect(more.text()).toBe('+2')
    await more.trigger('click')
    expect(w.emitted('update:view')?.at(-1)).toEqual(['day'])
    expect(w.emitted('update:date')?.at(-1)).toEqual(['2026-11-25'])
  })

  it('draws a time of several days as one bar', async () => {
    const { w } = setup({}, [{ event: 1, title: 'Festival', start: '2026-11-27', end: '2026-11-30', all_day: true }])
    await flushPromises()
    const bars = w.findAll('.plancia-calendar__event--bar')
    // From Friday to Sunday, then on in the next week.
    expect(bars.map((b) => [b.element.closest('[data-day]')?.getAttribute('data-day'), (b.element as HTMLElement).style.getPropertyValue('--span')])).toEqual([
      ['2026-11-27', '3'],
      ['2026-11-30', '1'],
    ])
  })

  it('moves the focus with the arrows, and the month when it leaves it', async () => {
    const { w } = setup()
    await flushPromises()
    const start = w.find('[data-day="2026-11-23"]')
    expect(start.attributes('tabindex')).toBe('0')
    ;(start.element as HTMLElement).focus()
    const press = async (key: string) => {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      await flushPromises()
    }
    await press('ArrowRight')
    expect(document.activeElement?.getAttribute('data-day')).toBe('2026-11-24')
    expect(w.emitted('update:date')).toBeUndefined()
    await press('ArrowDown')
    expect(document.activeElement?.getAttribute('data-day')).toBe('2026-12-01')
    expect(w.emitted('update:date')?.at(-1)).toEqual(['2026-12-01'])
  })

  it('reads its problems and the host\'s, once each', async () => {
    const load = async (): Promise<CalendarLoad> => ({
      times: [],
      problems: [{ line: 5, message: 'the first date, 2026-11-24 (Tue), is not a date of the rule' }],
    })
    wrapper = mount(CalendarView, { props: { modelValue: 'events:\n  - date: 2026-11-02\n', load, date: '2026-11-23', view: 'month' } })
    await flushPromises()
    const items = wrapper.findAll('.plancia-calendar__problems li').map((li) => li.text())
    expect(items).toEqual(['line 2: an event has a title', 'line 5: the first date, 2026-11-24 (Tue), is not a date of the rule'])
  })

  it('says the calendar in words for a screen reader', async () => {
    const { w } = setup({ timezone: 'Europe/Rome' })
    await flushPromises()
    expect(w.find('.plancia-calendar__alt').text()).toMatch(/^calendar of 1 event, times in Europe\/Rome/)
  })
})

describe('the editor', () => {
  it('makes an event on the day clicked', async () => {
    const { w } = setup()
    await flushPromises()
    await w.find('[data-day="2026-11-25"]').trigger('click')
    const form = w.find('form[role="dialog"]')
    expect(form.exists()).toBe(true)
    await form.find('input[type="text"]').setValue('Riunione')
    await form.trigger('submit')
    expect(written(w)).toContain('  - title: Riunione\n    id: riunione\n    date: 2026-11-25\n')
    expect(w.find('form[role="dialog"]').exists()).toBe(false)
  })

  it('says what is missing, and saves nothing', async () => {
    const { w } = setup()
    await flushPromises()
    await w.find('[data-day="2026-11-25"]').trigger('click')
    await w.find('form[role="dialog"]').trigger('submit')
    expect(w.find('.plancia-calendar__error').text()).toBe('An event has a title.')
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })

  it('asks which times a change of a repeated event is for', async () => {
    const { w } = setup()
    await flushPromises()
    await w.find('[data-day="2026-11-26"] .plancia-calendar__event').trigger('click')
    const form = w.find('form[role="dialog"]')
    await form.find('input[type="text"]').setValue('Esame')
    await form.trigger('submit')
    const dialog = w.find('.plancia-calendar__dialog--small')
    expect(dialog.text()).toContain('This time only')
    await dialog.find('input[value="this"]').setValue(true)
    await dialog.findAll('button').at(-1)!.trigger('click')
    expect(written(w)).toContain('      - {date: 2026-11-26, title: Esame}')
  })

  it('deletes one time with a change that cancels it', async () => {
    const { w } = setup()
    await flushPromises()
    await w.find('[data-day="2026-11-26"] .plancia-calendar__event').trigger('click')
    await w.find('.plancia-calendar__button--danger').trigger('click')
    const dialog = w.find('.plancia-calendar__dialog--small')
    await dialog.find('input[value="this"]').setValue(true)
    await dialog.findAll('button').at(-1)!.trigger('click')
    expect(written(w)).toContain('      - {date: 2026-11-26, cancel: true}')
  })

  it('changes nothing when read only', async () => {
    const { w } = setup({ readonly: true })
    await flushPromises()
    await w.find('[data-day="2026-11-25"]').trigger('click')
    expect(w.find('form[role="dialog"]').exists()).toBe(false)
    expect(w.text()).toContain('Read only')
  })

  it('closes the form with Escape', async () => {
    const { w } = setup()
    await flushPromises()
    await w.find('[data-day="2026-11-25"]').trigger('click')
    await w.find('.plancia-calendar__overlay').trigger('keydown', { key: 'Escape' })
    expect(w.find('form[role="dialog"]').exists()).toBe(false)
  })
})

describe('the other views', () => {
  it('place the times of a week by their hours', async () => {
    const { w, load } = setup({ view: 'week' })
    await flushPromises()
    expect(load).toHaveBeenLastCalledWith({ from: '2026-11-23', to: '2026-11-29' })
    const ev = w.find('[data-day="2026-11-26"] .plancia-calendar__event')
    // 18:00 at 48 pixels an hour; an hour and a half, less the gap.
    expect((ev.element as HTMLElement).style.top).toBe('864px')
    expect((ev.element as HTMLElement).style.height).toBe('70px')
    expect(ev.attributes('aria-label')).toBe('Lezione, 18:00–19:30, Sala grande')
  })

  it('list the days with times, and say a note to open', async () => {
    const { w } = setup({ view: 'list' }, [{ event: 0, title: 'Visita', start: '2026-11-25', all_day: true, link: '[[gite/museo]]' }])
    await flushPromises()
    const days = w.findAll('.plancia-calendar__list-date').map((h) => h.text())
    expect(days).toEqual(['Monday, November 23, 2026', 'Wednesday, November 25, 2026', 'Thursday, November 26, 2026'])
    await w.find('.plancia-calendar__link').trigger('click')
    expect(w.emitted('link')?.[0]).toEqual([{ target: '[[gite/museo]]' }])
  })

  it('step by their own length', async () => {
    const { w } = setup({ view: 'day' })
    await flushPromises()
    await w.find('button[aria-label="Next"]').trigger('click')
    expect(w.emitted('update:date')?.at(-1)).toEqual(['2026-11-24'])
    await w.setProps({ view: 'month', date: '2027-01-31' })
    await w.find('button[aria-label="Next"]').trigger('click')
    expect(w.emitted('update:date')?.at(-1)).toEqual(['2027-02-28'])
  })

  it('take their words from the host', async () => {
    const { w } = setup({ labels: { views: { month: 'Mese', week: 'Settimana', day: 'Giorno', list: 'Elenco' } }, locale: 'it' })
    await flushPromises()
    expect(w.findAll('[role="group"] button').map((b) => b.text())).toEqual(['Mese', 'Settimana', 'Giorno', 'Elenco'])
    expect(w.find('.plancia-calendar__title').text()).toBe('novembre 2026')
  })
})

describe('the state in an address', () => {
  it('reads back as written', () => {
    expect(encodeCalendarState({ view: 'week', date: '2026-11-23' })).toBe('week.2026-11-23')
    expect(decodeCalendarState('week.2026-11-23')).toEqual({ view: 'week', date: '2026-11-23' })
    expect(decodeCalendarState('year.2026-11-23')).toBeNull()
    expect(decodeCalendarState('month.2026-02-30')).toBeNull()
  })
})

describe('the rows of a source', () => {
  const rows: CalendarTime[] = [
    { event: -1, title: 'Piano A', start: '2026-11-25', all_day: true, row: 'p/plans/a.md', source: 0, field: 'due', movable: true },
    { event: -1, title: 'Piano B', start: '2026-11-25', end: '2026-11-26', all_day: true, row: 'p/plans/b.md', source: 0, field: 'due', end_field: 'until' },
  ]

  /** Drags el to the day cell, as a pointer does. */
  async function dragTo(el: Element, day: string) {
    const target = document.querySelector(`[data-day="${day}"]`)!
    // jsdom has no elementFromPoint: the pointer is over the cell.
    const doc = document as unknown as { elementFromPoint?: () => Element }
    doc.elementFromPoint = () => target
    el.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 10, clientY: 10, bubbles: true }))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 80, clientY: 40 }))
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: 80, clientY: 40 }))
    delete doc.elementFromPoint
    await flushPromises()
  }

  it('draws them apart from the events, each one', async () => {
    const { w } = setup({}, rows)
    await flushPromises()
    const drawn = w.findAll('[data-day="2026-11-25"] .plancia-calendar__event--row')
    // The bar of two days first, as for the events.
    expect(drawn.map((b) => b.attributes('aria-label'))).toEqual(['Piano B, row', 'Piano A, row'])
    expect(w.findAll('.plancia-calendar__event:not(.plancia-calendar__event--row)').length).toBeGreaterThan(0)
  })

  it('open on the host, never in the form', async () => {
    const { w } = setup({}, rows)
    await flushPromises()
    await w.find('[data-day="2026-11-25"] [aria-label="Piano A, row"]').trigger('click')
    expect(w.emitted('open-row')?.[0]).toEqual([{ time: rows[0] }])
    expect(w.find('form').exists()).toBe(false)
  })

  it('move on the host when it lets them, their length kept', async () => {
    const { w } = setup({}, rows)
    await flushPromises()
    const a = w.find('[data-day="2026-11-25"] [aria-label="Piano A, row"]')
    const b = w.find('[data-day="2026-11-25"] [aria-label="Piano B, row"]')
    await dragTo(a.element, '2026-11-27')
    expect(w.emitted('move-row')).toEqual([[{ time: rows[0], start: '2026-11-27', end: '2026-11-27' }]])
    // Piano B is not movable: it stays, and the YAML is never written.
    await dragTo(b.element, '2026-11-27')
    expect(w.emitted('move-row')).toHaveLength(1)
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })

  it('stay where they are when read only', async () => {
    const { w } = setup({ readonly: true }, rows)
    await flushPromises()
    await dragTo(w.find('[data-day="2026-11-25"] [aria-label="Piano A, row"]').element, '2026-11-27')
    expect(w.emitted('move-row')).toBeUndefined()
  })

  it('are marked in the list', async () => {
    const { w } = setup({ view: 'list' }, rows)
    await flushPromises()
    const items = w.findAll('.plancia-calendar__list-item--row')
    expect(items.length).toBe(3) // Piano B is on two days
    expect(items[0]!.text()).toContain('row')
  })
})
