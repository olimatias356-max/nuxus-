import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Eye, Flag, Trash, X } from 'lucide-react-native';

import { MediaImage, MediaVideo } from '@/components/Media';
import { markStoryViewed, useDeleteStory, useStories, useStoryRail } from '@/lib/api/stories';
import { useMe } from '@/lib/auth';
import { queryClient } from '@/lib/query';
import { supabase } from '@/lib/supabase';
import { timeAgo } from '@/lib/format';
import { Avatar, colors, IconButton, Loading, space, Text, useToast, VerifiedBadge } from '@/ui';

const IMAGE_MS = 5000;

export default function StoryViewer() {
  const { authorId } = useLocalSearchParams<{ authorId: string }>();
  const { userId } = useMe();
  const insets = useSafeAreaInsets();
  const { data: stories, isLoading } = useStories(authorId);
  const { data: rail } = useStoryRail();
  const del = useDeleteStory();
  const toast = useToast();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const author = rail?.find((r) => r.author_id === authorId);
  const story = stories?.[index];
  const isMine = authorId === userId;

  const views = useQuery({
    queryKey: ['story-views', story?.id],
    enabled: isMine && !!story,
    queryFn: async () => {
      const { count } = await supabase.from('story_views').select('viewer_id', { count: 'exact', head: true }).eq('story_id', story!.id);
      return count ?? 0;
    },
  });

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  useEffect(() => {
    if (story && !isMine) markStoryViewed(story.id).then(() => queryClient.invalidateQueries({ queryKey: ['stories', 'rail'] }));
  }, [story, isMine]);

  const next = () => {
    if (!stories) return;
    if (index < stories.length - 1) return setIndex(index + 1);
    // continue with the next author that has unseen stories
    const nextAuthor = rail?.find((r) => r.has_unseen && r.author_id !== authorId && r.author_id !== userId);
    if (nextAuthor) router.replace({ pathname: '/story/[authorId]', params: { authorId: nextAuthor.author_id } });
    else router.back();
  };
  const prev = () => setIndex((i) => Math.max(0, i - 1));

  useEffect(() => {
    if (!story || paused || reduceMotion) return;
    const duration = story.kind === 'video' ? Math.min(story.duration_ms ?? 15000, 60000) : IMAGE_MS;
    progress.setValue(0);
    const anim = Animated.timing(progress, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: false });
    anim.start(({ finished }) => finished && next());
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id, paused, reduceMotion]);

  if (isLoading) return <Loading />;
  if (!stories?.length || !story) {
    return (
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: insets.top + space[2] }]}>
          <View style={{ flex: 1 }} />
          <IconButton icon={X} label="Cerrar" color="#fff" onPress={() => router.back()} />
        </View>
        <View style={styles.center}>
          <Text variant="body" tone="white">
            Esta historia ya no está disponible.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {story.kind === 'video' ? (
        <MediaVideo path={story.media_path} active={!paused} muted={false} loop={false} style={StyleSheet.absoluteFill} contentFit="contain" onEnd={next} />
      ) : (
        <MediaImage path={story.media_path} style={StyleSheet.absoluteFill} contentFit="contain" label={story.caption || 'Historia'} />
      )}
      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.6)', 'transparent']} style={styles.topShade} />

      <Pressable
        style={[styles.tap, { left: 0 }]}
        onPress={prev}
        onLongPress={() => setPaused(true)}
        onPressOut={() => setPaused(false)}
        accessibilityRole="button"
        accessibilityLabel="Historia anterior"
      />
      <Pressable
        style={[styles.tap, { right: 0, width: '65%' }]}
        onPress={next}
        onLongPress={() => setPaused(true)}
        onPressOut={() => setPaused(false)}
        accessibilityRole="button"
        accessibilityLabel="Historia siguiente"
      />

      <View style={[styles.header, { paddingTop: insets.top + space[2] }]} pointerEvents="box-none">
        <View style={styles.bars}>
          {stories.map((s, i) => (
            <View key={s.id} style={styles.barTrack}>
              <Animated.View
                style={[
                  styles.barFill,
                  {
                    width: i < index ? '100%' : i > index ? '0%' : reduceMotion ? '100%' : progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                  },
                ]}
              />
            </View>
          ))}
        </View>
        <View style={styles.who}>
          <Avatar path={author?.avatar_path} name={author?.username ?? '?'} size={36} />
          <Pressable style={{ flex: 1 }} onPress={() => author && router.replace({ pathname: '/u/[username]', params: { username: author.username } })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text variant="bodyStrong" tone="white">
                {isMine ? 'Tu historia' : author?.username}
              </Text>
              {author?.is_verified ? <VerifiedBadge size={14} /> : null}
            </View>
            <Text variant="caption" style={{ color: 'rgba(255,255,255,0.75)' }}>
              {timeAgo(story.created_at)}
            </Text>
          </Pressable>
          {isMine ? (
            <IconButton
              icon={Trash}
              label="Eliminar historia"
              color="#fff"
              onPress={() => {
                setPaused(true);
                Alert.alert('¿Eliminar esta historia?', undefined, [
                  { text: 'Cancelar', style: 'cancel', onPress: () => setPaused(false) },
                  { text: 'Eliminar', style: 'destructive', onPress: () => del.mutate(story, { onSuccess: () => { toast('Historia eliminada'); router.back(); } }) },
                ]);
              }}
            />
          ) : (
            <IconButton icon={Flag} label="Reportar historia" color="#fff" onPress={() => router.push({ pathname: '/report', params: { type: 'story', id: story.id, name: author?.username ?? '' } })} />
          )}
          <IconButton icon={X} label="Cerrar" color="#fff" onPress={() => router.back()} />
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space[5] }]} pointerEvents="none">
        {story.caption ? (
          <Text variant="subheading" tone="white" align="center" style={styles.shadow}>
            {story.caption}
          </Text>
        ) : null}
        {isMine ? (
          <View style={styles.views}>
            <Eye size={16} color="#fff" />
            <Text variant="smallStrong" tone="white">
              {views.data ?? 0} {views.data === 1 ? 'vista' : 'vistas'}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0, height: 160 },
  tap: { position: 'absolute', top: 100, bottom: 100, width: '35%' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: space[3], gap: space[3] },
  bars: { flexDirection: 'row', gap: 4 },
  barTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  barFill: { height: 3, backgroundColor: colors.white },
  who: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: space[5], gap: space[3], alignItems: 'center' },
  views: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  shadow: { textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 8 },
});
