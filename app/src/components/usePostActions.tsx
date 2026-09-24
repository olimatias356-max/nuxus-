import { useState } from 'react';
import { Alert, Share } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { Ban, Flag, Link2, Pencil, Trash } from 'lucide-react-native';

import { useBlockUser } from '@/lib/api/social';
import { useDeletePost } from '@/lib/api/posts';
import { errorMessage } from '@/lib/errors';
import type { FeedItem } from '@/lib/types';
import { ActionSheet, useToast, type SheetAction } from '@/ui';

export function sharePost(post: Pick<FeedItem, 'id' | 'author_username'>) {
  const url = Linking.createURL(`/post/${post.id}`);
  return Share.share({ message: `Mirá esta publicación de @${post.author_username} en MbareteFans: ${url}` }).catch(() => {});
}

/** Options menu for a post: share, report, block, or edit/delete if it's yours. */
export function usePostActions(me: string) {
  const [post, setPost] = useState<FeedItem | null>(null);
  const toast = useToast();
  const block = useBlockUser();
  const del = useDeletePost();

  const mine = post?.author_id === me;
  const actions: SheetAction[] = !post
    ? []
    : mine
      ? [
          { label: 'Editar descripción', icon: Pencil, onPress: () => router.push({ pathname: '/post/[id]', params: { id: post.id, edit: '1' } }) },
          { label: 'Compartir', icon: Link2, onPress: () => sharePost(post) },
          {
            label: 'Eliminar publicación',
            icon: Trash,
            danger: true,
            onPress: () =>
              Alert.alert('¿Eliminar publicación?', 'Se borra para siempre, junto con sus likes y comentarios.', [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Eliminar',
                  style: 'destructive',
                  onPress: () =>
                    del.mutate(post, {
                      onSuccess: () => toast('Publicación eliminada'),
                      onError: (e) => toast(errorMessage(e), 'error'),
                    }),
                },
              ]),
          },
        ]
      : [
          { label: 'Compartir', icon: Link2, onPress: () => sharePost(post) },
          {
            label: 'Reportar',
            icon: Flag,
            danger: true,
            hint: 'Contenido que incumple las reglas',
            onPress: () => router.push({ pathname: '/report', params: { type: 'post', id: post.id, name: post.author_username } }),
          },
          {
            label: `Bloquear a @${post.author_username}`,
            icon: Ban,
            danger: true,
            hint: 'No verás su contenido y no podrá contactarte',
            onPress: () =>
              Alert.alert(`¿Bloquear a @${post.author_username}?`, 'No verás su contenido y no podrá interactuar con vos. Podés desbloquearlo desde Ajustes.', [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Bloquear',
                  style: 'destructive',
                  onPress: () =>
                    block.mutate(
                      { target: post.author_id },
                      { onSuccess: () => toast('Usuario bloqueado'), onError: (e) => toast(errorMessage(e), 'error') },
                    ),
                },
              ]),
          },
        ];

  const sheet = <ActionSheet visible={!!post} title={post ? `@${post.author_username}` : undefined} actions={actions} onClose={() => setPost(null)} />;
  return { open: setPost, sheet };
}
