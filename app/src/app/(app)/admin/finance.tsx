import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Crypto from 'expo-crypto';

import { useAdvanceBalance, useCreditEarnings } from '@/lib/api/admin';
import { errorMessage } from '@/lib/errors';
import { Button, Card, colors, Header, Input, radius, Screen, space, Text, useToast } from '@/ui';

const STEPS = [
  ['ESTIMATED', 'PENDING'],
  ['PENDING', 'CONFIRMED'],
  ['CONFIRMED', 'AVAILABLE'],
] as const;

export default function Finance() {
  const credit = useCreditEarnings();
  const advance = useAdvanceBalance();
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [source, setSource] = useState<'ads' | 'membership'>('ads');
  const [gross, setGross] = useState('');
  const [step, setStep] = useState(0);
  const [amount, setAmount] = useState('');

  const doCredit = () => {
    const g = Number(gross.replace(/\D/g, ''));
    if (!username.trim() || !g) return toast('Completá usuario y monto', 'error');
    credit.mutate(
      { username: username.trim(), source, gross: g, reference: `manual:${Crypto.randomUUID()}` },
      { onSuccess: () => toast('Ganancia acreditada (estimado)'), onError: (e) => toast(errorMessage(e), 'error') },
    );
  };

  const doAdvance = () => {
    const a = Number(amount.replace(/\D/g, ''));
    if (!username.trim() || !a) return toast('Completá usuario y monto', 'error');
    const [from, to] = STEPS[step];
    advance.mutate(
      { username: username.trim(), from, to, amount: a, reference: `advance:${Crypto.randomUUID()}` },
      { onSuccess: () => toast(`Saldo movido a ${to}`), onError: (e) => toast(errorMessage(e), 'error') },
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Finanzas" />
      <Screen scroll keyboard>
        <View style={{ gap: space[4], paddingTop: space[2] }}>
          <Card tone="warning">
            <Text variant="small" tone="warning">
              Usá esto para acreditar ingresos reales ya conciliados (publicidad válida o membresías) hasta que se conecte el proveedor de anuncios. Todo queda auditado.
            </Text>
          </Card>
          <Input label="Usuario del creador" value={username} onChangeText={(v) => setUsername(v.toLowerCase())} autoCapitalize="none" />

          <Text variant="subheading">Acreditar ganancias</Text>
          <View style={styles.row}>
            {(['ads', 'membership'] as const).map((s) => (
              <Pressable key={s} onPress={() => setSource(s)} style={[styles.chip, source === s && styles.chipOn]} accessibilityRole="radio" accessibilityState={{ checked: source === s }}>
                <Text variant="smallStrong" tone={source === s ? 'onAccent' : 'default'}>
                  {s === 'ads' ? 'Publicidad (70%)' : 'Membresías (80%)'}
                </Text>
              </Pressable>
            ))}
          </View>
          <Input label="Monto bruto (unidades menores)" value={gross} onChangeText={setGross} keyboardType="number-pad" hint="PYG sin decimales; ARS/BRL en centavos" />
          <Button title="Acreditar" onPress={doCredit} loading={credit.isPending} />

          <Text variant="subheading" style={{ marginTop: space[4] }}>
            Liberar saldo
          </Text>
          <View style={styles.row}>
            {STEPS.map(([from, to], i) => (
              <Pressable key={from} onPress={() => setStep(i)} style={[styles.chip, step === i && styles.chipOn]} accessibilityRole="radio" accessibilityState={{ checked: step === i }}>
                <Text variant="caption" tone={step === i ? 'onAccent' : 'default'}>
                  {from} → {to}
                </Text>
              </Pressable>
            ))}
          </View>
          <Input label="Monto" value={amount} onChangeText={setAmount} keyboardType="number-pad" />
          <Button title="Mover saldo" variant="secondary" onPress={doAdvance} loading={advance.isPending} />
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  chip: { paddingHorizontal: 12, height: 38, borderRadius: radius.full, backgroundColor: colors.surface2, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.accent },
});
