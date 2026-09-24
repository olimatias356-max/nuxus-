import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, X } from 'lucide-react-native';

import { IconButton } from './IconButton';
import { Text } from './Text';
import { colors, space } from './theme';

type Props = {
  title?: string;
  subtitle?: string;
  back?: boolean | 'close';
  onBack?: () => void;
  right?: ReactNode;
  large?: boolean;
  transparent?: boolean;
  safeTop?: boolean;
};

export function Header({ title, subtitle, back = true, onBack, right, large, transparent, safeTop = true }: Props) {
  const insets = useSafeAreaInsets();
  const goBack = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  return (
    <View style={[styles.wrap, { paddingTop: (safeTop ? insets.top : 0) + 6 }, !transparent && styles.solid]}>
      <View style={styles.row}>
        <View style={styles.side}>
          {back ? (
            <IconButton icon={back === 'close' ? X : ChevronLeft} label={back === 'close' ? 'Cerrar' : 'Volver'} onPress={goBack} size={26} />
          ) : null}
        </View>
        {!large && title ? (
          <View style={styles.center}>
            <Text variant="subheading" numberOfLines={1} accessibilityRole="header">
              {title}
            </Text>
            {subtitle ? (
              <Text variant="caption" tone="subtle" numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.center} />
        )}
        <View style={[styles.side, styles.right]}>{right}</View>
      </View>
      {large && title ? (
        <View style={styles.large}>
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="body" tone="muted" style={{ marginTop: 4 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space[2], paddingBottom: 6, zIndex: 5 },
  solid: { backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  side: { width: 96, flexDirection: 'row', alignItems: 'center' },
  right: { justifyContent: 'flex-end' },
  center: { flex: 1, alignItems: 'center' },
  large: { paddingHorizontal: space[3], paddingTop: space[2], paddingBottom: space[2] },
});
