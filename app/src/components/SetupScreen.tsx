import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, colors, space, Text, Wordmark } from '@/ui';

// Shown when the app was built without Supabase configuration.
export default function SetupScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.inner}>
        <Wordmark size={24} />
        <Text variant="title">Falta configurar el servidor</Text>
        <Text variant="body" tone="muted">
          Creá el archivo <Text variant="bodyStrong">app/.env</Text> con la URL y la clave pública de tu proyecto de Supabase y volvé a
          iniciar la app:
        </Text>
        <Card>
          <Text variant="small" style={{ fontFamily: 'monospace' }}>
            EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co{'\n'}EXPO_PUBLIC_SUPABASE_KEY=sb_publishable_…
          </Text>
        </Card>
        <Text variant="small" tone="subtle">
          Los pasos completos están en el README del proyecto.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  inner: { padding: space[6], gap: space[4], marginTop: space[7] },
});
