/**
 * Design tokens — the single source of truth for every colour, space, radius,
 * type size, glow and duration in the app.
 *
 * Nothing else in the codebase may hardcode a visual value. Tailwind's theme is
 * GENERATED from this file by `scripts/generate-tokens-css.ts` (wired in as a
 * Vite plugin), so editing a value here updates the utility classes and any
 * TypeScript that reads the raw value at the same time. There is no second
 * place to edit.
 *
 * Visual direction (BRIEF.md Part 7): dark, minimal, quietly premium. Layered
 * near-black, one accent, a muted red used only for soreness and joint-pain
 * flags, and a soft accent glow reserved for at most two elements per screen.
 */

export const colors = {
  /** Page background — near-black, per Part 7. */
  bg: '#0A0A0B',
  /** Cards: a touch lighter than the page, so the dark is layered not flat. */
  surface: '#121214',
  /** Set rows, steppers, controls sitting on top of a card. */
  surfaceRaised: '#1A1A1D',
  /** Hairline dividers and card edges. */
  border: '#232327',
  /** Slightly brighter edge for the element holding focus. */
  borderStrong: '#33333A',

  /** The only accent: cool white with a faint blue cast. */
  accent: '#EEF3FF',
  /** Primary reading text. */
  text: '#EEF3FF',
  /** Labels and secondary copy. */
  textSecondary: '#8A8A93',
  /** Last session's greyed-out numbers — the target to beat. */
  textMuted: '#56565E',
  /** Text placed on top of an accent-filled surface. */
  onAccent: '#0A0A0B',

  /** Muted red. Reserved exclusively for "still sore" and joint-pain flags. */
  alert: '#C25A50',
  /** Dimmed alert, for the tint behind a flagged row. */
  alertSurface: '#2A1614',
} as const

/**
 * The light theme (product-owner request; the brief's Part 7 identity remains
 * dark and dark stays the default). Same token names, resolved under
 * [data-theme="light"] — components never know which theme is active. The
 * accent inverts to ink: in light, interactive weight is carried by near-black
 * fills and soft grey shadows rather than glow.
 */
export const lightColors: Record<keyof typeof colors, string> = {
  bg: '#F4F5F8',
  surface: '#FFFFFF',
  surfaceRaised: '#ECEEF3',
  border: '#DCDFE6',
  borderStrong: '#B9BEC9',
  accent: '#14161C',
  text: '#14161C',
  textSecondary: '#5A5E68',
  textMuted: '#9AA0AB',
  onAccent: '#F7F9FF',
  alert: '#B4453B',
  alertSurface: '#F6DEDA',
} as const

/**
 * The signature glow. Accent-coloured outer light that reads as if it is coming
 * *from* the element. Part 7 allows at most two glowing things per screen.
 */
export const glow = {
  /** Resting state of an interactive element. */
  soft: '0 0 0 1px rgba(238,243,255,0.10), 0 0 24px -6px rgba(238,243,255,0.22)',
  /** The one primary action, or the active set row. */
  strong:
    '0 0 0 1px rgba(238,243,255,0.22), 0 0 40px -8px rgba(238,243,255,0.42), 0 0 80px -20px rgba(238,243,255,0.30)',
  /** Rest-timer ring and other live elements. */
  ring: '0 0 32px -4px rgba(238,243,255,0.35)',
  /** Joint pain / still sore only. */
  alert: '0 0 0 1px rgba(194,90,80,0.30), 0 0 28px -8px rgba(194,90,80,0.35)',
  none: 'none',
} as const

/** Light-mode shadows: ink-grey depth instead of emitted light. */
export const lightGlow: Record<keyof typeof glow, string> = {
  soft: '0 0 0 1px rgba(20,22,28,0.06), 0 4px 16px -6px rgba(20,22,28,0.18)',
  strong:
    '0 0 0 1px rgba(20,22,28,0.10), 0 8px 28px -8px rgba(20,22,28,0.30), 0 2px 8px -2px rgba(20,22,28,0.18)',
  ring: '0 6px 24px -4px rgba(20,22,28,0.25)',
  alert: '0 0 0 1px rgba(180,69,59,0.30), 0 4px 20px -8px rgba(180,69,59,0.30)',
  none: 'none',
} as const

/** 4px base scale. Part 7 asks for generous negative space, so it runs long. */
export const space = {
  '0': '0px',
  '1': '4px',
  '2': '8px',
  '3': '12px',
  '4': '16px',
  '5': '20px',
  '6': '24px',
  '8': '32px',
  '10': '40px',
  '12': '48px',
  '16': '64px',
  '20': '80px',
  '24': '96px',
} as const

/**
 * Text measure. Part 7 asks for small text set generously spaced, which only
 * reads well if the line length is capped.
 */
export const measure = {
  // Keys carry the `measure` prefix so the generated utilities read as
  // `max-w-measure-base` rather than the ambiguous `max-w-base`.
  measureTight: '24ch',
  measureBase: '30ch',
  measureWide: '38ch',
} as const

export const radius = {
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  '2xl': '28px',
  full: '9999px',
} as const

/**
 * Two faces. Space Grotesk is the characterful one and is used for numbers
 * only — weights, reps, the timer — with tabular figures so digits don't jump
 * as they change. Inter carries everything else, small and generously spaced.
 * Both are self-hosted npm packages, never a CDN, because a webfont fetched
 * over the network is a blank screen in airplane mode.
 */
export const font = {
  numeric: "'Space Grotesk Variable', 'Space Grotesk', ui-monospace, monospace",
  text: "'Inter Variable', 'Inter', ui-sans-serif, system-ui, sans-serif",
} as const

/** The numbers are the content, so the numeric scale runs large and tight. */
export const fontSize = {
  micro: '11px',
  xs: '12px',
  sm: '14px',
  base: '16px',
  lg: '20px',
  xl: '24px',
  '2xl': '32px',
  '3xl': '44px',
  '4xl': '60px',
  '5xl': '80px',
} as const

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const

export const letterSpacing = {
  /** Numbers set tight. */
  tight: '-0.03em',
  normal: '0em',
  /** Small text set generously spaced, per Part 7. */
  wide: '0.04em',
  /** Section labels. */
  wider: '0.12em',
} as const

export const lineHeight = {
  tight: '1.0',
  snug: '1.25',
  normal: '1.5',
  relaxed: '1.7',
} as const

/**
 * Restrained motion. Every duration here is bypassed entirely when the OS
 * reports `prefers-reduced-motion`.
 */
export const duration = {
  instant: '80ms',
  fast: '140ms',
  base: '220ms',
  slow: '380ms',
} as const

export const easing = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  settle: 'cubic-bezier(0.16, 1, 0.3, 1)',
} as const

/** Quality floor from Part 7: nothing tappable is smaller than 44px. */
export const size = {
  touchMin: '44px',
  /** Steppers and the primary action want more than the minimum. */
  touchComfortable: '56px',
  control: '64px',
} as const

export const tokens = {
  colors,
  lightColors,
  glow,
  lightGlow,
  space,
  measure,
  radius,
  font,
  fontSize,
  fontWeight,
  letterSpacing,
  lineHeight,
  duration,
  easing,
  size,
} as const

export type Tokens = typeof tokens
