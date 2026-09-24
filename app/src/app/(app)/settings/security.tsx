import { useState } from 'react';
import { Alert, View } from 'react-native';
import { KeyRound, Lock, LogOut, Mail } from 'lucide-react-native';

import { useMe } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { emailSchema, firstError, otpSchema, passwordSchema } from '@/lib/validation';
import { Button, Card, colors, Header, Input, ListRow, Screen, Section, space, Text, useToast } from '@/ui';

export default function Security() {
  const { email, signOut } = useMe();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwLoading, setPwLoading] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [code, setCode] = useState('');
  const [emailStep, setEmailStep] = useState<'idle' | 'code'>('idle');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);

  const changePassword = async () => {
    const p = passwordSchema.safeParse(next);
    if (!p.success) return setPwError(firstError(p));
    if (!current) return setPwError('Ingresá tu contraseña actual.');
    setPwError(null);
    setPwLoading(true);
    // Re-authenticate with the current password before changing it.
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email ?? '', password: current });
    if (authError) {
      setPwLoading(false);
      return setPwError('La contraseña actual no es correcta.');
    }
    const { error } = await supabase.auth.updateUser({ password: p.data });
    setPwLoading(false);
    if (error) return setPwError(errorMessage(error));
    setCurrent('');
    setNext('');
    toast('Contraseña actualizada');
  };

  const requestEmail = async () => {
    const e = emailSchema.safeParse(newEmail);
    if (!e.success) return setEmailError(firstError(e));
    setEmailError(null);
    setEmailLoading(true);
    const { error } = await supabase.auth.updateUser({ email: e.data });
    setEmailLoading(false);
    if (error) return setEmailError(errorMessage(error));
    setEmailStep('code');
    toast('Te enviamos un código al email nuevo');
  };

  const confirmEmail = async () => {
    const c = otpSchema.safeParse(code);
    if (!c.success) return setEmailError(firstError(c));
    setEmailLoading(true);
    const { error } = await supabase.auth.verifyOtp({ email: newEmail.trim().toLowerCase(), token: c.data, type: 'email_change' });
    setEmailLoading(false);
    if (error) return setEmailError(errorMessage(error));
    setEmailStep('idle');
    setNewEmail('');
    setCode('');
    toast('Email actualizado');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Seguridad" />
      <Screen scroll keyboard>
        <View style={{ gap: space[5], paddingTop: space[2] }}>
          <Card>
            <Text variant="small" tone="muted">
              Tu sesión se guarda en el almacenamiento seguro del teléfono y se renueva sola. Nadie de MbareteFans te va a pedir tu contraseña ni tus códigos.
            </Text>
          </Card>

          <View style={{ gap: space[3] }}>
            <Text variant="subheading">Cambiar contraseña</Text>
            <Input label="Contraseña actual" icon={Lock} value={current} onChangeText={setCurrent} secureTextEntry secureToggle autoComplete="current-password" />
            <Input label="Contraseña nueva" icon={KeyRound} value={next} onChangeText={setNext} secureTextEntry secureToggle autoComplete="new-password" hint="8+ caracteres con mayúscula, minúscula y número" error={pwError} />
            <Button title="Actualizar contraseña" variant="secondary" onPress={changePassword} loading={pwLoading} />
          </View>

          <View style={{ gap: space[3] }}>
            <Text variant="subheading">Cambiar email</Text>
            <Text variant="small" tone="subtle">
              Email actual: {email}
            </Text>
            {emailStep === 'idle' ? (
              <>
                <Input label="Email nuevo" icon={Mail} value={newEmail} onChangeText={setNewEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" error={emailError} />
                <Button title="Enviar código" variant="secondary" onPress={requestEmail} loading={emailLoading} />
              </>
            ) : (
              <>
                <Input label="Código recibido" icon={KeyRound} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" error={emailError} />
                <Button title="Confirmar email" variant="secondary" onPress={confirmEmail} loading={emailLoading} />
              </>
            )}
          </View>

          <Section title="Sesiones">
            <ListRow
              icon={LogOut}
              title="Cerrar sesión en todos los dispositivos"
              subtitle="Útil si perdiste un teléfono o sospechás de un acceso"
              danger
              onPress={() =>
                Alert.alert('¿Cerrar todas las sesiones?', 'Vas a tener que volver a entrar en todos tus dispositivos.', [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Cerrar todas', style: 'destructive', onPress: () => signOut(true) },
                ])
              }
            />
          </Section>
        </View>
      </Screen>
    </View>
  );
}
