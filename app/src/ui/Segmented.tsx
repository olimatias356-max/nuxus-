import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { colors, radius } from './theme';

type Props<T extends string> = { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void };

export function Segmented<T extends string>({ value, options, onChange }: Props<T>) {
  return (
    <View style={styles.wrap} accessibilityRole="tablist">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.item, selected && styles.selected]}>
            <Text variant="smallStrong" tone={selected ? 'onAccent' : 'muted'}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: radius.full, padding: 4, gap: 4 },
  item: { flex: 1, height: 36, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: colors.accent },
});
