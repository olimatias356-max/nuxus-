import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { KeyRound } from '@/ui/icons';

import { errorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { firstError, otpSchema } from '@/lib/validation';
import { Button, Header, Input, Screen, space, Text, useToast } from '@/ui';

export default function Verify() {
  const { email = '', type = 'signup' } = useLocalSearchParams<{ email: string; type: 'signup' | 'email_change' }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(60);
  const toast = useToast();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async () => {
    const parsed = otpSchema.safeParse(code);
    if (!parsed.success) return setError(firstError(parsed));
    setLoading(true);
    const { error: err } = await supabase.auth.verifyOtp({ email, token: parsed.data, type });
    setLoading(false);
    if (err) setError(errorMessage(err));
    else toast('¡Cuenta confirmada! Bienvenido/a a MbareteFans');
  };

  const resend = async () => {
    const { error: err } = await supabase.auth.resend({ type: 'signup', email });
    if (err) return setError(errorMessage(err));
    setCooldown(60);
    toast('Te enviamos un código nuevo');
  };

  return (
    <Screen scroll keyboard>
      <Header title="" back />
      <View style={{ gap: space[5], paddingTop: space[2] }}>
        <View style={{ gap: space[2] }}>
          <Text variant="title">Revisá tu email</Text>
          <Text variant="body" tone="muted">
            Te enviamos un código de 6 dígitos a <Text variant="bodyStrong">{email}</Text>. Si no lo ves, revisá la carpeta de spam.
          </Text>
        </View>
        <Input
          label="Código"
          icon={KeyRound}
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={6}
          placeholder="000000"
          error={error}
          onSubmitEditing={submit}
          style={{ letterSpacing: 8, fontSize: 22 }}
        />
        <Button title="Confirmar" onPress={submit} loading={loading} disabled={code.length !== 6} />
        <Button title={cooldown > 0 ? `Reenviar código (${cooldown}s)` : 'Reenviar código'} variant="ghost" disabled={cooldown > 0} onPress={resend} />
      </View>
    </Screen>
  );
}
