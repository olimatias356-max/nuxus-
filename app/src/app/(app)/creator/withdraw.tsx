import { View } from 'react-native';
import { router } from 'expo-router';
import { ArrowDownToLine } from '@/ui/icons';

import { useMonetization, useRequestPayout } from '@/lib/api/money';
import { errorMessage } from '@/lib/errors';
import { formatMoney } from '@/lib/format';
import { Button, Card, colors, Header, Loading, Screen, space, Text, type as typeScale, useToast } from '@/ui';
import { blockerInfo } from '@/components/creator';

export default function Withdraw() {
  const q = useMonetization();
  const payout = useRequestPayout();
  const toast = useToast();
  if (q.isLoading || !q.data) return <Loading />;
  const m = q.data;
  const amount = m.balances.AVAILABLE ?? 0;
  const blocker = m.withdraw_blockers[0];

  const confirm = () =>
    payout.mutate(null, {
      onSuccess: () => {
        toast('Retiro solicitado · en proceso');
        router.back();
      },
      onError: (e) => toast(errorMessage(e), 'error'),
    });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Confirmar retiro" />
      <Screen scroll footer={<Button title="Confirmar retiro" icon={ArrowDownToLine} onPress={confirm} loading={payout.isPending} disabled={!!blocker} />}>
        <View style={{ gap: space[4], paddingTop: space[4] }}>
          <View style={{ alignItems: 'center', gap: space[2] }}>
            <Text variant="small" tone="muted">
              Vas a retirar
            </Text>
            <Text style={[typeScale.number, { color: colors.text }]}>{formatMoney(amount, m.currency, m.currency_decimals)}</Text>
          </View>
          <Card>
            <Row label="Moneda" value={m.currency} />
            <Row label="Destino" value={m.bank ? `${m.bank.bank_name} · •••• ${m.bank.last4}` : '—'} />
            <Row label="Titular" value={m.bank?.holder_name ?? '—'} />
            <Row label="Acreditación" value="Según el banco (1 a 3 días hábiles)" />
          </Card>
          {blocker ? (
            <Card tone="warning">
              <Text variant="small" tone="warning">
                {blockerInfo(blocker, m).text}
              </Text>
            </Card>
          ) : null}
          <Text variant="small" tone="subtle">
            Los retiros pasan por controles de seguridad y prevención de fraude. Si el banco rechaza la transferencia, el saldo vuelve a disponible automáticamente.
          </Text>
        </View>
      </Screen>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[3], paddingVertical: 8 }}>
      <Text variant="small" tone="muted">
        {label}
      </Text>
      <Text variant="smallStrong" style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </Text>
    </View>
  );
}
