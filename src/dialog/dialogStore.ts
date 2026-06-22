/**
 * Imperative dialog service (Pinia, opt-in). A queue of serializable dialog
 * requests + an ergonomic `useDialogs()` facade. Render the queue once with
 * <PlanciaDialogHost> at app root. Implements ADR-002: the Promise resolvers
 * live OUTSIDE the store state (module-level Map) so the store stays
 * serializable; the store delegates UI to the same PlanciaConfirm/PlanciaModal
 * primitives.
 *
 * Lets any caller — including other store actions — await user input:
 *   if (await useDialogs().confirm('Delete?')) { ... }
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { ConfirmOptions, DialogRequest, PromptOptions } from './types'

// Promise resolvers, keyed by request id. NOT in store state (keeps it
// serializable). Module-level: shared across the single logical service.
const resolvers = new Map<number, (value: any) => void>()
let seq = 0

function toConfirm(opts: string | ConfirmOptions): ConfirmOptions {
  return typeof opts === 'string' ? { message: opts } : opts
}
function toPrompt(opts: string | PromptOptions): PromptOptions {
  return typeof opts === 'string' ? { message: opts } : opts
}

export const usePlanciaDialogStore = defineStore('plancia-dialog', () => {
  const queue = ref<DialogRequest[]>([])

  function enqueue<T>(
    kind: DialogRequest['kind'],
    options: ConfirmOptions | PromptOptions,
  ): Promise<T> {
    const id = ++seq
    return new Promise<T>((resolve) => {
      resolvers.set(id, resolve as (value: any) => void)
      queue.value.push({ id, kind, options })
    })
  }

  function confirm(opts: string | ConfirmOptions): Promise<boolean> {
    return enqueue<boolean>('confirm', toConfirm(opts))
  }
  function alert(opts: string | ConfirmOptions): Promise<void> {
    return enqueue<void>('alert', toConfirm(opts))
  }
  function prompt(opts: string | PromptOptions): Promise<string | null> {
    return enqueue<string | null>('prompt', toPrompt(opts))
  }

  /** Resolve a request with a value and remove it from the queue. */
  function resolve(id: number, value: unknown): void {
    const r = resolvers.get(id)
    if (r) {
      r(value)
      resolvers.delete(id)
    }
    queue.value = queue.value.filter((d) => d.id !== id)
  }
  /** Dismiss with the kind's default (confirm→false, prompt→null, alert→undefined). */
  function dismiss(id: number): void {
    const d = queue.value.find((x) => x.id === id)
    const value = d?.kind === 'confirm' ? false : d?.kind === 'prompt' ? null : undefined
    resolve(id, value)
  }

  return { queue, confirm, alert, prompt, resolve, dismiss }
})

/** Ergonomic facade over the dialog store (callable from anywhere, incl. store actions). */
export function useDialogs() {
  const s = usePlanciaDialogStore()
  return { confirm: s.confirm, alert: s.alert, prompt: s.prompt }
}
