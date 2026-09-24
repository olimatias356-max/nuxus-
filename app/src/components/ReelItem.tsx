import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Bookmark, Ellipsis, Heart, MessageCircle, Plus, Send, VolumeX } from '@/ui/icons';

import { trackView, useToggleLike, useToggleSave } from '@/lib/api/posts';
import { useToggleFollow } from '@/lib/api/social';
import { formatCount } from '@/lib/format';
import type { FeedItem } from '@/lib/types';
import { Avatar, colors, radius, space, Text, VerifiedBadge } from '@/ui';
import { HeartBurst, type HeartBurstHandle } from './HeartBurst';
import { MediaVideo } from './Media';
import { useMuted } from './mute-store';
import { sharePost } from './usePostActions';

type Props = { post: FeedItem; me: string; active: boolean; height: number; bottomInset: number; onMore: (p: FeedItem) => void };

function ReelItemImpl({ post, me, active, height, bottomInset, onMore }: Props) {
  const like = useToggleLike();
  const save = useToggleSave();
  const follow = useToggleFollow();
  const [muted, setMuted] = useMuted();
  const [progress, setProgress] = useState(0);
  const burst = useRef<HeartBurstHandle>(null);
  const lastTap = useRef(0);
  const watched = useRef(0);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => trackView(post.id, 2000), 2000);
    return () => clearTimeout(t);
  }, [active, post.id]);

  const toggleLike = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    like.mutate({ post, userId: me });
  }, [like, post, me]);

  const onPress = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      burst.current?.play();
      if (!post.liked) toggleLike();
      lastTap.current = 0;
    } else {
      lastTap.current = now;
      setTimeout(() => lastTap.current && setMuted(!muted), 290);
    }
  };

  const openProfile = () => router.push({ pathname: '/u/[username]', params: { username: post.author_username } });

  return (
    <View style={[styles.root, { height }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onPress} accessibilityLabel="Video. Tocá para silenciar, dos veces para dar me gusta">
        <MediaVideo
          path={post.media_path}
          posterPath={post.thumb_path}
          active={active}
          muted={muted}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          onProgress={(f, ms) => {
            setProgress(f);
            watched.current = ms;
            if (f > 0.95) trackView(post.id, ms, true);
          }}
        />
        <HeartBurst ref={burst} />
      </Pressable>

      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.45)', 'transparent']} style={styles.topShade} />
      <LinearGradient pointerEvents="none" colors={['transparent', 'rgba(0,0,0,0.75)']} style={styles.bottomShade} />

      {muted && active ? (
        <View pointerEvents="none" style={styles.mutedBadge}>
          <VolumeX size={15} color={colors.white} />
          <Text variant="caption" tone="white">
            Tocá para activar el sonido
          </Text>
        </View>
      ) : null}

      <View style={[styles.rail, { bottom: bottomInset + space[6] }]}>
        <Pressable onPress={openProfile} accessibilityRole="link" accessibilityLabel={`Perfil de ${post.author_username}`} style={{ marginBottom: 8 }}>
          <Avatar path={post.author_avatar_path} name={post.author_display_name} size={48} />
          {post.author_id !== me && !post.following ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Seguir a ${post.author_username}`}
              onPress={() => follow.mutate({ me, target: post.author_id, following: false })}
              style={styles.followDot}>
              <Plus size={13} color={colors.onAccent} strokeWidth={3} />
            </Pressable>
          ) : null}
        </Pressable>
        <RailButton label={post.liked ? 'Quitar me gusta' : 'Me gusta'} count={post.like_count} onPress={toggleLike}>
          <Heart size={32} color={post.liked ? colors.like : colors.white} fill={post.liked ? colors.like : 'transparent'} strokeWidth={1.8} />
        </RailButton>
        <RailButton label="Comentarios" count={post.comment_count} onPress={() => router.push({ pathname: '/comments/[id]', params: { id: post.id } })}>
          <MessageCircle size={30} color={colors.white} strokeWidth={1.8} />
        </RailButton>
        <RailButton label={post.saved ? 'Quitar de guardados' : 'Guardar'} onPress={() => save.mutate({ post, userId: me })}>
          <Bookmark size={29} color={post.saved ? colors.accent : colors.white} fill={post.saved ? colors.accent : 'transparent'} strokeWidth={1.8} />
        </RailButton>
        <RailButton label="Compartir" onPress={() => sharePost(post)}>
          <Send size={28} color={colors.white} strokeWidth={1.8} />
        </RailButton>
        <RailButton label="Más opciones" onPress={() => onMore(post)}>
          <Ellipsis size={28} color={colors.white} strokeWidth={1.8} />
        </RailButton>
      </View>

      <View style={[styles.info, { bottom: bottomInset + space[5] }]} pointerEvents="box-none">
        <Pressable onPress={openProfile} style={styles.who} accessibilityRole="link">
          <Text variant="bodyStrong" tone="white">
            @{post.author_username}
          </Text>
          {post.author_is_verified ? <VerifiedBadge size={16} /> : null}
        </Pressable>
        {post.caption ? (
          <Text variant="body" tone="white" numberOfLines={3} style={styles.shadow}>
            {post.caption}
          </Text>
        ) : null}
        <Text variant="caption" style={{ color: 'rgba(255,255,255,0.75)' }}>
          {formatCount(post.view_count)} reproducciones
        </Text>
      </View>

      <View style={[styles.progressTrack, { bottom: bottomInset }]} pointerEvents="none">
        <View style={[styles.progressBar, { width: `${(active ? progress : 0) * 100}%` }]} />
      </View>
    </View>
  );
}

function RailButton({ children, label, count, onPress }: { children: React.ReactNode; label: string; count?: number; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={count != null ? `${label}, ${count}` : label} onPress={onPress} style={styles.railBtn} hitSlop={6}>
      {children}
      {count != null ? (
        <Text variant="caption" tone="white" style={styles.shadow}>
          {formatCount(count)}
        </Text>
      ) : null}
    </Pressable>
  );
}

export const ReelItem = memo(ReelItemImpl);

const styles = StyleSheet.create({
  root: { width: '100%', backgroundColor: '#000', overflow: 'hidden' },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0, height: 140 },
  bottomShade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 320 },
  mutedBadge: { position: 'absolute', top: '48%', alignSelf: 'center', flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full },
  rail: { position: 'absolute', right: space[2], alignItems: 'center', gap: space[4] },
  railBtn: { alignItems: 'center', gap: 3, minWidth: 48, minHeight: 48, justifyContent: 'center' },
  followDot: { position: 'absolute', bottom: -8, alignSelf: 'center', width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#000' },
  info: { position: 'absolute', left: space[4], right: 88, gap: 6 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shadow: { textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  progressTrack: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.2)' },
  progressBar: { height: 2, backgroundColor: colors.accent },
});
