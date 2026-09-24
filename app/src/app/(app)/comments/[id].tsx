import { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Flag, MessageCircle, SendHorizontal, Trash } from '@/ui/icons';

import { usePost } from '@/lib/api/posts';
import { useAddComment, useComments, useDeleteComment } from '@/lib/api/social';
import { useMe } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { timeAgo } from '@/lib/format';
import type { Comment } from '@/lib/types';
import { ActionSheet, Avatar, colors, EmptyState, fonts, Header, IconButton, Loading, radius, space, Text, useToast, VerifiedBadge, type SheetAction } from '@/ui';

export default function Comments() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId, profile } = useMe();
  const insets = useSafeAreaInsets();
  const q = useComments(id);
  const { data: post } = usePost(id);
  const add = useAddComment();
  const del = useDeleteComment();
  const toast = useToast();
  const [text, setText] = useState('');

  const send = () => {
    const body = text.trim();
    if (!body) return;
    add.mutate(
      { postId: id, body },
      { onSuccess: () => setText(''), onError: (e) => toast(errorMessage(e), 'error') },
    );
  };

  const [menu, setMenu] = useState<Comment | null>(null);
  const menuActions: SheetAction[] = !menu
    ? []
    : [
        ...(menu.author_id === userId || post?.author_id === userId
          ? [
              {
                label: 'Eliminar comentario',
                icon: Trash,
                danger: true,
                onPress: () => del.mutate({ id: menu.id, postId: id }, { onError: (e) => toast(errorMessage(e), 'error') }),
              },
            ]
          : []),
        ...(menu.author_id !== userId
          ? [
              {
                label: 'Reportar comentario',
                icon: Flag,
                danger: true,
                onPress: () => router.push({ pathname: '/report', params: { type: 'comment', id: menu.id, name: menu.author?.username ?? '' } }),
              },
            ]
          : []),
      ];

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title="Comentarios" back="close" safeTop={Platform.OS !== 'ios'} />
      {q.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingVertical: space[2], flexGrow: 1 }}
          ListEmptyComponent={<EmptyState icon={MessageCircle} title="Sin comentarios todavía" text="Empezá la conversación." />}
          renderItem={({ item }) => (
            <Pressable onLongPress={() => setMenu(item)} delayLongPress={350} style={styles.row} accessibilityHint="Mantené presionado para más opciones">
              <Pressable onPress={() => item.author && router.push({ pathname: '/u/[username]', params: { username: item.author.username } })}>
                <Avatar path={item.author?.avatar_path} name={item.author?.username ?? '?'} size={36} />
              </Pressable>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={styles.meta}>
                  <Text variant="smallStrong">{item.author?.username ?? 'usuario'}</Text>
                  {item.author?.is_verified ? <VerifiedBadge size={13} /> : null}
                  <Text variant="caption" tone="subtle">
                    {timeAgo(item.created_at)}
                  </Text>
                </View>
                <Text variant="body">{item.body}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space[3]) }]}>
        <Avatar path={profile?.avatar_path} name={profile?.username ?? 'yo'} size={34} />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Agregá un comentario…"
          placeholderTextColor={colors.textSubtle}
          selectionColor={colors.accent}
          style={styles.input}
          maxLength={500}
          multiline
          accessibilityLabel="Escribir comentario"
        />
        <IconButton icon={SendHorizontal} label="Publicar comentario" onPress={send} disabled={!text.trim() || add.isPending} color={colors.accent} />
      </View>
      <ActionSheet visible={!!menu} title="Comentario" actions={menuActions} onClose={() => setMenu(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3] },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bar: { flexDirection: 'row', alignItems: 'flex-end', gap: space[2], paddingHorizontal: space[3], paddingTop: space[2], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bg },
  input: { flex: 1, minHeight: 42, maxHeight: 120, borderRadius: radius.lg, backgroundColor: colors.surface2, paddingHorizontal: 14, paddingVertical: 10, color: colors.text, fontFamily: fonts.medium, fontSize: 15 },
});
