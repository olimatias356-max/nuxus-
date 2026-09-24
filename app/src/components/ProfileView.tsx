import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Share, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ban, Bookmark, ChevronLeft, Ellipsis, Flag, Grid3x3, ImagePlus, Link2, MessageCircle, Settings, Share2 } from '@/ui/icons';
import * as Linking from 'expo-linking';

import { startConversation } from '@/lib/api/activity';
import { useSavedPosts, useUserPosts } from '@/lib/api/posts';
import { useBlockUser, useIsFollowing, useToggleFollow } from '@/lib/api/social';
import { errorMessage } from '@/lib/errors';
import { formatCount } from '@/lib/format';
import type { Profile } from '@/lib/types';
import { confirmAction } from '@/lib/confirm';
import { ActionSheet, Avatar, Button, colors, EmptyState, IconButton, Loading, space, Text, useToast, VerifiedBadge } from '@/ui';
import { PostGrid } from './PostGrid';

const COUNTRY_NAME: Record<string, string> = { PY: 'Paraguay', AR: 'Argentina', BR: 'Brasil' };

export function ProfileView({ profile, me, isTab }: { profile: Profile; me: string; isTab?: boolean }) {
  const insets = useSafeAreaInsets();
  const isMe = profile.id === me;
  const [tab, setTab] = useState<'posts' | 'saved'>('posts');
  const posts = useUserPosts(profile.id);
  const saved = useSavedPosts(isMe && tab === 'saved');
  const { data: following } = useIsFollowing(me, profile.id);
  const follow = useToggleFollow();
  const block = useBlockUser();
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const [messaging, setMessaging] = useState(false);

  const list = tab === 'posts' ? posts : saved;

  const share = () => Share.share({ message: `Seguí a @${profile.username} en MbareteFans: ${Linking.createURL(`/u/${profile.username}`)}` }).catch(() => {});

  const message = async () => {
    setMessaging(true);
    try {
      const id = await startConversation(profile.id);
      router.push({ pathname: '/messages/[id]', params: { id } });
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setMessaging(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={!!list.isRefetching} onRefresh={() => list.refetch()} tintColor={colors.accent} colors={[colors.accent]} />}>
        <LinearGradient colors={['#1C2A00', colors.bg]} style={[styles.cover, { paddingTop: insets.top }]}>
          <View style={styles.topBar}>
            {isTab ? <View style={{ width: 44 }} /> : <IconButton icon={ChevronLeft} label="Volver" onPress={() => router.back()} size={26} />}
            <Text variant="bodyStrong" numberOfLines={1}>
              @{profile.username}
            </Text>
            {isMe ? (
              <IconButton icon={Settings} label="Ajustes" onPress={() => router.push('/settings')} />
            ) : (
              <IconButton icon={Ellipsis} label="Más opciones" onPress={() => setMenu(true)} />
            )}
          </View>
        </LinearGradient>

        <View style={styles.body}>
          <View style={styles.identity}>
            <Avatar path={profile.avatar_path} name={profile.display_name} size={92} />
            <View style={styles.stats}>
              <Stat value={profile.posts_count} label="Posts" />
              <Stat value={profile.followers_count} label="Seguidores" />
              <Stat value={profile.following_count} label="Siguiendo" />
            </View>
          </View>
          <View style={styles.nameRow}>
            <Text variant="heading" numberOfLines={1} style={{ flexShrink: 1 }}>
              {profile.display_name}
            </Text>
            {profile.is_verified ? <VerifiedBadge size={20} /> : null}
          </View>
          <Text variant="small" tone="subtle">
            {COUNTRY_NAME[profile.country] ?? profile.country}
            {profile.status === 'restricted' && isMe ? ' · Cuenta restringida' : ''}
          </Text>
          {profile.bio ? (
            <Text variant="body" tone="muted" style={{ marginTop: space[2] }}>
              {profile.bio}
            </Text>
          ) : null}

          <View style={styles.buttons}>
            {isMe ? (
              <>
                <Button title="Editar perfil" variant="secondary" size="md" style={{ flex: 1 }} onPress={() => router.push('/settings/edit-profile')} />
                <Button title="Panel de creador" size="md" style={{ flex: 1 }} onPress={() => router.push('/creator')} />
              </>
            ) : (
              <>
                <Button
                  title={following ? 'Siguiendo' : 'Seguir'}
                  variant={following ? 'secondary' : 'primary'}
                  size="md"
                  style={{ flex: 1 }}
                  onPress={() => follow.mutate({ me, target: profile.id, following: !!following })}
                />
                <Button title="Mensaje" icon={MessageCircle} variant="secondary" size="md" style={{ flex: 1 }} loading={messaging} onPress={message} />
              </>
            )}
            <IconButton icon={Share2} label="Compartir perfil" variant="surface" onPress={share} size={20} />
          </View>
        </View>

        <View style={styles.tabs} accessibilityRole="tablist">
          <TabButton selected={tab === 'posts'} label="Publicaciones" onPress={() => setTab('posts')} icon={<Grid3x3 size={21} color={tab === 'posts' ? colors.text : colors.textSubtle} />} />
          {isMe ? (
            <TabButton selected={tab === 'saved'} label="Guardados" onPress={() => setTab('saved')} icon={<Bookmark size={21} color={tab === 'saved' ? colors.text : colors.textSubtle} />} />
          ) : null}
        </View>

        {list.isLoading ? (
          <Loading />
        ) : list.data?.length ? (
          <PostGrid posts={list.data} />
        ) : tab === 'saved' ? (
          <EmptyState icon={Bookmark} title="Nada guardado todavía" text="Tocá el marcador en cualquier publicación para guardarla acá. Solo vos ves tus guardados." />
        ) : isMe ? (
          <EmptyState icon={ImagePlus} title="Tu primera publicación" text="Compartí una foto o un video. El contenido bueno crece aunque tu cuenta sea gratuita." action="Crear" onAction={() => router.push('/create')} />
        ) : (
          <EmptyState icon={Grid3x3} title="Sin publicaciones" text={`@${profile.username} todavía no publicó nada.`} />
        )}
        <View style={{ height: space[8] }} />
      </ScrollView>

      <ActionSheet
        visible={menu}
        title={`@${profile.username}`}
        onClose={() => setMenu(false)}
        actions={[
          { label: 'Copiar enlace del perfil', icon: Link2, onPress: share },
          { label: 'Reportar', icon: Flag, danger: true, onPress: () => router.push({ pathname: '/report', params: { type: 'user', id: profile.id, name: profile.username } }) },
          {
            label: 'Bloquear',
            icon: Ban,
            danger: true,
            onPress: async () => {
              const ok = await confirmAction({ title: `¿Bloquear a @${profile.username}?`, message: 'No verás su contenido y no podrá interactuar con vos.', confirmText: 'Bloquear', destructive: true });
              if (!ok) return;
              block.mutate(
                { target: profile.id },
                {
                  onSuccess: () => {
                    toast('Usuario bloqueado');
                    router.back();
                  },
                  onError: (e) => toast(errorMessage(e), 'error'),
                },
              );
            },
          },
        ]}
      />
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${value} ${label}`}>
      <Text variant="heading">{formatCount(value)}</Text>
      <Text variant="caption" tone="subtle">
        {label}
      </Text>
    </View>
  );
}

function TabButton({ selected, label, onPress, icon }: { selected: boolean; label: string; onPress: () => void; icon: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.tab, selected && styles.tabOn]}>
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  cover: { height: 120 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[2], paddingTop: 4 },
  body: { paddingHorizontal: space[4], marginTop: -34 },
  identity: { flexDirection: 'row', alignItems: 'flex-end', gap: space[4] },
  stats: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', paddingBottom: space[1] },
  stat: { alignItems: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space[3] },
  buttons: { flexDirection: 'row', gap: space[2], marginTop: space[4], alignItems: 'center' },
  tabs: { flexDirection: 'row', marginTop: space[5], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 48, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: colors.text },
});
