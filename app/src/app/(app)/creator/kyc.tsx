import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Camera, IdCard, Lock, ScanFace, ShieldCheck, type LucideIcon } from 'lucide-react-native';

import { useMonetization, useSubmitKyc, type KycInput } from '@/lib/api/money';
import { useMe } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { MediaError, pickMedia, type PickedMedia } from '@/lib/media';
import { Button, Card, colors, EmptyState, Header, Input, Loading, radius, Screen, space, Text, useToast } from '@/ui';
import { KycPill } from '@/components/creator';

const DOCS: Array<{ value: KycInput['documentType']; label: string; back: boolean }> = [
  { value: 'ci', label: 'Cédula (CI)', back: true },
  { value: 'dni', label: 'DNI', back: true },
  { value: 'cpf', label: 'CPF / RG', back: true },
  { value: 'passport', label: 'Pasaporte', back: false },
];

export default function Kyc() {
  const { userId, profile } = useMe();
  const q = useMonetization();
  const submit = useSubmitKyc();
  const toast = useToast();
  const [legalName, setLegalName] = useState('');
  const [docType, setDocType] = useState<KycInput['documentType']>('ci');
  const [number, setNumber] = useState('');
  const [front, setFront] = useState<PickedMedia | null>(null);
  const [back, setBack] = useState<PickedMedia | null>(null);
  const [selfie, setSelfie] = useState<PickedMedia | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (q.isLoading) return <Loading />;
  const status = q.data?.kyc.status ?? 'PENDING';
  const needsBack = DOCS.find((d) => d.value === docType)?.back ?? true;

  const take = async (set: (m: PickedMedia) => void) => {
    try {
      const m = await pickMedia({ kinds: 'images', camera: true });
      if (m) set(m);
    } catch (e) {
      toast(e instanceof MediaError ? e.message : 'No pudimos abrir la cámara.', 'error');
    }
  };

  const send = () => {
    if (legalName.trim().length < 3) return setError('Ingresá tu nombre completo como figura en el documento.');
    if (number.replace(/[^0-9a-z]/gi, '').length < 5) return setError('Ingresá el número de documento.');
    if (!front || !selfie || (needsBack && !back)) return setError('Faltan fotos del documento o la selfie.');
    setError(null);
    submit.mutate(
      {
        userId,
        input: { legalName, documentType: docType, documentCountry: profile?.country ?? 'PY', documentNumber: number, front, back: needsBack ? back : null, selfie },
      },
      {
        onSuccess: () => {
          toast('Enviado. Te avisamos cuando esté verificada.');
          router.back();
        },
        onError: (e) => setError(errorMessage(e)),
      },
    );
  };

  if (status === 'VERIFIED' || status === 'REVIEW' || status === 'SUSPENDED') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Verificación de identidad" />
        <EmptyState
          icon={status === 'VERIFIED' ? ShieldCheck : IdCard}
          title={status === 'VERIFIED' ? 'Identidad verificada' : status === 'REVIEW' ? 'En revisión' : 'Verificación suspendida'}
          text={
            status === 'VERIFIED'
              ? 'Tu perfil muestra la insignia azul. La insignia se obtiene solo verificando la identidad, nunca pagando.'
              : status === 'REVIEW'
                ? 'Una persona de nuestro equipo está revisando tus documentos. Suele tardar menos de 48 horas.'
                : 'Contactá a soporte desde Ajustes → Ayuda.'
          }
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Verificación de identidad" />
      <Screen scroll keyboard footer={<Button title="Enviar a revisión" onPress={send} loading={submit.isPending} />}>
        <View style={{ gap: space[4], paddingTop: space[2] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <Text variant="body" tone="muted" style={{ flex: 1 }}>
              Verificá tu identidad para retirar ganancias y obtener la insignia azul.
            </Text>
            <KycPill status={status} />
          </View>
          {status === 'REJECTED' && q.data?.kyc.rejection_reason ? (
            <Card tone="danger">
              <Text variant="small" tone="danger">
                Motivo del rechazo: {q.data.kyc.rejection_reason}
              </Text>
            </Card>
          ) : null}
          <Card>
            <View style={{ flexDirection: 'row', gap: space[3] }}>
              <Lock size={18} color={colors.accent} />
              <Text variant="small" tone="muted" style={{ flex: 1 }}>
                Tus documentos se guardan cifrados en un espacio privado. Solo el equipo de verificación puede verlos y nunca se muestran en tu perfil.
              </Text>
            </View>
          </Card>

          <Input label="Nombre completo (como en el documento)" value={legalName} onChangeText={setLegalName} autoComplete="name" textContentType="name" maxLength={120} />
          <View style={{ gap: space[2] }}>
            <Text variant="smallStrong" tone="muted">
              Tipo de documento
            </Text>
            <View style={styles.chips} accessibilityRole="radiogroup">
              {DOCS.map((d) => (
                <Pressable key={d.value} accessibilityRole="radio" accessibilityState={{ checked: docType === d.value }} onPress={() => setDocType(d.value)} style={[styles.chip, docType === d.value && styles.chipOn]}>
                  <Text variant="smallStrong" tone={docType === d.value ? 'onAccent' : 'default'}>
                    {d.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Input label="Número de documento" value={number} onChangeText={setNumber} autoCapitalize="characters" maxLength={24} />

          <View style={styles.shots}>
            <Shot icon={IdCard} label="Frente" media={front} onPress={() => take(setFront)} />
            {needsBack ? <Shot icon={IdCard} label="Dorso" media={back} onPress={() => take(setBack)} /> : null}
            <Shot icon={ScanFace} label="Selfie con el documento" media={selfie} onPress={() => take(setSelfie)} />
          </View>
          {error ? (
            <Text variant="small" tone="danger" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
        </View>
      </Screen>
    </View>
  );
}

function Shot({ icon: Icon, label, media, onPress }: { icon: LucideIcon; label: string; media: PickedMedia | null; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.shot} accessibilityRole="button" accessibilityLabel={`${media ? 'Volver a tomar' : 'Tomar foto'}: ${label}`}>
      {media ? <Image source={{ uri: media.uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Icon size={26} color={colors.textMuted} />}
      <View style={styles.shotLabel}>
        <Camera size={12} color={colors.white} />
        <Text variant="caption" tone="white" numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  chip: { paddingHorizontal: 14, height: 38, borderRadius: radius.full, backgroundColor: colors.surface2, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.accent },
  shots: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  shot: { width: '47%', flexGrow: 1, aspectRatio: 1.4, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  shotLabel: { position: 'absolute', left: 8, bottom: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full },
});
