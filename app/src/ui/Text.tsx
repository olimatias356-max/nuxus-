import { Text as RNText, type TextProps, type TextStyle } from 'react-native';

import { colors, type as typeScale } from './theme';

type Variant = keyof typeof typeScale;
type Tone = 'default' | 'muted' | 'subtle' | 'accent' | 'danger' | 'success' | 'warning' | 'onAccent' | 'white';

const toneColor: Record<Tone, string> = {
  default: colors.text,
  muted: colors.textMuted,
  subtle: colors.textSubtle,
  accent: colors.accent,
  danger: colors.danger,
  success: colors.success,
  warning: colors.warning,
  onAccent: colors.onAccent,
  white: colors.white,
};

export type AppTextProps = TextProps & {
  variant?: Variant;
  tone?: Tone;
  align?: TextStyle['textAlign'];
};

export function Text({ variant = 'body', tone = 'default', align, style, ...rest }: AppTextProps) {
  return (
    <RNText
      maxFontSizeMultiplier={1.6}
      {...rest}
      style={[typeScale[variant], { color: toneColor[tone] }, align ? { textAlign: align } : null, style]}
    />
  );
}
