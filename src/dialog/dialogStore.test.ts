import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlanciaDialogStore } from './dialogStore'

beforeEach(() => setActivePinia(createPinia()))

describe('usePlanciaDialogStore', () => {
  it('queues a confirm and resolves it', async () => {
    const s = usePlanciaDialogStore()
    const p = s.confirm('Delete?')
    expect(s.queue).toHaveLength(1)
    expect(s.queue[0]!.kind).toBe('confirm')
    s.resolve(s.queue[0]!.id, true)
    await expect(p).resolves.toBe(true)
    expect(s.queue).toHaveLength(0)
  })

  it('dismiss returns the kind default (confirm → false)', async () => {
    const s = usePlanciaDialogStore()
    const p = s.confirm({ message: 'x' })
    s.dismiss(s.queue[0]!.id)
    await expect(p).resolves.toBe(false)
  })

  it('prompt resolves a string; dismiss → null', async () => {
    const s = usePlanciaDialogStore()
    const p1 = s.prompt('Name?')
    s.resolve(s.queue[0]!.id, 'Ada')
    await expect(p1).resolves.toBe('Ada')

    const p2 = s.prompt('Name?')
    s.dismiss(s.queue[0]!.id)
    await expect(p2).resolves.toBeNull()
  })

  it('alert resolves undefined', async () => {
    const s = usePlanciaDialogStore()
    const p = s.alert('Done')
    s.resolve(s.queue[0]!.id, undefined)
    await expect(p).resolves.toBeUndefined()
  })

  it('stacks multiple requests, resolving each independently', async () => {
    const s = usePlanciaDialogStore()
    const a = s.confirm('a')
    const b = s.confirm('b')
    expect(s.queue).toHaveLength(2)
    const idA = s.queue[0]!.id
    const idB = s.queue[1]!.id
    s.resolve(idB, true)
    expect(s.queue.map((d) => d.id)).toEqual([idA])
    s.resolve(idA, false)
    await expect(a).resolves.toBe(false)
    await expect(b).resolves.toBe(true)
  })
})
