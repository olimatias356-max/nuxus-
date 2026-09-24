import { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { useLedger } from '@/lib/api/money';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatMoney } from '@/lib/format';
import type { LedgerEntry } from '@/lib/types';
import { colors, EmptyState, ErrorState, Header, Loading, Pill, radius, space, Text } from '@/ui';
import { ArrowRight, Receipt } from '@/ui/icons';

const TYPE: Record<LedgerEntry['entry_type'], string> = {
  credit: 'Ganancia',
  debit: 'Débito',
  hold: 'Retiro',
  release: 'Liberación',
  payout: 'Pagado',
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

type Row = { key: string; description: string; type: LedgerEntry['entry_type']; amount: number; currency: string; from: string | null; to: string | null; created_at: string; fee: number };

/** Groups the double-entry legs of each transaction into one readable row. */
function group(entries: LedgerEntry[]): Row[] {
  const byTx = new Map<string, LedgerEntry[]>();
  for (const e of entries) byTx.set(e.tx_id, [...(byTx.get(e.tx_id) ?? []), e]);
  const rows: Row[] = [];
  for (const [tx, legs] of byTx) {
    const main = legs.filter((l) => l.entry_type !== 'fee');
    const fee = legs.filter((l) => l.entry_type === 'fee').reduce((a, l) => a + Math.abs(l.amount), 0);
    const plus = main.find((l) => l.amount > 0);
    const minus = main.find((l) => l.amount < 0);
    const ref = plus ?? minus ?? legs[0];
    rows.push({
      key: tx,
      description: ref.description,
      type: ref.entry_type,
      amount: Math.abs(plus?.amount ?? minus?.amount ?? 0),
      currency: ref.currency,
      from: minus?.bucket ?? null,
      to: plus?.bucket ?? null,
      created_at: ref.created_at,
      fee,
    });
  }
  return rows;
}

export default function Ledger() {
  const q = useLedger();
  const rows = useMemo(() => group(q.data ?? []), [q.data]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Movimientos" subtitle="Registro contable inmutable" />
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          contentContainerStyle={{ padding: space[4], gap: space[2], flexGrow: 1 }}
          ListEmptyComponent={<EmptyState icon={Receipt} title="Sin movimientos" text="Cuando generes ganancias vas a ver cada movimiento acá, con su estado." />}
          renderItem={({ item }) => (
            <View style={styles.row} accessible accessibilityLabel={`${item.description}, ${formatMoney(item.amount, item.currency)}`}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text variant="bodyStrong" numberOfLines={2}>
                  {item.description || TYPE[item.type]}
                </Text>
                <View style={styles.meta}>
                  <Pill label={TYPE[item.type]} tone={item.type === 'credit' ? 'success' : item.type === 'hold' || item.type === 'payout' ? 'accent' : 'default'} />
                  {item.from && item.to ? (
                    <View style={styles.flow}>
                      <Text variant="caption" tone="subtle">
                        {BUCKET[item.from]}
                      </Text>
                      <ArrowRight size={12} color={colors.textSubtle} />
                      <Text variant="caption" tone="muted">
                        {BUCKET[item.to]}
                      </Text>
                    </View>
                  ) : item.to ? (
                    <Text variant="caption" tone="subtle">
                      {BUCKET[item.to]}
                    </Text>
                  ) : null}
                </View>
                <Text variant="caption" tone="subtle">
                  {formatDate(item.created_at)}
                  {item.fee ? ` · comisión de plataforma ${formatMoney(item.fee, item.currency)}` : ''}
                </Text>
              </View>
              <Text variant="bodyStrong" tone={item.type === 'credit' || item.type === 'refund' ? 'success' : 'default'}>
                {item.type === 'credit' || item.type === 'refund' ? '+' : ''}
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
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
  flow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
