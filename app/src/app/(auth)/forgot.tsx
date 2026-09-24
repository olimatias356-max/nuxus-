import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { KeyRound, Lock, Mail } from 'lucide-react-native';

import { errorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { emailSchema, firstError, otpSchema, passwordSchema } from '@/lib/validation';
import { Button, Header, Input, Screen, space, Text, useToast } from '@/ui';

export default function Forgot() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const sendCode = async () => {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return setError(firstError(parsed));
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(parsed.data);
    setLoading(false);
    // The server answers the same whether or not the email exists (no account enumeration).
    if (err) return setError(errorMessage(err));
    setEmail(parsed.data);
    setStep('code');
  };

  const reset = async () => {
    const c = otpSchema.safeParse(code);
    if (!c.success) return setError(firstError(c));
    const p = passwordSchema.safeParse(password);
    if (!p.success) return setError(firstError(p));
    setError(null);
    setLoading(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: c.data, type: 'recovery' });
    if (verifyError) {
      setLoading(false);
      return setError(errorMessage(verifyError));
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: p.data });
    setLoading(false);
    if (updateError) toast(errorMessage(updateError), 'error');
    else toast('Contraseña actualizada');
  };

  return (
    <Screen scroll keyboard>
      <Header title="" back />
      <View style={{ gap: space[5], paddingTop: space[2] }}>
        <View style={{ gap: space[2] }}>
          <Text variant="title">{step === 'email' ? 'Recuperá tu cuenta' : 'Elegí una contraseña nueva'}</Text>
          <Text variant="body" tone="muted">
            {step === 'email'
              ? 'Te enviamos un código a tu email para que puedas elegir una contraseña nueva.'
              : `Si ${email} tiene una cuenta, te llegó un código de 6 dígitos.`}
          </Text>
        </View>
        {step === 'email' ? (
          <>
            <Input label="Email" icon={Mail} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" error={error} onSubmitEditing={sendCode} />
            <Button title="Enviar código" onPress={sendCode} loading={loading} />
          </>
        ) : (
          <>
            <Input label="Código" icon={KeyRound} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} placeholder="000000" />
            <Input label="Contraseña nueva" icon={Lock} value={password} onChangeText={setPassword} secureTextEntry secureToggle autoComplete="new-password" textContentType="newPassword" hint="8+ caracteres con mayúscula, minúscula y número" error={error} onSubmitEditing={reset} />
            <Button title="Guardar contraseña" onPress={reset} loading={loading} />
            <Button title="Usar otro email" variant="ghost" onPress={() => setStep('email')} />
          </>
        )}
      </View>
    </Screen>
  );
}
