import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/**
 * A number that changes whenever the page's theme may have: an attribute
 * of <html> or <body> (a class, data-theme, a style), or the system's light
 * or dark. What draws with resolved colours (Mermaid) draws again on it.
 */
export function useThemeChange(): Ref<number> {
  const version = ref(0)
  let observer: MutationObserver | null = null
  let media: MediaQueryList | null = null
  const bump = () => version.value++
  onMounted(() => {
    if (typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(bump)
      for (const el of [document.documentElement, document.body]) {
        observer.observe(el, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-preset'] })
      }
    }
    media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
    media?.addEventListener?.('change', bump)
  })
  onBeforeUnmount(() => {
    observer?.disconnect()
    media?.removeEventListener?.('change', bump)
  })
  return version
}
