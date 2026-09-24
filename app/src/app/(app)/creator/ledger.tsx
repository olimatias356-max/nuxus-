import { FlatList, StyleSheet, View } from 'react-native';
import { Receipt } from '@/ui/icons';

import { useLedger } from '@/lib/api/money';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatMoney } from '@/lib/format';
import type { LedgerEntry } from '@/lib/types';
import { colors, EmptyState, ErrorState, Header, Loading, Pill, space, Text } from '@/ui';

const TYPE: Record<LedgerEntry['entry_type'], string> = {
  credit: 'Crédito',
  debit: 'Débito',
  hold: 'Retención',
  release: 'Liberación',
  payout: 'Pago',
  refund: 'Reintegro',
  adjustment: 'Ajuste',
  fee: 'Comisión',
};
const BUCKET: Record<string, string> = {
  ESTIMATED: 'Estimado',
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmado',
  AVAILABLE: 'Disponible',
  PROCESSING: 'En proceso',
  PAID: 'Pagado',
};

export default function Ledger() {
  const q = useLedger();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Movimientos" subtitle="Registro contable inmutable" />
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(e) => String(e.id)}
          contentContainerStyle={{ padding: space[4], gap: space[2], flexGrow: 1 }}
          ListEmptyComponent={<EmptyState icon={Receipt} title="Sin movimientos" text="Cuando generes ganancias vas a ver cada movimiento acá, con su estado." />}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="bodyStrong" numberOfLines={2}>
                  {item.description || TYPE[item.entry_type]}
                </Text>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <Pill label={TYPE[item.entry_type]} tone={item.entry_type === 'fee' ? 'default' : item.amount > 0 ? 'success' : 'warning'} />
                  {item.bucket ? (
                    <Text variant="caption" tone="subtle">
                      {BUCKET[item.bucket]}
                    </Text>
                  ) : null}
                  <Text variant="caption" tone="subtle">
                    · {formatDate(item.created_at)}
                  </Text>
                </View>
              </View>
              <Text variant="bodyStrong" tone={item.entry_type === 'fee' ? 'subtle' : item.amount > 0 ? 'success' : 'default'}>
                {item.amount > 0 ? '+' : ''}
                {formatMoney(item.amount, item.currency)}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
});
