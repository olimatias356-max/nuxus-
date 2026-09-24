// Design tokens. Dark-first: content (photos, video) is the hero, the UI
// recedes; a single electric-lime accent marks the primary action.
// Text colors keep WCAG AA contrast on `bg` and `surface`.
export const colors = {
  bg: '#0A0A0F',
  surface: '#131319',
  surface2: '#1B1B23',
  surface3: '#262631',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',
  text: '#F5F5F7',
  textMuted: '#A6A6B2',
  textSubtle: '#80808D',
  accent: '#C8FF3D',
  accentPressed: '#B3E62E',
  onAccent: '#0A0A0F',
  accentSoft: 'rgba(200,255,61,0.12)',
  like: '#FF3B6B',
  verified: '#3D9BFF',
  success: '#34D399',
  successSoft: 'rgba(52,211,153,0.14)',
  warning: '#FBBF24',
  warningSoft: 'rgba(251,191,36,0.14)',
  danger: '#FF6B6B',
  dangerSoft: 'rgba(255,107,107,0.14)',
  overlay: 'rgba(5,5,8,0.62)',
  scrim: 'rgba(0,0,0,0.45)',
  white: '#FFFFFF',
} as const;

export const radius = { xs: 8, sm: 12, md: 16, lg: 20, xl: 28, full: 999 } as const;

export const space = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 32, 8: 40, 9: 48 } as const;

export const fonts = {
  display: 'Unbounded_700Bold',
  displayBlack: 'Unbounded_800ExtraBold',
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

export const type = {
  hero: { fontFamily: fonts.displayBlack, fontSize: 34, lineHeight: 40, letterSpacing: -0.8 },
  title: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.extrabold, fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  subheading: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  smallStrong: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.2 },
  number: { fontFamily: fonts.displayBlack, fontSize: 32, lineHeight: 38, letterSpacing: -1 },
} as const;

export const hitSlop = { top: 10, bottom: 10, left: 10, right: 10 } as const;

export const TAB_BAR_HEIGHT = 62;
