import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { MessageCircle } from '@/ui/icons';

import { useInbox } from '@/lib/api/activity';
import { useMe } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { timeAgo } from '@/lib/format';
import { Avatar, colors, EmptyState, ErrorState, Header, Loading, space, Text, VerifiedBadge } from '@/ui';

export default function Inbox() {
  const { userId } = useMe();
  const q = useInbox();
  return (
    <View style={styles.root}>
      <Header title="Mensajes" />
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(c) => c.conversation_id}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.accent} colors={[colors.accent]} />}
          contentContainerStyle={{ flexGrow: 1 }}
          ListEmptyComponent={<EmptyState icon={MessageCircle} title="Sin mensajes" text="Entrá al perfil de un creador y tocá Mensaje para empezar una conversación." />}
          renderItem={({ item }) => {
            const unread = item.unread_count > 0;
            return (
              <Pressable
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}
                onPress={() => router.push({ pathname: '/messages/[id]', params: { id: item.conversation_id } })}
                accessibilityRole="button"
                accessibilityLabel={`Conversación con ${item.other_display_name}${unread ? `, ${item.unread_count} sin leer` : ''}`}>
                <Avatar path={item.other_avatar_path} name={item.other_display_name} size={52} />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {item.other_display_name}
                    </Text>
                    {item.other_is_verified ? <VerifiedBadge size={14} /> : null}
                  </View>
                  <Text variant="small" tone={unread ? 'default' : 'subtle'} numberOfLines={1} style={unread ? { fontWeight: '700' } : null}>
                    {item.last_sender_id === userId ? 'Vos: ' : ''}
                    {item.last_message_preview ?? 'Conversación nueva'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  {item.last_message_at ? (
                    <Text variant="caption" tone="subtle">
                      {timeAgo(item.last_message_at)}
                    </Text>
                  ) : null}
                  {unread ? (
                    <View style={styles.badge}>
                      <Text variant="caption" tone="onAccent">
                        {item.unread_count}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3] },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
});
