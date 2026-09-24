import { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Lock, Mail } from '@/ui/icons';

import { errorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { emailSchema, firstError } from '@/lib/validation';
import { Button, Header, Input, Screen, space, Text } from '@/ui';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const failures = useRef(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return setError(firstError(parsed));
    if (!password) return setError('Ingresá tu contraseña.');
    if (Date.now() < lockedUntil) return setError('Demasiados intentos. Esperá unos segundos.');
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: parsed.data, password });
    setLoading(false);
    if (err) {
      if (/email not confirmed/i.test(err.message)) {
        await supabase.auth.resend({ type: 'signup', email: parsed.data }).catch(() => {});
        router.push({ pathname: '/verify', params: { email: parsed.data, type: 'signup' } });
        return;
      }
      failures.current += 1;
      if (failures.current >= 5) {
        setLockedUntil(Date.now() + 30_000);
        failures.current = 0;
      }
      setError(errorMessage(err));
    }
  };

  return (
    <Screen scroll keyboard edges={['bottom']}>
      <Header title="" back />
      <View style={{ gap: space[5], paddingTop: space[2] }}>
        <View style={{ gap: space[2] }}>
          <Text variant="title">Hola de nuevo</Text>
          <Text variant="body" tone="muted">
            Entrá para ver lo nuevo de tus creadores.
          </Text>
        </View>
        <Input
          label="Email"
          icon={Mail}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          placeholder="vos@ejemplo.com"
        />
        <Input
          ref={passwordRef}
          label="Contraseña"
          icon={Lock}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          secureToggle
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
          error={error}
        />
        <Button title="Entrar" onPress={submit} loading={loading} />
        <Button title="¿Olvidaste tu contraseña?" variant="ghost" onPress={() => router.push({ pathname: '/forgot', params: { email } })} />
        <Text variant="small" tone="subtle" align="center">
          ¿No tenés cuenta?{' '}
          <Text variant="smallStrong" tone="accent" onPress={() => router.replace('/sign-up')} accessibilityRole="link">
            Creá una
          </Text>
        </Text>
      </View>
    </Screen>
  );
}
