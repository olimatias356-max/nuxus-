import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LucideIcon } from '@/ui/icons';

import { Text } from './Text';
import { colors, radius, space } from './theme';

export type SheetAction = { label: string; icon?: LucideIcon; danger?: boolean; onPress: () => void; hint?: string };

type Props = { visible: boolean; title?: string; actions: SheetAction[]; onClose: () => void };

export function ActionSheet({ visible, title, actions, onClose }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cerrar" accessibilityRole="button" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space[4]) }]} accessibilityViewIsModal>
        <View style={styles.handle} />
        {title ? (
          <Text variant="smallStrong" tone="muted" align="center" style={{ marginBottom: space[2] }}>
            {title}
          </Text>
        ) : null}
        {actions.map(({ label, icon: Icon, danger, onPress, hint }) => (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={hint}
            onPress={() => {
              onClose();
              setTimeout(onPress, 250);
            }}
            style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.surface3 }]}>
            {Icon ? <Icon size={21} color={danger ? colors.danger : colors.text} /> : null}
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" tone={danger ? 'danger' : 'default'}>
                {label}
              </Text>
              {hint ? (
                <Text variant="small" tone="subtle">
                  {hint}
                </Text>
              ) : null}
            </View>
          </Pressable>
        ))}
        <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.7 }]}>
          <Text variant="bodyStrong">Cancelar</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: space[3], paddingTop: space[2] },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.surface3, marginBottom: space[3] },
  action: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[3], paddingVertical: 14, borderRadius: radius.md, minHeight: 52 },
  cancel: { marginTop: space[2], height: 52, borderRadius: radius.md, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
});
