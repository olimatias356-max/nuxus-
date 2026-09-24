import { useEffect, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image, type ImageContentFit } from 'expo-image';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';

import { useMediaUrl } from '@/lib/signed-urls';
import { colors } from '@/ui';

type ImageProps = { path: string | null | undefined; style?: StyleProp<ViewStyle>; contentFit?: ImageContentFit; label?: string };

export function MediaImage({ path, style, contentFit = 'cover', label }: ImageProps) {
  const url = useMediaUrl(path);
  return (
    <View style={[styles.box, style]} accessibilityRole={label ? 'image' : undefined} accessibilityLabel={label}>
      {url ? (
        <Image
          source={{ uri: url, cacheKey: path ?? undefined }}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          transition={180}
          recyclingKey={path ?? undefined}
          accessibilityIgnoresInvertColors
        />
      ) : null}
    </View>
  );
}

type VideoProps = {
  path: string;
  posterPath?: string | null;
  active: boolean;
  muted: boolean;
  style?: StyleProp<ViewStyle>;
  contentFit?: 'cover' | 'contain';
  loop?: boolean;
  onProgress?: (fraction: number, currentMs: number) => void;
  onEnd?: () => void;
};

/** Plays only while `active`; shows the poster until the first frame is ready. */
export function MediaVideo({ path, posterPath, active, muted, style, contentFit = 'cover', loop = true, onProgress, onEnd }: VideoProps) {
  const url = useMediaUrl(path);
  return (
    <View style={[styles.box, style]}>
      {posterPath ? <MediaImage path={posterPath} style={StyleSheet.absoluteFill} contentFit={contentFit} /> : null}
      {url && active ? (
        <ActiveVideo url={url} muted={muted} contentFit={contentFit} loop={loop} onProgress={onProgress} onEnd={onEnd} />
      ) : null}
    </View>
  );
}

function ActiveVideo({ url, muted, contentFit, loop, onProgress, onEnd }: { url: string; muted: boolean; contentFit: 'cover' | 'contain'; loop: boolean; onProgress?: VideoProps['onProgress']; onEnd?: () => void }) {
  const player = useVideoPlayer({ uri: url }, (p) => {
    p.loop = loop;
    p.muted = muted;
    p.timeUpdateEventInterval = 0.25;
    p.play();
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const progressRef = useRef(onProgress);
  useEffect(() => {
    progressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    // expo-video players are native shared objects configured by mutation.
    // eslint-disable-next-line react-hooks/immutability
    player.muted = muted;
  }, [muted, player]);

  useEffect(() => {
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      const d = player.duration || 0;
      if (d > 0) progressRef.current?.(Math.min(1, currentTime / d), currentTime * 1000);
    });
    const end = player.addListener('playToEnd', () => onEnd?.());
    return () => {
      sub.remove();
      end.remove();
    };
  }, [player, onEnd]);

  return (
    <VideoView
      player={player}
      style={[StyleSheet.absoluteFill, { opacity: status === 'readyToPlay' ? 1 : 0 }]}
      contentFit={contentFit}
      nativeControls={false}
      allowsPictureInPicture={false}
      playsInline
    />
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.surface2, overflow: 'hidden' },
});
