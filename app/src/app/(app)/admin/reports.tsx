import { FlatList, StyleSheet, View } from 'react-native';
import { Flag } from '@/ui/icons';

import { MediaImage } from '@/components/Media';
import { useAdminReports, useResolveReport } from '@/lib/api/admin';
import { errorMessage } from '@/lib/errors';
import { timeAgo } from '@/lib/format';
import type { AdminReport } from '@/lib/types';
import { confirmAction } from '@/lib/confirm';
import { Button, Card, colors, EmptyState, ErrorState, Header, Loading, Pill, radius, space, Text, useToast } from '@/ui';

const REASON: Record<string, string> = {
  sexual: 'Sexual', minors: 'Menores', violence: 'Violencia', harassment: 'Acoso', hate: 'Odio', self_harm: 'Autolesión',
  impersonation: 'Suplantación', copyright: 'Copyright', spam: 'Spam', other: 'Otro',
};

export default function Reports() {
  const q = useAdminReports();
  const resolve = useResolveReport();
  const toast = useToast();

  const act = async (r: AdminReport, action: 'dismiss' | 'remove' | 'restore' | 'suspend_user', label: string) => {
    const ok = await confirmAction({ title: label, message: '¿Confirmás esta acción?', confirmText: 'Confirmar', destructive: action === 'remove' || action === 'suspend_user' });
    if (ok)
      resolve.mutate(
        { targetType: r.target_type, targetId: r.target_id, action, note: label },
        { onSuccess: () => toast('Listo'), onError: (e) => toast(errorMessage(e), 'error') },
      );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Reportes" subtitle={q.data ? `${q.data.length} pendientes` : undefined} />
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(r) => `${r.target_type}:${r.target_id}`}
          contentContainerStyle={{ padding: space[4], gap: space[3], flexGrow: 1 }}
          onRefresh={() => q.refetch()}
          refreshing={q.isRefetching}
          ListEmptyComponent={<EmptyState icon={Flag} title="Sin reportes pendientes" text="La cola está vacía." />}
          renderItem={({ item }) => (
            <Card tone={item.reasons.includes('minors') ? 'danger' : 'default'}>
              <View style={styles.head}>
                <Pill label={item.target_type.toUpperCase()} />
                <Text variant="smallStrong">{item.report_count} reportes</Text>
                <Text variant="caption" tone="subtle">
                  · {timeAgo(item.first_reported_at)}
                </Text>
              </View>
              <View style={styles.reasons}>
                {item.reasons.map((r) => (
                  <Pill key={r} label={REASON[r] ?? r} tone={r === 'minors' ? 'danger' : 'warning'} />
                ))}
              </View>
              <View style={styles.body}>
                {item.preview_media_path ? <MediaImage path={item.preview_media_path} style={styles.thumb} /> : null}
                <View style={{ flex: 1, gap: 4 }}>
                  <Text variant="smallStrong">@{item.owner_username ?? 'desconocido'}</Text>
                  <Text variant="small" tone="muted" numberOfLines={4}>
                    {item.preview_text || '(sin texto)'}
                  </Text>
                  <Text variant="caption" tone="subtle">
                    Estado: {item.content_status}
                  </Text>
                </View>
              </View>
              <View style={styles.actions}>
                <Button title="Descartar" size="sm" variant="secondary" full={false} onPress={() => act(item, 'dismiss', 'Descartar reportes')} />
                {item.target_type !== 'user' ? <Button title="Quitar + strike" size="sm" variant="danger" full={false} onPress={() => act(item, 'remove', 'Quitar contenido y aplicar strike')} /> : null}
                <Button title="Suspender" size="sm" variant="danger" full={false} onPress={() => act(item, 'suspend_user', 'Suspender la cuenta')} />
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space[2] },
  body: { flexDirection: 'row', gap: space[3], marginTop: space[3] },
  thumb: { width: 72, height: 90, borderRadius: radius.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[3] },
});
