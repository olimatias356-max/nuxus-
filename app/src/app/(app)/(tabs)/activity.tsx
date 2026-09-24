import { useCallback, useMemo } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BadgeCheck, Bell, CircleDollarSign, Heart, MessageCircle, ShieldAlert, ShieldCheck, UserPlus, Wallet, type LucideIcon } from 'lucide-react-native';

import { MediaImage } from '@/components/Media';
import { useMarkNotificationsRead, useNotifications } from '@/lib/api/activity';
import { usePost } from '@/lib/api/posts';
import { errorMessage } from '@/lib/errors';
import { timeAgo } from '@/lib/format';
import type { AppNotification, NotificationType } from '@/lib/types';
import { Avatar, colors, EmptyState, ErrorState, Loading, space, Text } from '@/ui';

const ICONS: Record<NotificationType, [LucideIcon, string]> = {
  like: [Heart, colors.like],
  comment: [MessageCircle, colors.verified],
  follow: [UserPlus, colors.accent],
  earning: [CircleDollarSign, colors.accent],
  payment: [BadgeCheck, colors.accent],
  payout: [Wallet, colors.success],
  kyc: [ShieldCheck, colors.verified],
  moderation: [ShieldAlert, colors.warning],
  security: [ShieldAlert, colors.danger],
  system: [Bell, colors.text],
};

function open(n: AppNotification) {
  if ((n.type === 'like' || n.type === 'comment') && n.post_id) return router.push({ pathname: '/post/[id]', params: { id: n.post_id } });
  if (n.type === 'follow' && n.actor) return router.push({ pathname: '/u/[username]', params: { username: n.actor.username } });
  if (['earning', 'payment', 'payout', 'kyc'].includes(n.type)) return router.push('/creator');
  if (n.type === 'moderation') {
    const d = n.data as { target_type?: string; target_id?: string };
    return router.push({ pathname: '/settings/appeal', params: { type: d.target_type ?? 'account', id: d.target_id ?? '' } });
  }
  if (n.type === 'security') return router.push('/settings/security');
}

function group(items: AppNotification[]) {
  const now = Date.now();
  const today: AppNotification[] = [];
  const week: AppNotification[] = [];
  const older: AppNotification[] = [];
  for (const n of items) {
    const age = now - new Date(n.created_at).getTime();
    (age < 86_400_000 ? today : age < 7 * 86_400_000 ? week : older).push(n);
  }
  return [
    { title: 'Hoy', data: today },
    { title: 'Esta semana', data: week },
    { title: 'Anteriores', data: older },
  ].filter((s) => s.data.length);
}

export default function Activity() {
  const insets = useSafeAreaInsets();
  const q = useNotifications();
  const markRead = useMarkNotificationsRead();
  const sections = useMemo(() => group(q.data ?? []), [q.data]);

  useFocusEffect(
    useCallback(() => {
      q.refetch();
      const t = setTimeout(() => markRead.mutate(), 1500);
      return () => clearTimeout(t);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text variant="title" accessibilityRole="header">
          Actividad
        </Text>
      </View>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(n) => n.id}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.accent} colors={[colors.accent]} />}
          renderSectionHeader={({ section }) => (
            <Text variant="smallStrong" tone="subtle" style={styles.section}>
              {section.title}
            </Text>
          )}
          renderItem={({ item }) => <NotificationRow n={item} />}
          ListEmptyComponent={<EmptyState icon={Bell} title="Todo tranquilo por acá" text="Cuando alguien te siga, comente o reaccione, lo vas a ver en esta pantalla." />}
          contentContainerStyle={{ paddingBottom: space[6], flexGrow: 1 }}
        />
      )}
    </View>
  );
}

function NotificationRow({ n }: { n: AppNotification }) {
  const [Icon, tint] = ICONS[n.type] ?? ICONS.system;
  const unread = !n.read_at;
  return (
    <Pressable onPress={() => open(n)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]} accessibilityRole="button">
      <View>
        {n.actor ? (
          <Avatar path={n.actor.avatar_path} name={n.actor.username} size={46} />
        ) : (
          <View style={[styles.iconBubble, { backgroundColor: colors.surface2 }]}>
            <Icon size={21} color={tint} />
          </View>
        )}
        {n.actor ? (
          <View style={[styles.miniIcon, { backgroundColor: tint }]}>
            <Icon size={11} color={n.type === 'follow' ? colors.onAccent : colors.white} fill={n.type === 'like' ? colors.white : 'transparent'} strokeWidth={2.6} />
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" numberOfLines={3}>
          {n.actor ? <Text variant="bodyStrong">{n.actor.username} </Text> : null}
          {n.body}
        </Text>
        <Text variant="small" tone="subtle">
          {timeAgo(n.created_at)}
        </Text>
      </View>
      {n.post_id && (n.type === 'like' || n.type === 'comment') ? <PostThumb postId={n.post_id} /> : null}
      {unread ? <View style={styles.dot} accessibilityLabel="Sin leer" /> : null}
    </Pressable>
  );
}

function PostThumb({ postId }: { postId: string }) {
  const { data } = usePost(postId);
  return (
    <View style={styles.thumb}>
      {data ? <MediaImage path={data.thumb_path ?? data.media_path} style={StyleSheet.absoluteFill} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: space[4], paddingVertical: space[3] },
  section: { paddingHorizontal: space[4], paddingTop: space[4], paddingBottom: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3] },
  iconBubble: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  miniIcon: { position: 'absolute', right: -2, bottom: -2, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  thumb: { width: 44, height: 44, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.surface2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
});
