import { FlatList, View } from 'react-native';
import { Gavel } from '@/ui/icons';

import { useAdminAppeals, useResolveAppeal } from '@/lib/api/admin';
import { errorMessage } from '@/lib/errors';
import { timeAgo } from '@/lib/format';
import { Button, Card, colors, EmptyState, Header, Loading, Pill, space, Text, useToast } from '@/ui';

export default function Appeals() {
  const q = useAdminAppeals();
  const resolve = useResolveAppeal();
  const toast = useToast();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Apelaciones" />
      {q.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: space[4], gap: space[3], flexGrow: 1 }}
          ListEmptyComponent={<EmptyState icon={Gavel} title="Sin apelaciones abiertas" />}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
                <Pill label={({ post: 'Publicación', story: 'Historia', comment: 'Comentario', account: 'Cuenta', kyc: 'Verificación', strike: 'Strike' } as Record<string, string>)[item.target_type] ?? item.target_type} />
                <Text variant="caption" tone="subtle">
                  {timeAgo(item.created_at)}
                </Text>
              </View>
              <Text variant="body" style={{ marginTop: space[2] }}>
                {item.message}
              </Text>
              <View style={{ flexDirection: 'row', gap: space[2], marginTop: space[3] }}>
                <Button title="Aceptar" size="sm" full={false} onPress={() => resolve.mutate({ id: item.id, accept: true, note: 'Apelación aceptada' }, { onError: (e) => toast(errorMessage(e), 'error') })} />
                <Button title="Rechazar" size="sm" variant="secondary" full={false} onPress={() => resolve.mutate({ id: item.id, accept: false, note: 'Se mantiene la decisión' }, { onError: (e) => toast(errorMessage(e), 'error') })} />
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}
