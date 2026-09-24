import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Bookmark, Ellipsis, Heart, MessageCircle, Send, Volume2, VolumeX } from '@/ui/icons';

import { trackView, useToggleLike, useToggleSave } from '@/lib/api/posts';
import { useToggleFollow } from '@/lib/api/social';
import { formatCount, formatDuration, timeAgo } from '@/lib/format';
import type { FeedItem } from '@/lib/types';
import { Avatar, colors, IconButton, radius, space, Text, VerifiedBadge } from '@/ui';
import { HeartBurst, type HeartBurstHandle } from './HeartBurst';
import { MediaImage, MediaVideo } from './Media';
import { useMuted } from './mute-store';
import { sharePost } from './usePostActions';

type Props = { post: FeedItem; me: string; active: boolean; width: number; onMore: (p: FeedItem) => void };

function PostCardImpl({ post, me, active, width, onMore }: Props) {
  const like = useToggleLike();
  const save = useToggleSave();
  const follow = useToggleFollow();
  const [muted, setMuted] = useMuted();
  const [expanded, setExpanded] = useState(false);
  const burst = useRef<HeartBurstHandle>(null);
  const lastTap = useRef(0);

  const mediaWidth = width - space[3] * 2;
  const ratio = post.width && post.height ? Math.min(Math.max(post.width / post.height, 0.8), 1.91) : post.kind === 'video' ? 0.8 : 1;

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => trackView(post.id, post.kind === 'image' ? 1500 : 2000), post.kind === 'image' ? 1500 : 2000);
    return () => clearTimeout(t);
  }, [active, post.id, post.kind]);

  const toggleLike = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    like.mutate({ post, userId: me });
  }, [like, post, me]);

  const onMediaPress = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      burst.current?.play();
      if (!post.liked) toggleLike();
      lastTap.current = 0;
    } else {
      lastTap.current = now;
      if (post.kind === 'video') setTimeout(() => lastTap.current && setMuted(!muted), 290);
    }
  };

  const openProfile = () => router.push({ pathname: '/u/[username]', params: { username: post.author_username } });
  const long = post.caption.length > 120;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable onPress={openProfile} style={styles.author} accessibilityRole="link" accessibilityLabel={`Perfil de ${post.author_display_name}`}>
          <Avatar path={post.author_avatar_path} name={post.author_display_name} size={40} />
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                {post.author_display_name}
              </Text>
              {post.author_is_verified ? <VerifiedBadge size={15} /> : null}
            </View>
            <Text variant="small" tone="subtle" numberOfLines={1}>
              @{post.author_username} · {timeAgo(post.created_at)}
            </Text>
          </View>
        </Pressable>
        {post.author_id !== me && !post.following ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Seguir a ${post.author_username}`}
            onPress={() => follow.mutate({ me, target: post.author_id, following: false })}
            style={({ pressed }) => [styles.follow, pressed && { opacity: 0.7 }]}>
            <Text variant="smallStrong" tone="onAccent">
              Seguir
            </Text>
          </Pressable>
        ) : null}
        <IconButton icon={Ellipsis} label="Más opciones" onPress={() => onMore(post)} size={22} color={colors.textMuted} />
      </View>

      <Pressable
        onPress={onMediaPress}
        accessibilityRole="button"
        accessibilityLabel={post.kind === 'video' ? 'Video. Tocá dos veces para dar me gusta' : 'Imagen. Tocá dos veces para dar me gusta'}
        style={[styles.media, { width: mediaWidth, height: mediaWidth / ratio }]}>
        {post.kind === 'video' ? (
          <MediaVideo path={post.media_path} posterPath={post.thumb_path} active={active} muted={muted} style={StyleSheet.absoluteFill} />
        ) : (
          <MediaImage path={post.media_path} style={StyleSheet.absoluteFill} />
        )}
        {post.kind === 'video' ? (
          <>
            <View style={[styles.glass, { right: 12, bottom: 12 }]}>
              <Text variant="caption" tone="white">
                {formatDuration(post.duration_ms)}
              </Text>
            </View>
            <View style={[styles.glass, styles.round, { left: 12, bottom: 12 }]}>
              {muted ? <VolumeX size={16} color={colors.white} /> : <Volume2 size={16} color={colors.white} />}
            </View>
          </>
        ) : null}
        <HeartBurst ref={burst} />
      </Pressable>

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={post.liked ? 'Quitar me gusta' : 'Me gusta'} accessibilityState={{ selected: post.liked }} onPress={toggleLike} style={styles.action} hitSlop={6}>
          <Heart size={25} color={post.liked ? colors.like : colors.text} fill={post.liked ? colors.like : 'transparent'} strokeWidth={2} />
          <Text variant="smallStrong">{formatCount(post.like_count)}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Comentarios, ${post.comment_count}`} onPress={() => router.push({ pathname: '/comments/[id]', params: { id: post.id } })} style={styles.action} hitSlop={6}>
          <MessageCircle size={24} color={colors.text} strokeWidth={2} />
          <Text variant="smallStrong">{formatCount(post.comment_count)}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Compartir" onPress={() => sharePost(post)} style={styles.action} hitSlop={6}>
          <Send size={23} color={colors.text} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel={post.saved ? 'Quitar de guardados' : 'Guardar'} accessibilityState={{ selected: post.saved }} onPress={() => save.mutate({ post, userId: me })} style={styles.action} hitSlop={6}>
          <Bookmark size={24} color={post.saved ? colors.accent : colors.text} fill={post.saved ? colors.accent : 'transparent'} strokeWidth={2} />
        </Pressable>
      </View>

      {post.caption ? (
        <Pressable onPress={() => long && setExpanded((e) => !e)} disabled={!long} style={styles.caption}>
          <Text variant="body" numberOfLines={expanded ? undefined : 3}>
            <Text variant="bodyStrong">{post.author_username} </Text>
            {post.caption}
          </Text>
          {long && !expanded ? (
            <Text variant="smallStrong" tone="subtle">
              Ver más
            </Text>
          ) : null}
        </Pressable>
      ) : null}
      {post.comment_count > 0 ? (
        <Pressable onPress={() => router.push({ pathname: '/comments/[id]', params: { id: post.id } })} style={styles.commentsLink}>
          <Text variant="small" tone="subtle">
            Ver {post.comment_count === 1 ? 'el comentario' : `los ${formatCount(post.comment_count)} comentarios`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export const PostCard = memo(PostCardImpl);

const styles = StyleSheet.create({
  card: { paddingBottom: space[5] },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[3], paddingVertical: space[2], gap: space[2] },
  author: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[3] },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  follow: { backgroundColor: colors.accent, paddingHorizontal: 14, height: 32, borderRadius: radius.full, justifyContent: 'center' },
  media: { marginHorizontal: space[3], borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface2 },
  glass: { position: 'absolute', backgroundColor: 'rgba(10,10,15,0.55)', paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.full },
  round: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 0, paddingVertical: 0 },
  actions: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[3], paddingTop: space[2], gap: space[1] },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, minWidth: 44, paddingHorizontal: 6 },
  caption: { paddingHorizontal: space[4], gap: 2 },
  commentsLink: { paddingHorizontal: space[4], paddingTop: 6 },
});
