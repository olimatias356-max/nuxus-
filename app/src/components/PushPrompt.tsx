import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { enablePush, pushState, type PushState } from '@/lib/push';
import { secureStorage } from '@/lib/secure-storage';
import { Button, colors, radius, space, Text, useToast } from '@/ui';
import { Bell, X } from '@/ui/icons';

const DISMISS_KEY = 'mbf.push_prompt_dismissed';

/** Soft prompt: explains the value before the OS permission dialog appears. */
export function PushPrompt() {
  const [state, setState] = useState<PushState | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    Promise.all([pushState(), secureStorage.getItem(DISMISS_KEY)]).then(([s, d]) => {
      if (!alive) return;
      setState(s);
      setDismissed(d === '1');
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!state || state === 'granted' || state === 'unsupported' || dismissed) return null;

  const activate = async () => {
    if (state === 'denied') return Linking.openSettings();
    const next = await enablePush(true);
    setState(next);
    if (next === 'granted') toast('Notificaciones activadas');
  };

  return (
    <View style={styles.card}>
      <View style={styles.icon}>
        <Bell size={20} color={colors.onAccent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">Enterate al instante</Text>
        <Text variant="small" tone="muted">
          Te avisamos de mensajes, seguidores y pagos. Los mensajes nunca se muestran en la pantalla bloqueada.
        </Text>
        <Button title={state === 'denied' ? 'Abrir ajustes' : 'Activar'} size="sm" full={false} onPress={activate} style={{ marginTop: space[2] }} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ahora no"
        hitSlop={10}
        onPress={() => {
          setDismissed(true);
          secureStorage.setItem(DISMISS_KEY, '1').catch(() => {});
        }}>
        <X size={18} color={colors.textSubtle} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: space[3], marginHorizontal: space[4], marginBottom: space[2], padding: space[4], borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  icon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
});
