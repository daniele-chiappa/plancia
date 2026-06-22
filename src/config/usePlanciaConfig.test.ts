// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { applyTheme, themeToCss, themeToStyle } from './usePlanciaConfig'
import { defineConfig } from './types'

afterEach(() => document.documentElement.removeAttribute('style'))

describe('config helpers', () => {
  it('themeToStyle normalizes keys to CSS custom properties', () => {
    expect(themeToStyle({ '--plancia-accent': 'red', 'plancia-text': 'blue' })).toEqual({
      '--plancia-accent': 'red',
      '--plancia-text': 'blue',
    })
    expect(themeToStyle()).toEqual({})
  })

  it('themeToCss renders a :root block', () => {
    const css = themeToCss({ '--plancia-accent': '#000', 'plancia-text': '#fff' })
    expect(css).toContain(':root {')
    expect(css).toContain('--plancia-accent: #000;')
    expect(css).toContain('--plancia-text: #fff;')
  })

  it('applyTheme sets custom properties on the document root', () => {
    applyTheme({ '--plancia-accent': 'rebeccapurple' })
    expect(document.documentElement.style.getPropertyValue('--plancia-accent')).toBe('rebeccapurple')
  })

  it('defineConfig is an identity helper', () => {
    const c = defineConfig({ meta: { name: 'x' } })
    expect(c.meta?.name).toBe('x')
  })
})
