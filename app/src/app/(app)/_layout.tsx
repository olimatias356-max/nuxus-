import { View } from 'react-native';
import { router, Stack } from 'expo-router';
import { ShieldAlert } from 'lucide-react-native';

import { useAuth } from '@/lib/auth';
import { Button, colors, EmptyState, Loading, Screen, space } from '@/ui';

export default function AppLayout() {
  const { profile, profileLoading, signOut } = useAuth();

  if (profileLoading) return <Loading />;
  if (!profile) {
    return (
      <Screen>
        <EmptyState icon={ShieldAlert} title="No pudimos cargar tu perfil" text="Revisá tu conexión e intentá de nuevo." action="Cerrar sesión" onAction={() => signOut()} />
      </Screen>
    );
  }
  if (profile.status === 'suspended') {
    return (
      <Screen>
        <EmptyState icon={ShieldAlert} title="Tu cuenta está suspendida" text="Incumpliste las reglas de la comunidad de forma grave o repetida. Si creés que es un error, podés apelar." />
        <View style={{ gap: space[3], paddingBottom: space[6] }}>
          <Button title="Apelar la suspensión" onPress={() => router.push({ pathname: '/settings/appeal', params: { type: 'account' } })} />
          <Button title="Cerrar sesión" variant="secondary" onPress={() => signOut()} />
        </View>
      </Screen>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="create" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="comments/[id]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="report" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="story/[authorId]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
    </Stack>
  );
}
