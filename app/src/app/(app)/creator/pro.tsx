import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Check, Crown } from '@/ui/icons';

import { invalidateMoney, useMonetization, usePlans } from '@/lib/api/money';
import { useMe } from '@/lib/auth';
import { env } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatMoney } from '@/lib/format';
import { openManageSubscriptions, PurchaseCancelled, purchasePro, restorePurchases, storeName } from '@/lib/purchases';
import { Button, Card, colors, Header, Loading, Pill, radius, Screen, space, Text, useToast } from '@/ui';

export default function Pro() {
  const { userId } = useMe();
  const plans = usePlans();
  const money = useMonetization();
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [restoring, setRestoring] = useState(false);

  if (plans.isLoading || money.isLoading) return <Loading />;
  const m = money.data;
  const currency = m?.currency ?? 'PYG';
  const decimals = m?.currency_decimals ?? 0;
  const current = m?.subscription;
  const plan = plans.data?.find((p) => p.id === (selected ?? plans.data?.[0]?.id));

  const buy = async () => {
    if (!plan) return;
    setBuying(true);
    try {
      await purchasePro(plan, userId);
      invalidateMoney();
      toast(`✓ ${plan.name} activo`);
    } catch (e) {
      if (!(e instanceof PurchaseCancelled)) toast(e instanceof Error ? e.message : errorMessage(e), 'error');
    } finally {
      setBuying(false);
    }
  };

  const restore = async () => {
    setRestoring(true);
    try {
      const n = await restorePurchases();
      invalidateMoney();
      toast(n ? 'Compras restauradas' : 'No encontramos compras para restaurar');
    } catch (e) {
      toast(e instanceof Error ? e.message : errorMessage(e), 'error');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="MbareteFans Pro" />
      <Screen
        scroll
        footer={
          current ? (
            current.channel === 'sandbox' || current.channel === 'web' ? null : (
              <Button title={`Administrar en ${current.channel === 'app_store' ? 'App Store' : 'Google Play'}`} variant="secondary" onPress={() => openManageSubscriptions(current.channel)} />
            )
          ) : plan ? (
            <View style={{ gap: space[2] }}>
              <Button title={`Suscribirme · ${formatMoney(plan.prices[currency] ?? 0, currency, decimals)}/mes`} onPress={buy} loading={buying} icon={Crown} />
              <Text variant="caption" tone="subtle" align="center">
                {env.billingMode === 'sandbox' ? 'Modo de prueba: no se realiza ningún cobro.' : `Cobro mensual con ${storeName}. Cancelás cuando quieras.`}
              </Text>
            </View>
          ) : null
        }>
        <View style={{ gap: space[4], paddingTop: space[2] }}>
          {current ? (
            <Card tone="accent">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                <Crown size={20} color={colors.accent} />
                <Text variant="subheading">{current.plan_name}</Text>
                <Pill label={current.status === 'canceled' ? 'Cancelado' : 'Activo'} tone={current.status === 'canceled' ? 'warning' : 'accent'} />
              </View>
              <Text variant="body" tone="muted" style={{ marginTop: space[2] }}>
                {current.status === 'canceled'
                  ? `Seguís con Pro hasta el ${formatDate(current.current_period_end)}.`
                  : `Se renueva el ${formatDate(current.current_period_end)}.`}
                {current.channel === 'sandbox' ? ' Suscripción de prueba (sin cobro).' : ''}
              </Text>
            </Card>
          ) : null}
          {current && m?.kyc.status !== 'VERIFIED' ? (
            <Card>
              <Text variant="bodyStrong">Siguiente paso: verificá tu identidad</Text>
              <Text variant="small" tone="muted" style={{ marginTop: space[1] }}>
                Para retirar necesitás identidad verificada y una cuenta bancaria a tu nombre.
              </Text>
              <Button title="Verificar identidad" size="md" style={{ marginTop: space[3] }} onPress={() => router.push('/creator/kyc')} />
            </Card>
          ) : null}
          {current ? null : (
            <View style={{ gap: space[2] }}>
              <Text variant="title">Retirá lo que ganás</Text>
              <Text variant="body" tone="muted">
                Con cualquier plan Pro podés retirar tus ganancias y usar herramientas para crecer. Pro no compra alcance: tu contenido sigue creciendo por lo que vale.
              </Text>
            </View>
          )}

          {!current
            ? (plans.data ?? []).map((p) => {
                const on = p.id === plan?.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => setSelected(p.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`${p.name}, ${formatMoney(p.prices[currency] ?? 0, currency, decimals)} por mes`}
                    style={[styles.plan, on && styles.planOn]}>
                    <View style={styles.planHead}>
                      <View style={{ flex: 1 }}>
                        <Text variant="subheading">{p.name}</Text>
                        <Text variant="small" tone="subtle">
                          {p.description}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text variant="bodyStrong" tone={on ? 'accent' : 'default'}>
                          {formatMoney(p.prices[currency] ?? 0, currency, decimals)}
                        </Text>
                        <Text variant="caption" tone="subtle">
                          por mes
                        </Text>
                      </View>
                    </View>
                    {on
                      ? p.benefits.map((b) => (
                          <View key={b} style={styles.benefit}>
                            <Check size={16} color={colors.accent} strokeWidth={3} />
                            <Text variant="small">{b}</Text>
                          </View>
                        ))
                      : null}
                  </Pressable>
                );
              })
            : null}

          <Card>
            <Text variant="small" tone="muted">
              • El cobro lo procesa {storeName}; MbareteFans no ve ni guarda los datos de tu tarjeta.{'\n'}• La suscripción se renueva sola cada mes.{'\n'}• Si cancelás, Pro sigue activo hasta el final del período pagado.{'\n'}• Para retirar también necesitás identidad verificada y una cuenta bancaria a tu nombre.
            </Text>
          </Card>
          {env.billingMode !== 'sandbox' ? <Button title="Restaurar compras" variant="ghost" onPress={restore} loading={restoring} /> : null}
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  plan: { borderRadius: radius.lg, padding: space[4], gap: space[2], backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  planOn: { borderColor: colors.accent },
  planHead: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
});
