import { Alert, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import * as Application from 'expo-application';
import { Ban, FileText, Gavel, KeyRound, Landmark, LifeBuoy, LogOut, Pencil, Scale, Shield, ShieldCheck, Trash, UserCog, Wallet } from 'lucide-react-native';

import { useAdminRoles } from '@/lib/api/admin';
import { useBlocks } from '@/lib/api/social';
import { useMe } from '@/lib/auth';
import { colors, Header, ListRow, Section, space, Text } from '@/ui';

export default function Settings() {
  const { signOut, email, userId } = useMe();
  const { data: blocks } = useBlocks();
  const { data: roles } = useAdminRoles(!!userId);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Ajustes" />
      <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: space[9] }}>
        <Section title="Cuenta">
          <ListRow icon={Pencil} title="Editar perfil" subtitle="Foto, nombre, biografía y país" onPress={() => router.push('/settings/edit-profile')} />
          <ListRow icon={KeyRound} title="Seguridad" subtitle={email ?? undefined} onPress={() => router.push('/settings/security')} />
          <ListRow icon={Ban} title="Usuarios bloqueados" subtitle={`${blocks?.length ?? 0} bloqueados`} onPress={() => router.push('/settings/blocked')} />
        </Section>
        <Section title="Creador">
          <ListRow icon={Wallet} title="Panel de creador" subtitle="Ganancias, Pro y retiros" onPress={() => router.push('/creator')} />
          <ListRow icon={ShieldCheck} title="Verificación de identidad" onPress={() => router.push('/creator/kyc')} />
          <ListRow icon={Landmark} title="Cuenta bancaria" subtitle="Para retiros" onPress={() => router.push('/creator/bank')} />
        </Section>
        <Section title="Soporte y legal">
          <ListRow icon={Shield} title="Reglas de la comunidad" onPress={() => router.push({ pathname: '/legal', params: { doc: 'rules' } })} />
          <ListRow icon={FileText} title="Términos de uso" onPress={() => router.push({ pathname: '/legal', params: { doc: 'terms' } })} />
          <ListRow icon={Scale} title="Política de privacidad" onPress={() => router.push({ pathname: '/legal', params: { doc: 'privacy' } })} />
          <ListRow icon={Gavel} title="Apelar una decisión" subtitle="Contenido quitado, strikes o suspensiones" onPress={() => router.push({ pathname: '/settings/appeal', params: { type: 'account' } })} />
          <ListRow icon={LifeBuoy} title="Ayuda y contacto" onPress={() => router.push('/settings/help')} />
        </Section>
        {roles?.length ? (
          <Section title="Equipo">
            <ListRow icon={UserCog} title="Panel de administración" subtitle={roles.join(' · ')} onPress={() => router.push('/admin')} />
          </Section>
        ) : null}
        <Section>
          <ListRow
            icon={LogOut}
            title="Cerrar sesión"
            chevron={false}
            onPress={() =>
              Alert.alert('¿Cerrar sesión?', undefined, [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Cerrar sesión', style: 'destructive', onPress: () => signOut() },
              ])
            }
          />
          <ListRow icon={Trash} title="Eliminar cuenta" danger onPress={() => router.push('/settings/delete-account')} />
        </Section>
        <Text variant="caption" tone="subtle" align="center">
          MbareteFans {Application.nativeApplicationVersion ?? '1.0.0'} · Hecho en Paraguay 🇵🇾
        </Text>
      </ScrollView>
    </View>
  );
}
