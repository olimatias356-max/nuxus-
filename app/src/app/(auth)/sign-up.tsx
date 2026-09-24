import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { AtSign, Calendar, Check, Lock, Mail, User } from '@/ui/icons';

import { env } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import {
  ageFrom,
  displayNameSchema,
  emailSchema,
  firstError,
  parseBirthDate,
  passwordSchema,
  usernameSchema,
} from '@/lib/validation';
import { Button, colors, Header, Input, radius, Screen, space, Text } from '@/ui';

const COUNTRIES = [
  { code: 'PY', label: '🇵🇾 Paraguay' },
  { code: 'AR', label: '🇦🇷 Argentina' },
  { code: 'BR', label: '🇧🇷 Brasil' },
];

function formatBirth(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [birth, setBirth] = useState('');
  const [country, setCountry] = useState('PY');
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [usernameCheck, setUsernameCheck] = useState<{ name: string; problem: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const usernameRef = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);
  const birthRef = useRef<TextInput>(null);

  const normalizedUsername = username.trim().toLowerCase();
  const usernameValid = usernameSchema.safeParse(normalizedUsername).success;
  const usernameStatus: 'idle' | 'checking' | 'ok' | 'taken' = !usernameValid
    ? 'idle'
    : usernameCheck?.name !== normalizedUsername
      ? 'checking'
      : usernameCheck.problem
        ? 'taken'
        : 'ok';

  useEffect(() => {
    if (!usernameValid) return;
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('check_username', { p_username: normalizedUsername });
      if (!error) setUsernameCheck({ name: normalizedUsername, problem: (data as string | null) ?? null });
    }, 450);
    return () => clearTimeout(t);
  }, [normalizedUsername, usernameValid]);

  const passwordChecks = [
    { ok: password.length >= 8, label: '8+ caracteres' },
    { ok: /[A-Z]/.test(password) && /[a-z]/.test(password), label: 'Mayúscula y minúscula' },
    { ok: /\d/.test(password), label: 'Un número' },
  ];

  const submit = async () => {
    const next: Record<string, string | null> = {};
    const e = emailSchema.safeParse(email);
    next.email = firstError(e);
    next.password = firstError(passwordSchema.safeParse(password));
    const u = usernameSchema.safeParse(username);
    next.username = firstError(u) ?? (usernameStatus === 'taken' ? (usernameCheck?.problem ?? 'Ese nombre de usuario no está disponible.') : null);
    next.displayName = firstError(displayNameSchema.safeParse(displayName));
    const iso = parseBirthDate(birth);
    next.birth = !iso ? 'Usá el formato DD/MM/AAAA.' : ageFrom(iso) < 18 ? 'Tenés que tener al menos 18 años.' : null;
    next.terms = accepted ? null : 'Tenés que aceptar los términos para continuar.';
    setErrors(next);
    if (Object.values(next).some(Boolean) || !e.success || !u.success || !iso) return;

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: e.data,
      password,
      options: {
        data: {
          username: u.data,
          display_name: displayName.trim(),
          birth_date: iso,
          country,
          terms_version: env.termsVersion,
        },
      },
    });
    setLoading(false);
    if (error) {
      setErrors({ ...next, form: errorMessage(error) });
      return;
    }
    if (!data.session) {
      router.replace({ pathname: '/verify', params: { email: e.data, type: 'signup' } });
    }
  };

  return (
    <Screen scroll keyboard edges={['bottom']}>
      <Header title="" back />
      <View style={{ gap: space[4], paddingTop: space[1] }}>
        <View style={{ gap: space[2], marginBottom: space[1] }}>
          <Text variant="title">Creá tu cuenta</Text>
          <Text variant="body" tone="muted">
            Gratis. Podés publicar, crecer y generar ganancias desde el primer día.
          </Text>
        </View>

        <Input label="Email" icon={Mail} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" textContentType="emailAddress" keyboardType="email-address" returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} error={errors.email} placeholder="vos@ejemplo.com" />

        <View style={{ gap: space[2] }}>
          <Input ref={passwordRef} label="Contraseña" icon={Lock} value={password} onChangeText={setPassword} secureTextEntry secureToggle autoComplete="new-password" textContentType="newPassword" returnKeyType="next" onSubmitEditing={() => usernameRef.current?.focus()} error={errors.password} />
          <View style={styles.checks}>
            {passwordChecks.map((c) => (
              <View key={c.label} style={styles.check}>
                <Check size={13} color={c.ok ? colors.accent : colors.textSubtle} strokeWidth={3} />
                <Text variant="caption" tone={c.ok ? 'accent' : 'subtle'}>
                  {c.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <Input
          ref={usernameRef}
          label="Usuario"
          icon={AtSign}
          value={username}
          onChangeText={(v) => setUsername(v.toLowerCase().replace(/[^a-z0-9._]/g, ''))}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username-new"
          textContentType="username"
          maxLength={24}
          returnKeyType="next"
          onSubmitEditing={() => nameRef.current?.focus()}
          error={errors.username ?? (usernameStatus === 'taken' ? usernameCheck?.problem : null)}
          hint={usernameStatus === 'ok' ? '✓ Disponible' : usernameStatus === 'checking' ? 'Verificando…' : 'Así te van a encontrar: @usuario'}
          hintTone={usernameStatus === 'ok' ? 'accent' : 'subtle'}
          placeholder="tu.usuario"
        />
        <Input ref={nameRef} label="Nombre visible" icon={User} value={displayName} onChangeText={setDisplayName} autoComplete="name" textContentType="name" maxLength={50} returnKeyType="next" onSubmitEditing={() => birthRef.current?.focus()} error={errors.displayName} placeholder="Como querés que te vean" />
        <Input ref={birthRef} label="Fecha de nacimiento" icon={Calendar} value={birth} onChangeText={(v) => setBirth(formatBirth(v))} keyboardType="number-pad" autoComplete="birthdate-full" maxLength={10} error={errors.birth} hint="Es privada. Necesitás 18 años o más." placeholder="DD/MM/AAAA" />

        <View style={{ gap: space[2] }}>
          <Text variant="smallStrong" tone="muted">
            País
          </Text>
          <View style={styles.countries} accessibilityRole="radiogroup">
            {COUNTRIES.map((c) => (
              <Pressable
                key={c.code}
                accessibilityRole="radio"
                accessibilityState={{ checked: country === c.code }}
                onPress={() => setCountry(c.code)}
                style={[styles.country, country === c.code && styles.countryOn]}>
                <Text variant="smallStrong" tone={country === c.code ? 'onAccent' : 'default'}>
                  {c.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} onPress={() => setAccepted((a) => !a)} style={styles.terms}>
          <View style={[styles.box, accepted && styles.boxOn]}>{accepted ? <Check size={15} color={colors.onAccent} strokeWidth={3} /> : null}</View>
          <Text variant="small" tone="muted" style={{ flex: 1 }}>
            Tengo 18 años o más y acepto los{' '}
            <Text variant="smallStrong" tone="default" onPress={() => router.push({ pathname: '/legal', params: { doc: 'terms' } })}>
              Términos
            </Text>
            , la{' '}
            <Text variant="smallStrong" tone="default" onPress={() => router.push({ pathname: '/legal', params: { doc: 'privacy' } })}>
              Política de privacidad
            </Text>{' '}
            y las{' '}
            <Text variant="smallStrong" tone="default" onPress={() => router.push({ pathname: '/legal', params: { doc: 'rules' } })}>
              Reglas de la comunidad
            </Text>
            .
          </Text>
        </Pressable>
        {errors.terms ? (
          <Text variant="small" tone="danger">
            {errors.terms}
          </Text>
        ) : null}
        {errors.form ? (
          <Text variant="small" tone="danger" accessibilityLiveRegion="polite">
            {errors.form}
          </Text>
        ) : null}

        <Button title="Crear cuenta" onPress={submit} loading={loading} />
        <Text variant="small" tone="subtle" align="center">
          ¿Ya tenés cuenta?{' '}
          <Text variant="smallStrong" tone="accent" onPress={() => router.replace('/sign-in')} accessibilityRole="link">
            Entrá
          </Text>
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  checks: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3], marginLeft: 2 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  countries: { flexDirection: 'row', gap: space[2], flexWrap: 'wrap' },
  country: { paddingHorizontal: 14, height: 40, borderRadius: radius.full, backgroundColor: colors.surface2, justifyContent: 'center' },
  countryOn: { backgroundColor: colors.accent },
  terms: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start', paddingVertical: space[1] },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
});
