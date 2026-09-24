import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { LucideIcon } from '@/ui/icons';

import { Text } from './Text';
import { colors, radius } from './theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'lg' | 'md' | 'sm';

export type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  title: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: LucideIcon;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
};

const bg: Record<Variant, string> = {
  primary: colors.accent,
  secondary: colors.surface3,
  ghost: 'transparent',
  danger: colors.dangerSoft,
  outline: 'transparent',
};
const fg: Record<Variant, string> = {
  primary: colors.onAccent,
  secondary: colors.text,
  ghost: colors.text,
  danger: colors.danger,
  outline: colors.text,
};
const heights: Record<Size, number> = { lg: 54, md: 46, sm: 36 };

export function Button({
  title,
  variant = 'primary',
  size = 'lg',
  loading,
  disabled,
  icon: Icon,
  full = true,
  style,
  onPress,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      accessibilityLabel={title}
      disabled={isDisabled}
      onPress={(e) => {
        if (variant === 'primary') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.(e);
      }}
      style={({ pressed }) => [
        styles.base,
        {
          height: heights[size],
          paddingHorizontal: size === 'sm' ? 14 : 20,
          borderRadius: size === 'sm' ? radius.full : radius.md,
          backgroundColor: pressed && variant === 'primary' ? colors.accentPressed : bg[variant],
          alignSelf: full ? 'stretch' : 'flex-start',
          opacity: isDisabled ? 0.5 : pressed && variant !== 'primary' ? 0.75 : 1,
          borderWidth: variant === 'outline' ? 1 : 0,
          borderColor: colors.borderStrong,
        },
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={fg[variant]} />
      ) : (
        <View style={styles.row}>
          {Icon ? <Icon size={size === 'sm' ? 16 : 19} color={fg[variant]} strokeWidth={2.2} /> : null}
          <Text variant={size === 'sm' ? 'smallStrong' : 'bodyStrong'} style={{ color: fg[variant] }} numberOfLines={1}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
