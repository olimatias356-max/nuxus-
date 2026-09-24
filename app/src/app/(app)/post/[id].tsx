import { useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ImageOff } from '@/ui/icons';

import { PostCard } from '@/components/PostCard';
import { usePostActions } from '@/components/usePostActions';
import { usePost, useUpdateCaption } from '@/lib/api/posts';
import { useMe } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { Button, Card, EmptyState, Header, Input, Loading, space, Text, useToast } from '@/ui';

export default function PostDetail() {
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
  const { userId } = useMe();
  const { width } = useWindowDimensions();
  const q = usePost(id);
  const actions = usePostActions(userId);
  const update = useUpdateCaption();
  const toast = useToast();
  const [editing, setEditing] = useState(edit === '1');
  const [caption, setCaption] = useState<string | null>(null);

  if (q.isLoading) return <Loading />;
  const post = q.data;
  if (!post)
    return (
      <View style={{ flex: 1 }}>
        <Header title="Publicación" />
        <EmptyState icon={ImageOff} title="Publicación no disponible" text="Puede que se haya eliminado o que no tengas acceso." />
      </View>
    );

  const save = () =>
    update.mutate(
      { id: post.id, caption: caption ?? post.caption },
      {
        onSuccess: () => {
          setEditing(false);
          toast('Descripción actualizada');
        },
        onError: (e) => toast(errorMessage(e), 'error'),
      },
    );

  return (
    <View style={{ flex: 1 }}>
      <Header title="Publicación" />
      <ScrollView keyboardShouldPersistTaps="handled">
        {post.status === 'review' && post.author_id === userId ? (
          <Card tone="warning" style={{ marginHorizontal: space[4], marginBottom: space[3] }}>
            <Text variant="small" tone="warning">
              Esta publicación está oculta mientras la revisamos por reportes de la comunidad. Si creés que es un error podés apelar.
            </Text>
            <Button title="Apelar" variant="secondary" size="sm" full={false} style={{ marginTop: space[2] }} onPress={() => router.push({ pathname: '/settings/appeal', params: { type: 'post', id: post.id } })} />
          </Card>
        ) : null}
        {editing ? (
          <View style={{ padding: space[4], gap: space[3] }}>
            <Input label="Descripción" value={caption ?? post.caption} onChangeText={setCaption} multiline maxLength={2200} />
            <Button title="Guardar" onPress={save} loading={update.isPending} />
            <Button title="Cancelar" variant="ghost" onPress={() => setEditing(false)} />
          </View>
        ) : (
          <PostCard post={post} me={userId} active width={width} onMore={actions.open} />
        )}
      </ScrollView>
      {actions.sheet}
    </View>
  );
}
