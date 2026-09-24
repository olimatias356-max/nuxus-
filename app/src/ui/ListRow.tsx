import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';

import { Text } from './Text';
import { colors, radius, space } from './theme';

type Props = {
  icon?: LucideIcon;
  iconColor?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  danger?: boolean;
  chevron?: boolean;
};

export function ListRow({ icon: Icon, iconColor = colors.text, title, subtitle, right, onPress, danger, chevron = !!onPress }: Props) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface2 }]}>
      {Icon ? (
        <View style={[styles.icon, danger && { backgroundColor: colors.dangerSoft }]}>
          <Icon size={19} color={danger ? colors.danger : iconColor} strokeWidth={2} />
        </View>
      ) : null}
      <View style={styles.body}>
        <Text variant="bodyStrong" tone={danger ? 'danger' : 'default'}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" tone="subtle" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron ? <ChevronRight size={18} color={colors.textSubtle} /> : null}
    </Pressable>
  );
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      {title ? (
        <Text variant="caption" tone="subtle" style={styles.sectionTitle}>
          {title.toUpperCase()}
        </Text>
      ) : null}
      <View style={styles.group}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: 13, minHeight: 56 },
  icon: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  section: { gap: space[2], marginBottom: space[5] },
  sectionTitle: { marginLeft: space[2], letterSpacing: 1 },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
});
