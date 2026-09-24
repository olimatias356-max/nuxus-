import { Alert, Platform } from 'react-native';

type ConfirmOptions = { title: string; message?: string; confirmText: string; cancelText?: string; destructive?: boolean };

/** Native confirmation dialog on iOS/Android, window.confirm on web. */
export function confirmAction({ title, message, confirmText, cancelText = 'Cancelar', destructive }: ConfirmOptions): Promise<boolean> {
  if (Platform.OS === 'web') {
    const w = globalThis as unknown as { confirm?: (m: string) => boolean };
    return Promise.resolve(!!w.confirm?.([title, message].filter(Boolean).join('\n\n')));
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
        { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
