import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Check } from 'lucide-react-native';

import { useReport, type ReportReason, type ReportTarget } from '@/lib/api/social';
import { errorMessage } from '@/lib/errors';
import { Button, Card, colors, Header, Input, radius, Screen, space, Text, useToast } from '@/ui';

const REASONS: Array<{ value: ReportReason; label: string }> = [
  { value: 'minors', label: 'Menores en riesgo' },
  { value: 'sexual', label: 'Contenido sexual o desnudos' },
  { value: 'violence', label: 'Violencia o amenazas' },
  { value: 'harassment', label: 'Acoso o bullying' },
  { value: 'hate', label: 'Discurso de odio' },
  { value: 'self_harm', label: 'Autolesiones o suicidio' },
  { value: 'impersonation', label: 'Suplantación de identidad' },
  { value: 'copyright', label: 'Derechos de autor' },
  { value: 'spam', label: 'Spam o estafa' },
  { value: 'other', label: 'Otro motivo' },
];

const TARGET_LABEL: Record<ReportTarget, string> = {
  post: 'esta publicación',
  comment: 'este comentario',
  user: 'esta cuenta',
  message: 'este mensaje',
  story: 'esta historia',
};

export default function Report() {
  const { type, id, name } = useLocalSearchParams<{ type: ReportTarget; id: string; name?: string }>();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const report = useReport();
  const toast = useToast();

  const submit = () => {
    if (!reason) return;
    report.mutate(
      { target_type: type, target_id: id, reason, details },
      {
        onSuccess: () => {
          toast('Gracias. Revisamos tu reporte; los casos dudosos los decide una persona.');
          router.back();
        },
        onError: (e) => toast(errorMessage(e), 'error'),
      },
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Reportar" back="close" />
      <Screen scroll keyboard footer={<Button title="Enviar reporte" onPress={submit} disabled={!reason} loading={report.isPending} />}>
        <View style={{ gap: space[4], paddingTop: space[2] }}>
          <Text variant="body" tone="muted">
            ¿Por qué reportás {TARGET_LABEL[type] ?? 'este contenido'}
            {name ? ` de @${name}` : ''}? Tu reporte es anónimo.
          </Text>
          <View style={{ gap: space[2] }} accessibilityRole="radiogroup">
            {REASONS.map((r) => {
              const selected = reason === r.value;
              return (
                <Pressable
                  key={r.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => setReason(r.value)}
                  style={[styles.reason, selected && styles.reasonOn]}>
                  <Text variant="bodyStrong" style={{ flex: 1 }}>
                    {r.label}
                  </Text>
                  {selected ? <Check size={20} color={colors.accent} strokeWidth={3} /> : null}
                </Pressable>
              );
            })}
          </View>
          {reason === 'minors' ? (
            <Card tone="danger">
              <Text variant="small" tone="danger">
                Ocultamos el contenido de inmediato mientras lo revisamos. Si alguien está en peligro, contactá también a la policía (911 en Paraguay).
              </Text>
            </Card>
          ) : null}
          <Input label="Detalles (opcional)" value={details} onChangeText={setDetails} multiline maxLength={500} placeholder="Contanos más si ayuda a entender el caso" />
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  reason: { flexDirection: 'row', alignItems: 'center', minHeight: 54, paddingHorizontal: space[4], borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  reasonOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
});
