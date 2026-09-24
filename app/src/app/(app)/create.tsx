import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Camera, CirclePlay, Image as ImageIcon, Megaphone, Sparkles, type LucideIcon } from '@/ui/icons';

import { useCategories } from '@/lib/api/config';
import { useCreatePost } from '@/lib/api/posts';
import { useCreateStory } from '@/lib/api/stories';
import { useMe } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { LIMITS, MediaError, pickMedia, type PickedMedia } from '@/lib/media';
import { Button, Card, colors, Header, Input, ProgressBar, radius, Screen, space, Text, useToast } from '@/ui';

type Mode = 'post' | 'story' | 'video';

const OPTIONS: { mode: Mode; title: string; text: string; icon: LucideIcon; tint: string }[] = [
  { mode: 'post', title: 'Publicación', text: 'Foto o video para tu perfil y el feed', icon: ImageIcon, tint: '#3D9BFF' },
  { mode: 'video', title: 'Reel', text: 'Video vertical de hasta 10 minutos', icon: CirclePlay, tint: '#FF3B6B' },
  { mode: 'story', title: 'Historia', text: 'Desaparece en 24 horas', icon: Sparkles, tint: '#C8FF3D' },
];

export default function Create() {
  const params = useLocalSearchParams<{ mode?: Mode }>();
  const { userId } = useMe();
  const toast = useToast();
  const [mode, setMode] = useState<Mode | null>(params.mode ?? null);
  const [media, setMedia] = useState<PickedMedia | null>(null);
  const [caption, setCaption] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const { data: categories } = useCategories();
  const createPost = useCreatePost();
  const createStory = useCreateStory();

  const pick = async (camera: boolean) => {
    try {
      const picked = await pickMedia({
        kinds: mode === 'video' ? 'videos' : 'all',
        camera,
        maxVideoMs: mode === 'story' ? LIMITS.storyVideoMs : LIMITS.videoMs,
      });
      if (picked) setMedia(picked);
    } catch (e) {
      toast(e instanceof MediaError ? e.message : 'No pudimos abrir tus archivos.', 'error');
    }
  };

  const publish = async () => {
    if (!media || !mode) return;
    setProgress(0);
    try {
      if (mode === 'story') {
        await createStory.mutateAsync({ media, caption, userId, onProgress: setProgress });
        toast('Historia publicada');
      } else {
        await createPost.mutateAsync({ input: { media, caption, category }, userId, onProgress: setProgress });
        toast('¡Publicado!');
      }
      router.back();
    } catch (e) {
      setProgress(null);
      toast(e instanceof MediaError ? e.message : errorMessage(e), 'error');
    }
  };

  const busy = progress !== null;

  if (!mode) {
    return (
      <View style={styles.root}>
        <Header title="Crear" back="close" />
        <Screen scroll>
          <View style={{ gap: space[3], paddingTop: space[2] }}>
            <Text variant="body" tone="muted">
              ¿Qué querés compartir hoy?
            </Text>
            {OPTIONS.map((o) => (
              <Pressable key={o.mode} onPress={() => setMode(o.mode)} style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.surface2 }]} accessibilityRole="button" accessibilityLabel={`${o.title}. ${o.text}`}>
                <View style={[styles.optionIcon, { backgroundColor: o.tint }]}>
                  <o.icon size={22} color={o.mode === 'story' ? colors.onAccent : colors.white} strokeWidth={2.2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{o.title}</Text>
                  <Text variant="small" tone="subtle">
                    {o.text}
                  </Text>
                </View>
              </Pressable>
            ))}
            <View style={[styles.option, { opacity: 0.6 }]} accessible accessibilityLabel="Promocionar, próximamente">
              <View style={[styles.optionIcon, { backgroundColor: colors.surface3 }]}>
                <Megaphone size={22} color={colors.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">Promocionar · Próximamente</Text>
                <Text variant="small" tone="subtle">
                  Mbarete Ads: alcance estimado, nunca vistas garantizadas
                </Text>
              </View>
            </View>
            <Card style={{ marginTop: space[3] }}>
              <Text variant="small" tone="muted">
                Contenido para todo público. No se permite contenido sexual explícito, no consentido, de explotación ni que involucre a menores.{' '}
                <Text variant="smallStrong" tone="default" onPress={() => router.push({ pathname: '/legal', params: { doc: 'rules' } })}>
                  Ver reglas
                </Text>
              </Text>
            </Card>
          </View>
        </Screen>
      </View>
    );
  }

  const title = mode === 'story' ? 'Nueva historia' : mode === 'video' ? 'Nuevo reel' : 'Nueva publicación';

  return (
    <View style={styles.root}>
      <Header title={title} back="close" onBack={() => (media && !busy ? setMedia(null) : params.mode ? router.back() : setMode(null))} />
      <Screen
        scroll
        keyboard
        footer={
          media ? (
            busy ? (
              <View style={{ gap: space[2] }}>
                <ProgressBar value={progress ?? 0} />
                <Text variant="small" tone="muted" align="center">
                  Subiendo… {Math.round((progress ?? 0) * 100)}%
                </Text>
              </View>
            ) : (
              <Button title={mode === 'story' ? 'Compartir historia' : 'Publicar'} onPress={publish} />
            )
          ) : null
        }>
        {!media ? (
          <View style={{ gap: space[3], paddingTop: space[4] }}>
            <PickButton icon={ImageIcon} title="Elegir de la galería" onPress={() => pick(false)} />
            <PickButton icon={Camera} title={mode === 'video' ? 'Grabar video' : 'Usar la cámara'} onPress={() => pick(true)} />
            <Text variant="small" tone="subtle" align="center" style={{ marginTop: space[2] }}>
              {mode === 'story' ? 'Fotos o videos de hasta 60 segundos.' : 'Imágenes hasta 15 MB. Videos MP4/MOV hasta 100 MB.'}
            </Text>
          </View>
        ) : (
          <View style={{ gap: space[5], paddingTop: space[2] }}>
            <Preview media={media} story={mode === 'story'} />
            <Input
              label={mode === 'story' ? 'Texto (opcional)' : 'Descripción'}
              value={caption}
              onChangeText={setCaption}
              maxLength={mode === 'story' ? 200 : 2200}
              multiline={mode !== 'story'}
              placeholder={mode === 'story' ? 'Escribí algo…' : 'Contá de qué se trata. Usá #hashtags'}
              hint={`${caption.length}/${mode === 'story' ? 200 : 2200}`}
              editable={!busy}
            />
            {mode !== 'story' ? (
              <View style={{ gap: space[2] }}>
                <Text variant="smallStrong" tone="muted">
                  Categoría
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
                  {(categories ?? []).map((c) => (
                    <Pressable
                      key={c.slug}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: category === c.slug }}
                      onPress={() => setCategory(category === c.slug ? null : c.slug)}
                      style={[styles.chip, category === c.slug && styles.chipOn]}>
                      <Text variant="smallStrong" tone={category === c.slug ? 'onAccent' : 'default'}>
                        {c.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </View>
        )}
      </Screen>
    </View>
  );
}

function PickButton({ icon: Icon, title, onPress }: { icon: LucideIcon; title: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.pick, pressed && { backgroundColor: colors.surface2 }]} accessibilityRole="button">
      <Icon size={28} color={colors.accent} />
      <Text variant="bodyStrong">{title}</Text>
    </Pressable>
  );
}

function Preview({ media, story }: { media: PickedMedia; story: boolean }) {
  const ratio = story ? 9 / 16 : Math.min(Math.max(media.width / media.height || 1, 0.8), 1.91);
  return (
    <View style={[styles.preview, { aspectRatio: ratio }, story && { width: '62%', alignSelf: 'center' }]}>
      {media.kind === 'video' ? <VideoPreview uri={media.uri} /> : <Image source={{ uri: media.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />}
    </View>
  );
}

function VideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  option: { flexDirection: 'row', alignItems: 'center', gap: space[4], padding: space[4], borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  optionIcon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  pick: { height: 110, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', gap: space[2] },
  preview: { width: '100%', borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface2 },
  chip: { paddingHorizontal: 14, height: 38, borderRadius: radius.full, backgroundColor: colors.surface2, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.accent },
});
