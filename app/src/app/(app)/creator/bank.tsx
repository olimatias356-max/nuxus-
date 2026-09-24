import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Landmark, Lock } from 'lucide-react-native';

import { useMonetization, useUpsertBankAccount } from '@/lib/api/money';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { Button, Card, colors, Header, Input, Loading, Pill, radius, Screen, space, Text, useToast } from '@/ui';

export default function Bank() {
  const q = useMonetization();
  const save = useUpsertBankAccount();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [bankName, setBankName] = useState('');
  const [type, setType] = useState<'savings' | 'checking'>('savings');
  const [holder, setHolder] = useState('');
  const [number, setNumber] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (q.isLoading) return <Loading />;
  const bank = q.data?.bank;
  const showForm = editing || !bank;

  const submit = () => {
    if (bankName.trim().length < 2) return setError('Indicá el banco.');
    if (holder.trim().length < 3) return setError('Indicá el titular.');
    if (!/^[A-Za-z0-9 -]{6,40}$/.test(number.trim())) return setError('Número de cuenta inválido.');
    setError(null);
    save.mutate(
      { bankName, accountType: type, holderName: holder, accountNumber: number },
      {
        onSuccess: () => {
          toast('Cuenta bancaria guardada');
          setEditing(false);
          setNumber('');
        },
        onError: (e) => setError(errorMessage(e)),
      },
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Cuenta bancaria" />
      <Screen scroll keyboard footer={showForm ? <Button title="Guardar cuenta" onPress={submit} loading={save.isPending} /> : <Button title="Cambiar cuenta" variant="secondary" onPress={() => setEditing(true)} />}>
        <View style={{ gap: space[4], paddingTop: space[2] }}>
          {bank && !editing ? (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                <View style={styles.icon}>
                  <Landmark size={20} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{bank.bank_name}</Text>
                  <Text variant="small" tone="subtle">
                    {bank.account_type === 'savings' ? 'Caja de ahorro' : 'Cuenta corriente'} · •••• {bank.last4}
                  </Text>
                  <Text variant="small" tone="subtle">
                    Titular: {bank.holder_name}
                  </Text>
                </View>
                <Pill label={bank.status === 'verified' ? 'Verificada' : bank.status === 'pending' ? 'En revisión' : 'Rechazada'} tone={bank.status === 'verified' ? 'success' : bank.status === 'pending' ? 'warning' : 'danger'} />
              </View>
              <Text variant="caption" tone="subtle" style={{ marginTop: space[3] }}>
                Actualizada el {formatDate(bank.updated_at)}
              </Text>
            </Card>
          ) : (
            <>
              <Text variant="body" tone="muted">
                El titular tiene que ser la misma persona de tu identidad verificada. Si coincide, la cuenta se verifica al instante.
              </Text>
              <Input label="Banco" value={bankName} onChangeText={setBankName} placeholder="Ej.: Banco Nacional de Fomento" maxLength={80} />
              <View style={styles.types} accessibilityRole="radiogroup">
                {(['savings', 'checking'] as const).map((t) => (
                  <Pressable key={t} accessibilityRole="radio" accessibilityState={{ checked: type === t }} onPress={() => setType(t)} style={[styles.type, type === t && styles.typeOn]}>
                    <Text variant="smallStrong" tone={type === t ? 'onAccent' : 'default'}>
                      {t === 'savings' ? 'Caja de ahorro' : 'Cuenta corriente'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Input label="Titular" value={holder} onChangeText={setHolder} autoComplete="name" maxLength={120} />
              <Input label="Número de cuenta" value={number} onChangeText={setNumber} keyboardType="number-pad" autoComplete="off" maxLength={40} error={error} />
              {editing ? <Button title="Cancelar" variant="ghost" onPress={() => setEditing(false)} /> : null}
            </>
          )}
          <Card>
            <View style={{ flexDirection: 'row', gap: space[3] }}>
              <Lock size={18} color={colors.accent} />
              <Text variant="small" tone="muted" style={{ flex: 1 }}>
                Guardamos el número cifrado y solo mostramos los últimos 4 dígitos. Por seguridad, después de cambiar la cuenta los retiros se habilitan en 24 horas y te avisamos del cambio.
              </Text>
            </View>
          </Card>
          {!bank ? <Button title="Primero verificar identidad" variant="ghost" onPress={() => router.push('/creator/kyc')} /> : null}
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  types: { flexDirection: 'row', gap: space[2] },
  type: { flex: 1, height: 44, borderRadius: radius.full, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  typeOn: { backgroundColor: colors.accent },
});
