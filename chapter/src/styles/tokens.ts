/**
 * The single source of truth for every colour and spacing value in Chapter.
 *
 * Nothing in a component may hardcode a colour. Components reference the CSS
 * custom properties emitted from here by `npm run make-tokens`, which writes
 * `tokens.css`. `tokens.test.ts` fails if that file has drifted from this one,
 * so the two cannot get out of sync.
 *
 * One accent: deep amber. It appears in two roles — `accent` for fills and the
 * large streak number, `accentInk` for accent-coloured text, which has to be
 * darker in light mode to clear 4.5:1. Same hue, two jobs.
 */

export interface Palette {
  ground: string
  surface: string
  surfaceSunk: string
  border: string
  ink: string
  inkQuiet: string
  inkFaint: string
  accent: string
  /** Text that sits ON the accent fill. Near-black in both themes: white on
   *  amber measures 3.74:1 in light and 2.02:1 in dark, both below AA. */
  onAccent: string
  accentInk: string
  accentSoft: string
  good: string
  warn: string
  shadow: string
  overlay: string
}

export const LIGHT: Palette = {
  ground: '#FBFAF8',
  surface: '#FFFFFF',
  surfaceSunk: '#F3F1ED',
  border: '#E6E2DA',
  ink: '#191714',
  inkQuiet: '#6B655C',
  inkFaint: '#8E877E',
  accent: '#C86C10',
  onAccent: '#1A1512',
  accentInk: '#A4560A',
  accentSoft: 'rgba(200, 108, 16, 0.12)',
  good: '#2E7D4F',
  warn: '#B4342A',
  shadow: 'rgba(25, 23, 20, 0.08)',
  overlay: 'rgba(25, 23, 20, 0.32)',
}

export const DARK: Palette = {
  ground: '#0C0B0A',
  surface: '#161412',
  surfaceSunk: '#100E0D',
  border: '#2A2622',
  ink: '#EDE9E3',
  inkQuiet: '#9A938A',
  inkFaint: '#6B655C',
  accent: '#F5A63D',
  onAccent: '#1A1512',
  accentInk: '#F5A63D',
  accentSoft: 'rgba(245, 166, 61, 0.16)',
  good: '#6FD09A',
  warn: '#F08A80',
  shadow: 'rgba(0, 0, 0, 0.5)',
  overlay: 'rgba(0, 0, 0, 0.6)',
}

/** Browser UI colour (iOS status bar area in standalone). Matches `ground`. */
export const THEME_COLOR = { light: LIGHT.ground, dark: DARK.ground } as const

export const SPACE = {
  xs: '0.25rem',
  sm: '0.5rem',
  md: '0.75rem',
  lg: '1rem',
  xl: '1.5rem',
  '2xl': '2rem',
  '3xl': '3rem',
} as const

export const RADIUS = { sm: '0.5rem', md: '0.875rem', lg: '1.25rem', full: '999px' } as const

export const FONTS = {
  sans: "'Inter Variable', ui-sans-serif, system-ui, -apple-system, sans-serif",
  serif: "'Literata Variable', ui-serif, Georgia, 'Times New Roman', serif",
} as const

/** Smallest tap target we allow anywhere. */
export const TOUCH_MIN = '44px'

function paletteVars(p: Palette): string[] {
  return Object.entries(p).map(([k, v]) => `  --${kebab(k)}: ${v};`)
}

function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
}

/** Emits the whole token layer as CSS. `make-tokens.ts` writes this to tokens.css. */
export function toCss(): string {
  const scale = [
    ...Object.entries(SPACE).map(([k, v]) => `  --space-${k}: ${v};`),
    ...Object.entries(RADIUS).map(([k, v]) => `  --radius-${k}: ${v};`),
    `  --font-sans: ${FONTS.sans};`,
    `  --font-serif: ${FONTS.serif};`,
    `  --touch-min: ${TOUCH_MIN};`,
  ]
  return [
    '/* GENERATED FROM src/styles/tokens.ts BY `npm run make-tokens`. DO NOT EDIT. */',
    ':root {',
    ...paletteVars(LIGHT),
    ...scale,
    '}',
    '',
    '[data-theme="dark"] {',
    ...paletteVars(DARK),
    '}',
    '',
  ].join('\n')
}

/* ---------- contrast, used by the audit test ---------- */

function channel(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m || !m[1]) throw new Error(`luminance() needs a #rrggbb hex, got ${hex}`)
  const n = parseInt(m[1], 16)
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  )
}

export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}
