import { useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { IdCard } from 'lucide-react-native';

import { kycDocumentUrl, useAdminKyc, useReviewKyc } from '@/lib/api/admin';
import { errorMessage } from '@/lib/errors';
import { timeAgo } from '@/lib/format';
import type { AdminKyc } from '@/lib/types';
import { Button, Card, colors, EmptyState, ErrorState, Header, Input, Loading, Pill, radius, space, Text, useToast } from '@/ui';

export default function KycQueue() {
  const q = useAdminKyc();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Verificaciones" subtitle={q.data ? `${q.data.length} en revisión` : undefined} />
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(k) => k.user_id}
          contentContainerStyle={{ padding: space[4], gap: space[3], flexGrow: 1 }}
          ListEmptyComponent={<EmptyState icon={IdCard} title="Nada para revisar" />}
          renderItem={({ item }) => <KycCard k={item} />}
        />
      )}
    </View>
  );
}

function Doc({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    kycDocumentUrl(path).then(setUrl).catch(() => setUrl(null));
  }, [path]);
  return <View style={styles.doc}>{url ? <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}</View>;
}

function KycCard({ k }: { k: AdminKyc }) {
  const review = useReviewKyc();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const decide = (decision: 'approve' | 'reject' | 'suspend') => {
    if (decision !== 'approve' && reason.trim().length < 5) return toast('Indicá el motivo.', 'error');
    Alert.alert(decision === 'approve' ? 'Aprobar identidad' : decision === 'reject' ? 'Rechazar' : 'Suspender identidad', '¿Confirmás?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Confirmar',
        onPress: () =>
          review.mutate(
            { userId: k.user_id, decision, reason: reason.trim() || undefined },
            { onSuccess: () => toast('Listo'), onError: (e) => toast(errorMessage(e), 'error') },
          ),
      },
    ]);
  };
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {k.legal_name}
        </Text>
        {k.duplicate_identity ? <Pill label="Identidad duplicada" tone="danger" /> : null}
      </View>
      <Text variant="small" tone="subtle">
        @{k.username} · {k.document_type.toUpperCase()} {k.document_country} ···{k.document_last4} · {timeAgo(k.submitted_at)}
      </Text>
      <View style={styles.docs}>
        <Doc path={k.front_path} />
        {k.back_path ? <Doc path={k.back_path} /> : null}
        <Doc path={k.selfie_path} />
      </View>
      <Input label="Motivo (para rechazar o suspender)" value={reason} onChangeText={setReason} />
      <View style={{ flexDirection: 'row', gap: space[2], marginTop: space[3], flexWrap: 'wrap' }}>
        <Button title="Aprobar" size="sm" full={false} onPress={() => decide('approve')} />
        <Button title="Rechazar" size="sm" variant="secondary" full={false} onPress={() => decide('reject')} />
        <Button title="Suspender" size="sm" variant="danger" full={false} onPress={() => decide('suspend')} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  docs: { flexDirection: 'row', gap: space[2], marginVertical: space[3] },
  doc: { flex: 1, aspectRatio: 0.8, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surface2 },
});
