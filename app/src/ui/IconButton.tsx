import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { LucideIcon } from '@/ui/icons';

import { Text } from './Text';
import { colors, hitSlop } from './theme';

type Props = {
  icon: LucideIcon;
  label: string;
  onPress?: () => void;
  size?: number;
  color?: string;
  filled?: boolean;
  badge?: number;
  variant?: 'plain' | 'surface' | 'glass';
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
};

export function IconButton({ icon: Icon, label, onPress, size = 24, color = colors.text, filled, badge, variant = 'plain', style, disabled }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} sin leer` : label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      style={({ pressed }) => [
        styles.base,
        variant === 'surface' && styles.surface,
        variant === 'glass' && styles.glass,
        { opacity: pressed ? 0.6 : disabled ? 0.4 : 1 },
        style,
      ]}>
      <Icon size={size} color={color} fill={filled ? color : 'transparent'} strokeWidth={2} />
      {badge ? (
        <View style={styles.badge}>
          <Text variant="caption" style={styles.badgeText}>
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  surface: { backgroundColor: colors.surface2 },
  glass: { backgroundColor: 'rgba(10,10,15,0.45)' },
  badge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.like,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  badgeText: { color: colors.white, fontSize: 10, lineHeight: 12 },
});
