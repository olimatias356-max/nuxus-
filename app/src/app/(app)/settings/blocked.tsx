import { FlatList, View } from 'react-native';
import { Ban } from 'lucide-react-native';

import { useBlocks, useUnblockUser } from '@/lib/api/social';
import { useMe } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { Avatar, Button, colors, EmptyState, Header, Loading, space, Text, useToast } from '@/ui';

export default function Blocked() {
  const { userId } = useMe();
  const q = useBlocks();
  const unblock = useUnblockUser();
  const toast = useToast();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Usuarios bloqueados" />
      {q.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(b) => b.user_id}
          contentContainerStyle={{ flexGrow: 1 }}
          ListEmptyComponent={<EmptyState icon={Ban} title="No bloqueaste a nadie" text="Las cuentas que bloquees no pueden ver tu contenido ni contactarte." />}
          renderItem={({ item }) => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3] }}>
              <Avatar path={item.avatar_path} name={item.username} size={44} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{item.display_name}</Text>
                <Text variant="small" tone="subtle">
                  @{item.username}
                </Text>
              </View>
              <Button
                title="Desbloquear"
                size="sm"
                variant="secondary"
                full={false}
                onPress={() =>
                  unblock.mutate({ me: userId, target: item.user_id }, { onSuccess: () => toast('Usuario desbloqueado'), onError: (e) => toast(errorMessage(e), 'error') })
                }
              />
            </View>
          )}
        />
      )}
    </View>
  );
}
