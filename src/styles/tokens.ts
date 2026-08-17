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

  /**
   * The accent. Vivid red, per the product owner's design direction — this
   * deliberately supersedes BRIEF Part 7's cool-white accent (recorded in
   * PLAN.md). Everything else about Part 7 stands: layered near-black, one
   * accent only, glow on at most two elements per screen.
   */
  accent: '#F0323C',
  /** Chip/segment fill for an unselected option in the accent family. */
  accentSurface: '#2C1216',
  /** Its edge — visible on near-black without competing with a live accent. */
  accentBorder: '#6E2028',
  /** Primary reading text stays near-white: red is for accent, not prose. */
  text: '#F2F3F5',
  /** Labels and secondary copy. 6.4:1 even on the lightest raised surface. */
  textSecondary: '#9C9CA6',
  /**
   * The quietest step that is still *text you read*: last session's numbers,
   * stat captions, legends. Deliberately raised from #56565E, which measured
   * 2.7:1 against the near-black — under the 4.5:1 accessibility floor, and
   * failing the brief's own "legible at arm's length under gym lighting" on
   * exactly the 11px labels it was carrying.
   *
   * Rated against `surfaceRaised`, not the page background: this text mostly
   * sits on cards, and a card is lighter, so the card is the worst case
   * (4.75:1 there, 5.4:1 on the page). De-emphasis is carried by size, case
   * and weight — never by making text too dim to read.
   */
  textMuted: '#85858F',
  /**
   * Non-text decoration only — dot separators, empty-row placeholder dashes,
   * disabled affordances. Nothing here carries information, which is the one
   * case where contrast ratios do not apply. Never use it for words or
   * numbers a person has to read.
   */
  textFaint: '#56565E',
  /** Text placed on top of an accent-filled surface. */
  onAccent: '#FFFFFF',

  /**
   * Soreness and joint-pain flags. Duller and softer than the accent so a
   * warning never reads as a live control; those flags always carry a word as
   * well as a colour. Raised from #B3403A, which measured 3.3:1 on a card —
   * fine for the flag *fills*, but it also paints "Remove lock" and the
   * restore warning, which are sentences you have to read.
   */
  alert: '#DC6058',
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
  // The same red identity, one step deeper so it holds contrast on white.
  accent: '#D2202B',
  accentSurface: '#FCE9EA',
  accentBorder: '#F0B3B7',
  text: '#14161C',
  textSecondary: '#5A5E68',
  // Same correction as dark: #9AA0AB measured 2.6:1 on white. Now 4.6:1 on
  // the lightest surface it lands on.
  textMuted: '#656B76',
  textFaint: '#9AA0AB',
  onAccent: '#FFFFFF',
  // Deepened for the same reason as the dark alert, in the other direction.
  alert: '#A33A31',
  alertSurface: '#F6DEDA',
} as const

/**
 * The signature glow. Accent-coloured outer light that reads as if it is coming
 * *from* the element. Part 7 allows at most two glowing things per screen.
 */
export const glow = {
  /** Resting state of an interactive element. */
  soft: '0 0 0 1px rgba(240,50,60,0.16), 0 0 24px -6px rgba(240,50,60,0.30)',
  /** The one primary action, or the active set row. */
  strong:
    '0 0 0 1px rgba(240,50,60,0.30), 0 0 40px -8px rgba(240,50,60,0.55), 0 0 80px -20px rgba(240,50,60,0.40)',
  /** Rest-timer ring and other live elements. */
  ring: '0 0 32px -4px rgba(240,50,60,0.45)',
  /** Joint pain / still sore only. Tracks the alert colour above. */
  alert: '0 0 0 1px rgba(220,96,88,0.35), 0 0 28px -8px rgba(220,96,88,0.40)',
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
