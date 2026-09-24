import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, StyleSheet, View } from 'react-native';
import type { LucideIcon } from '@/ui/icons';

import { Button } from './Button';
import { Text } from './Text';
import { colors, radius, space } from './theme';

export function EmptyState({ icon: Icon, title, text, action, onAction }: { icon: LucideIcon; title: string; text?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon size={30} color={colors.accent} strokeWidth={2} />
      </View>
      <Text variant="subheading" align="center">
        {title}
      </Text>
      {text ? (
        <Text variant="body" tone="muted" align="center" style={{ maxWidth: 300 }}>
          {text}
        </Text>
      ) : null}
      {action && onAction ? <Button title={action} onPress={onAction} full={false} size="md" style={{ marginTop: space[2] }} /> : null}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.loading} accessibilityLabel={label ?? 'Cargando'} accessibilityRole="progressbar">
      <ActivityIndicator color={colors.accent} size="large" />
      {label ? (
        <Text variant="small" tone="muted">
          {label}
        </Text>
      ) : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.empty}>
      <Text variant="subheading" align="center">
        No pudimos cargar esto
      </Text>
      <Text variant="body" tone="muted" align="center">
        {message}
      </Text>
      {onRetry ? <Button title="Reintentar" variant="secondary" size="md" full={false} onPress={onRetry} /> : null}
    </View>
  );
}

export function Skeleton({ width, height, round, style }: { width?: number | `${number}%`; height: number; round?: boolean; style?: object }) {
  const [opacity] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[{ width: width ?? '100%', height, borderRadius: round ? height / 2 : radius.sm, backgroundColor: colors.surface2, opacity }, style]}
    />
  );
}

export function Card({ children, style, tone = 'default' }: { children: ReactNode; style?: object; tone?: 'default' | 'accent' | 'warning' | 'danger' | 'success' }) {
  const toneStyle =
    tone === 'accent'
      ? { backgroundColor: colors.accentSoft, borderColor: 'rgba(200,255,61,0.25)' }
      : tone === 'warning'
        ? { backgroundColor: colors.warningSoft, borderColor: 'rgba(251,191,36,0.25)' }
        : tone === 'danger'
          ? { backgroundColor: colors.dangerSoft, borderColor: 'rgba(255,107,107,0.25)' }
          : tone === 'success'
            ? { backgroundColor: colors.successSoft, borderColor: 'rgba(52,211,153,0.25)' }
            : null;
  return <View style={[styles.card, toneStyle, style]}>{children}</View>;
}

export function Pill({ label, tone = 'default', icon: Icon }: { label: string; tone?: 'default' | 'accent' | 'success' | 'warning' | 'danger'; icon?: LucideIcon }) {
  const map = {
    default: [colors.surface3, colors.text],
    accent: [colors.accentSoft, colors.accent],
    success: [colors.successSoft, colors.success],
    warning: [colors.warningSoft, colors.warning],
    danger: [colors.dangerSoft, colors.danger],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {Icon ? <Icon size={13} color={fg} strokeWidth={2.4} /> : null}
      <Text variant="caption" style={{ color: fg }}>
        {label}
      </Text>
    </View>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}>
      <View style={[styles.bar, { width: `${Math.max(2, Math.min(100, value * 100))}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center', padding: space[7], gap: space[3], flexGrow: 1 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: space[1] },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3], padding: space[7] },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space[4], borderWidth: 1, borderColor: colors.border },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.full, alignSelf: 'flex-start' },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surface3, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
});
