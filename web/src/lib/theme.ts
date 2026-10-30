// Applies a company's branding to the whole app via CSS variables.
import type { Company } from './types'

export type Branding = Pick<Company, 'accent_color' | 'sidebar_color' | 'theme_mode'>

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

/** White or near-black, whichever reads better on the colour. */
export function inkOn(hex: string) {
  return contrast(hex, '#ffffff') >= contrast(hex, '#12161f') ? '#ffffff' : '#12161f'
}

function mix(hex: string, other: string, amount: number) {
  const a = rgb(hex)
  const b = rgb(other)
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * amount).toString(16).padStart(2, '0')).join('')
}

export function applyBranding(b: Branding) {
  const root = document.documentElement
  root.dataset.theme = b.theme_mode
  const s = root.style
  s.setProperty('--brand', b.accent_color)
  s.setProperty('--brand-ink', inkOn(b.accent_color))
  const chrome = b.sidebar_color
  const ink = inkOn(chrome)
  const dark = ink === '#ffffff'
  s.setProperty('--chrome', chrome)
  s.setProperty('--chrome-ink', ink)
  s.setProperty('--chrome-ink-2', mix(ink, chrome, 0.35))
  s.setProperty('--chrome-line', mix(chrome, ink, dark ? 0.14 : 0.1))
  s.setProperty('--chrome-hover', mix(chrome, ink, dark ? 0.09 : 0.05))
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', chrome)
}

export function chromeIsDark(sidebar: string) {
  return inkOn(sidebar) === '#ffffff'
}

export const PRESETS: { name: string; accent: string; sidebar: string; mode: 'light' | 'dark' }[] = [
  { name: 'Racing red', accent: '#b3121a', sidebar: '#141b2d', mode: 'light' },
  { name: 'Red on white', accent: '#b3121a', sidebar: '#ffffff', mode: 'light' },
  { name: 'Cobalt', accent: '#2f5bd3', sidebar: '#ffffff', mode: 'light' },
  { name: 'Emerald', accent: '#0f7a5a', sidebar: '#0f2a22', mode: 'light' },
  { name: 'Graphite', accent: '#c9a96e', sidebar: '#16181b', mode: 'dark' },
  { name: 'Midnight', accent: '#e4572e', sidebar: '#10131a', mode: 'dark' },
]
