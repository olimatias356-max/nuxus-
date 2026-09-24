import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleAlert, CircleCheck } from '@/ui/icons';

import { Text } from './Text';
import { colors, radius, space } from './theme';

type ToastKind = 'success' | 'error' | 'info';
type ToastState = { id: number; message: string; kind: ToastKind } | null;

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null);
  const [anim] = useState(() => new Animated.Value(0));
  const insets = useSafeAreaInsets();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((message: string, kind: ToastKind = 'success') => {
    setToast({ id: Date.now(), message, kind });
    AccessibilityInfo.announceForAccessibility(message);
  }, []);

  useEffect(() => {
    if (!toast) return;
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, bounciness: 6 }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setToast(null));
    }, 2600);
  }, [toast, anim]);

  const Icon = toast?.kind === 'error' ? CircleAlert : CircleCheck;
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.wrap,
            { top: insets.top + 8, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }] },
          ]}>
          <View style={styles.toast}>
            <Icon size={18} color={toast.kind === 'error' ? colors.danger : colors.accent} />
            <Text variant="smallStrong" style={{ flexShrink: 1 }}>
              {toast.message}
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 1000 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 420,
    marginHorizontal: space[5],
    paddingHorizontal: space[4],
    paddingVertical: 12,
    borderRadius: radius.full,
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
});
