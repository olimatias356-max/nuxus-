import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Banknote, Flag, Gavel, IdCard, ShieldAlert } from 'lucide-react-native';

import { hasRole, useAdminRoles } from '@/lib/api/admin';
import { colors, EmptyState, Header, ListRow, Loading, Section, space, Text } from '@/ui';

export default function Admin() {
  const { data: roles, isLoading } = useAdminRoles(true);
  if (isLoading) return <Loading />;
  if (!roles?.length)
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Administración" />
        <EmptyState icon={ShieldAlert} title="Sin permisos" text="Tu cuenta no tiene roles de administración." />
      </View>
    );
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Administración" subtitle={roles.join(' · ')} />
      <ScrollView contentContainerStyle={{ padding: space[4] }}>
        <Section title="Operación">
          {hasRole(roles, 'MODERATION') ? <ListRow icon={Flag} title="Reportes" subtitle="Contenido y cuentas reportadas" onPress={() => router.push('/admin/reports')} /> : null}
          {hasRole(roles, 'MODERATION') ? <ListRow icon={Gavel} title="Apelaciones" onPress={() => router.push('/admin/appeals')} /> : null}
          {hasRole(roles, 'KYC') ? <ListRow icon={IdCard} title="Verificaciones de identidad" onPress={() => router.push('/admin/kyc')} /> : null}
          {hasRole(roles, 'FINANCE') ? <ListRow icon={Banknote} title="Finanzas" subtitle="Acreditar ganancias y liberar saldos" onPress={() => router.push('/admin/finance')} /> : null}
        </Section>
        <Text variant="small" tone="subtle">
          Cada acción queda registrada en la auditoría con tu usuario, la fecha y el motivo.
        </Text>
      </ScrollView>
    </View>
  );
}
