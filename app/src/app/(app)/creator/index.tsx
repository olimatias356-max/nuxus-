import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowDownToLine, ChevronRight, Crown, Eye, Heart, IdCard, Landmark, Receipt, TrendingUp, Users, type LucideIcon } from '@/ui/icons';

import { useCreatorStats, useMonetization } from '@/lib/api/money';
import { errorMessage } from '@/lib/errors';
import { formatCount, formatDate, formatMoney } from '@/lib/format';
import type { BalanceBucket, Monetization } from '@/lib/types';
import { blockerInfo, KycPill } from '@/components/creator';
import { Button, Card, colors, ErrorState, Header, Loading, Pill, radius, space, Text, type as typeScale } from '@/ui';

const RANGES = [
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: '7 días' },
  { value: 'month', label: '30 días' },
] as const;

const BUCKETS: { key: BalanceBucket; label: string; hint: string }[] = [
  { key: 'ESTIMATED', label: 'Estimado', hint: 'Calculado, falta validar el tráfico' },
  { key: 'PENDING', label: 'Pendiente', hint: 'En validación antifraude' },
  { key: 'CONFIRMED', label: 'Confirmado', hint: 'Validado, se libera pronto' },
  { key: 'AVAILABLE', label: 'Disponible', hint: 'Listo para retirar' },
];

export default function CreatorPanel() {
  const q = useMonetization();
  const stats = useCreatorStats();
  const [range, setRange] = useState<(typeof RANGES)[number]['value']>('month');

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data)
    return (
      <View style={{ flex: 1 }}>
        <Header title="Panel de creador" />
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      </View>
    );

  const m = q.data;
  const money = (n: number) => formatMoney(n, m.currency, m.currency_decimals);
  const e = m.earnings[range];
  const total = e.ads + e.membership + e.other;
  const blocker = m.withdraw_blockers[0];
  const info = blocker ? blockerInfo(blocker, m) : null;

  return (
    <View style={styles.root}>
      <Header title="Panel de creador" right={<Pressable onPress={() => router.push('/creator/ledger')} accessibilityRole="button" accessibilityLabel="Movimientos" hitSlop={10}><Receipt size={22} color={colors.text} /></Pressable>} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); stats.refetch(); }} tintColor={colors.accent} colors={[colors.accent]} />}>
        <View style={styles.hero}>
          <Text variant="smallStrong" tone="onAccent">
            Ganancias estimadas
          </Text>
          <Text style={[typeScale.number, { color: colors.onAccent }]} accessibilityLabel={`Ganancias estimadas ${money(total)}`}>
            {money(total)}
          </Text>
          <View style={styles.heroRange}>
            {RANGES.map((r) => (
              <Pressable
                key={r.value}
                onPress={() => setRange(r.value)}
                accessibilityRole="tab"
                accessibilityState={{ selected: range === r.value }}
                style={[styles.rangeBtn, range === r.value && styles.rangeOn]}>
                <Text variant="smallStrong" style={{ color: range === r.value ? colors.accent : colors.onAccent }}>
                  {r.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.split}>
            <Line onAccent label="Publicidad · 70% para vos" value={money(e.ads)} />
            <Line onAccent label="Membresías · 80% para vos" value={money(e.membership)} />
            <Line onAccent label="Otros" value={money(e.other)} />
          </View>
        </View>

        <Card>
          <Text variant="subheading" style={{ marginBottom: space[3] }}>
            Estado del saldo
          </Text>
          {BUCKETS.map((b, i) => {
            const amount = m.balances[b.key] ?? 0;
            const on = amount > 0;
            return (
              <View key={b.key} style={styles.bucket}>
                <View style={styles.stepCol}>
                  <View style={[styles.stepDot, on && { backgroundColor: b.key === 'AVAILABLE' ? colors.accent : colors.warning }]} />
                  {i < BUCKETS.length - 1 ? <View style={styles.stepLine} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{b.label}</Text>
                  <Text variant="caption" tone="subtle">
                    {b.hint}
                  </Text>
                </View>
                <Text variant="bodyStrong" tone={b.key === 'AVAILABLE' && on ? 'accent' : 'default'}>
                  {money(amount)}
                </Text>
              </View>
            );
          })}
          {m.balances.PROCESSING > 0 ? <Line label="En proceso de pago" value={money(m.balances.PROCESSING)} /> : null}
          {m.balances.PAID > 0 ? <Line label="Retirado en total" value={money(m.balances.PAID)} /> : null}
        </Card>

        {info ? (
          <Card tone={blocker === 'pro_required' ? 'accent' : 'default'}>
            <Text variant="body" tone="muted">
              {info.text}
            </Text>
            {info.cta && info.href ? <Button title={info.cta} size="md" style={{ marginTop: space[3] }} onPress={() => router.push(info.href as any)} /> : null}
          </Card>
        ) : null}
        <Button title="Retirar saldo disponible" icon={ArrowDownToLine} disabled={!!blocker} onPress={() => router.push('/creator/withdraw')} />

        <View style={{ gap: space[2] }}>
          <StatusRow
            icon={Crown}
            title={m.subscription ? m.subscription.plan_name : 'Plan gratuito'}
            subtitle={m.subscription ? `${m.subscription.status === 'canceled' ? 'Cancelado · activo' : 'Activo'} hasta ${formatDate(m.subscription.current_period_end)}` : 'Activá Pro para retirar y acceder a más herramientas'}
            pill={m.is_pro ? <Pill label="PRO" tone="accent" /> : null}
            onPress={() => router.push('/creator/pro')}
          />
          <StatusRow icon={IdCard} title="Verificación de identidad" subtitle={kycText(m)} pill={<KycPill status={m.kyc.status} />} onPress={() => router.push('/creator/kyc')} />
          <StatusRow
            icon={Landmark}
            title="Cuenta bancaria"
            subtitle={m.bank ? `${m.bank.bank_name} · •••• ${m.bank.last4}` : 'Sin cuenta registrada'}
            pill={m.bank ? <Pill label={m.bank.status === 'verified' ? 'Verificada' : m.bank.status === 'pending' ? 'En revisión' : 'Rechazada'} tone={m.bank.status === 'verified' ? 'success' : m.bank.status === 'pending' ? 'warning' : 'danger'} /> : null}
            onPress={() => router.push('/creator/bank')}
          />
        </View>

        <Text variant="subheading">Rendimiento</Text>
        <View style={styles.statsGrid}>
          <StatTile icon={Eye} label="Reproducciones" value={formatCount(stats.data?.views ?? 0)} />
          <StatTile icon={Heart} label="Me gusta" value={formatCount(stats.data?.likes ?? 0)} />
          <StatTile icon={Users} label="Seguidores" value={formatCount(stats.data?.followers ?? 0)} sub={stats.data?.new_followers_7d ? `+${stats.data.new_followers_7d} esta semana` : undefined} />
          <StatTile icon={TrendingUp} label="Retención media" value={stats.data?.avg_retention != null ? `${stats.data.avg_retention}%` : '—'} />
        </View>
        <Text variant="small" tone="subtle">
          Los analytics avanzados (retención por segundo, países, horarios) están en el portal web para creadores Pro.
        </Text>
      </ScrollView>
    </View>
  );
}

function kycText(m: Monetization) {
  switch (m.kyc.status) {
    case 'VERIFIED':
      return 'Identidad verificada. Tenés la insignia azul.';
    case 'REVIEW':
      return 'Estamos revisando tus documentos.';
    case 'REJECTED':
      return m.kyc.rejection_reason ? `Rechazada: ${m.kyc.rejection_reason}` : 'Rechazada. Podés intentar de nuevo.';
    case 'SUSPENDED':
      return 'Suspendida. Contactá a soporte.';
    default:
      return 'Necesaria para retirar y obtener la insignia azul.';
  }
}

function Line({ label, value, onAccent }: { label: string; value: string; onAccent?: boolean }) {
  return (
    <View style={styles.line}>
      <Text variant="small" tone={onAccent ? 'onAccent' : 'muted'}>
        {label}
      </Text>
      <Text variant="smallStrong" tone={onAccent ? 'onAccent' : 'default'}>
        {value}
      </Text>
    </View>
  );
}

function StatusRow({ icon: Icon, title, subtitle, pill, onPress }: { icon: LucideIcon; title: string; subtitle: string; pill?: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.status, pressed && { backgroundColor: colors.surface2 }]} accessibilityRole="button" accessibilityLabel={`${title}. ${subtitle}`}>
      <View style={styles.statusIcon}>
        <Icon size={20} color={colors.accent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Text variant="bodyStrong">{title}</Text>
          {pill}
        </View>
        <Text variant="small" tone="subtle" numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      <ChevronRight size={18} color={colors.textSubtle} />
    </Pressable>
  );
}

function StatTile({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: string; sub?: string }) {
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${label}: ${value}`}>
      <Icon size={18} color={colors.textMuted} />
      <Text variant="heading">{value}</Text>
      <Text variant="caption" tone="subtle">
        {label}
      </Text>
      {sub ? (
        <Text variant="caption" tone="accent">
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space[4], gap: space[4], paddingBottom: space[9] },
  hero: { backgroundColor: colors.accent, borderRadius: radius.xl, padding: space[5], gap: space[2] },
  heroRange: { flexDirection: 'row', gap: 6, marginTop: space[2] },
  rangeBtn: { paddingHorizontal: 12, height: 32, borderRadius: radius.full, justifyContent: 'center', backgroundColor: 'rgba(10,10,15,0.08)' },
  rangeOn: { backgroundColor: colors.onAccent },
  split: { marginTop: space[3], gap: 2, backgroundColor: 'rgba(10,10,15,0.08)', borderRadius: radius.md, padding: space[3] },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  bucket: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3], minHeight: 52 },
  stepCol: { alignItems: 'center', width: 14, paddingTop: 5 },
  stepDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.surface3 },
  stepLine: { width: 2, flex: 1, minHeight: 28, backgroundColor: colors.surface3, marginTop: 4 },
  status: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  statusIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  tile: { width: '47.5%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space[4], gap: 4, borderWidth: 1, borderColor: colors.border },
});
