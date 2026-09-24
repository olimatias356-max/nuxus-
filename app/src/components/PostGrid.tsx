import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { Clock, Play } from '@/ui/icons';

import { formatCount } from '@/lib/format';
import type { FeedItem } from '@/lib/types';
import { colors, Text } from '@/ui';
import { MediaImage } from './Media';

export function PostGrid({ posts }: { posts: FeedItem[] }) {
  const { width } = useWindowDimensions();
  const size = Math.floor((width - 4) / 3);
  return (
    <View style={styles.grid}>
      {posts.map((p) => (
        <Pressable
          key={p.id}
          onPress={() => router.push({ pathname: '/post/[id]', params: { id: p.id } })}
          accessibilityRole="button"
          accessibilityLabel={`${p.kind === 'video' ? 'Video' : 'Foto'}${p.caption ? `: ${p.caption.slice(0, 60)}` : ''}`}
          style={{ width: size, height: size * 1.25 }}>
          <MediaImage path={p.thumb_path ?? p.media_path} style={StyleSheet.absoluteFill} />
          {p.kind === 'video' ? (
            <View style={styles.views}>
              <Play size={12} color={colors.white} fill={colors.white} />
              <Text variant="caption" tone="white">
                {formatCount(p.view_count)}
              </Text>
            </View>
          ) : null}
          {p.status === 'review' ? (
            <View style={styles.review}>
              <Clock size={12} color={colors.warning} />
              <Text variant="caption" tone="warning">
                En revisión
              </Text>
            </View>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  views: { position: 'absolute', left: 6, bottom: 6, flexDirection: 'row', alignItems: 'center', gap: 3 },
  review: { position: 'absolute', left: 6, top: 6, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
});
