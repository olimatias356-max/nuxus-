import { useState } from 'react';
import { View } from 'react-native';
import { TriangleAlert } from 'lucide-react-native';

import { deleteMyAccount } from '@/lib/api/config';
import { useMonetization } from '@/lib/api/money';
import { useMe } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { openManageSubscriptions } from '@/lib/purchases';
import { Button, Card, colors, Header, Input, Screen, space, Text, useToast } from '@/ui';

export default function DeleteAccount() {
  const { signOut } = useMe();
  const { data: m } = useMonetization();
  const toast = useToast();
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const available = m?.balances.AVAILABLE ?? 0;

  const del = async () => {
    setLoading(true);
    try {
      await deleteMyAccount(confirm.trim());
      toast('Tu cuenta fue eliminada');
      await signOut();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No pudimos eliminar la cuenta.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Eliminar cuenta" />
      <Screen scroll keyboard footer={<Button title="Eliminar mi cuenta para siempre" variant="danger" onPress={del} loading={loading} disabled={confirm.trim() !== 'ELIMINAR'} />}>
        <View style={{ gap: space[4], paddingTop: space[2] }}>
          <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
            <TriangleAlert size={26} color={colors.danger} />
            <Text variant="heading">Esto no se puede deshacer</Text>
          </View>
          <Text variant="body" tone="muted">
            Se eliminan tu perfil, publicaciones, historias, comentarios, mensajes y datos personales. Conservamos solo los registros contables y de seguridad que la ley exige.
          </Text>
          {available > 0 && m ? (
            <Card tone="warning">
              <Text variant="small" tone="warning">
                Tenés {formatMoney(available, m.currency, m.currency_decimals)} disponibles. Retiralos antes de eliminar la cuenta o los vas a perder.
              </Text>
            </Card>
          ) : null}
          {m?.subscription && m.subscription.auto_renew ? (
            <Card tone="warning">
              <Text variant="small" tone="warning">
                Tu suscripción Pro se cancela desde la tienda, no se cancela sola al borrar la cuenta.
              </Text>
              <Button title="Administrar suscripción" size="sm" variant="secondary" full={false} style={{ marginTop: space[2] }} onPress={() => openManageSubscriptions(m.subscription?.channel)} />
            </Card>
          ) : null}
          <Input label='Escribí "ELIMINAR" para confirmar' value={confirm} onChangeText={setConfirm} autoCapitalize="characters" autoCorrect={false} />
        </View>
      </Screen>
    </View>
  );
}
