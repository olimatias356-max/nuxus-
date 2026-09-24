import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Camera } from 'lucide-react-native';

import { useUpdateProfile } from '@/lib/api/social';
import { useMe } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { MediaError, objectPath, pickMedia, removeFiles, uploadFile } from '@/lib/media';
import { displayNameSchema, firstError } from '@/lib/validation';
import { Avatar, Button, colors, Header, Input, radius, Screen, space, Text, useToast } from '@/ui';

const COUNTRIES = [
  { code: 'PY', label: '🇵🇾 Paraguay' },
  { code: 'AR', label: '🇦🇷 Argentina' },
  { code: 'BR', label: '🇧🇷 Brasil' },
];

export default function EditProfile() {
  const { profile, userId, refreshProfile } = useMe();
  const update = useUpdateProfile();
  const toast = useToast();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [country, setCountry] = useState(profile?.country ?? 'PY');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changePhoto = async () => {
    try {
      const media = await pickMedia({ kinds: 'images', square: true });
      if (!media) return;
      setUploading(true);
      const path = await uploadFile('avatars', objectPath(userId, media.mimeType), media);
      const old = profile?.avatar_path;
      await update.mutateAsync({ id: userId, avatar_path: path });
      if (old) removeFiles('avatars', [old]).catch(() => {});
      await refreshProfile();
      toast('Foto actualizada');
    } catch (e) {
      toast(e instanceof MediaError ? e.message : errorMessage(e), 'error');
    } finally {
      setUploading(false);
    }
  };

  const save = () => {
    const n = displayNameSchema.safeParse(name);
    if (!n.success) return setError(firstError(n));
    setError(null);
    update.mutate(
      { id: userId, display_name: n.data, bio: bio.trim(), country },
      {
        onSuccess: async () => {
          await refreshProfile();
          toast('Perfil actualizado');
          router.back();
        },
        onError: (e) => setError(errorMessage(e)),
      },
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Editar perfil" />
      <Screen scroll keyboard footer={<Button title="Guardar" onPress={save} loading={update.isPending && !uploading} />}>
        <View style={{ gap: space[5], paddingTop: space[3] }}>
          <Pressable onPress={changePhoto} style={styles.avatar} accessibilityRole="button" accessibilityLabel="Cambiar foto de perfil">
            <Avatar path={profile?.avatar_path} name={profile?.username ?? '?'} size={104} />
            <View style={styles.camera}>
              <Camera size={18} color={colors.onAccent} />
            </View>
            <Text variant="smallStrong" tone="accent">
              {uploading ? 'Subiendo…' : 'Cambiar foto'}
            </Text>
          </Pressable>
          <Input label="Nombre visible" value={name} onChangeText={setName} maxLength={50} error={error} />
          <Input label="Biografía" value={bio} onChangeText={setBio} multiline maxLength={160} hint={`${bio.length}/160`} placeholder="Contá quién sos y qué creás" />
          <View style={{ gap: space[2] }}>
            <Text variant="smallStrong" tone="muted">
              País
            </Text>
            <View style={styles.row} accessibilityRole="radiogroup">
              {COUNTRIES.map((c) => (
                <Pressable key={c.code} accessibilityRole="radio" accessibilityState={{ checked: country === c.code }} onPress={() => setCountry(c.code)} style={[styles.chip, country === c.code && styles.chipOn]}>
                  <Text variant="smallStrong" tone={country === c.code ? 'onAccent' : 'default'}>
                    {c.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text variant="caption" tone="subtle">
              Define la moneda de tus ganancias y retiros.
            </Text>
          </View>
          <Input label="Usuario" value={`@${profile?.username ?? ''}`} editable={false} hint="El nombre de usuario no se puede cambiar." />
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', gap: space[2], alignSelf: 'center' },
  camera: { position: 'absolute', top: 72, right: 0, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.bg },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  chip: { paddingHorizontal: 14, height: 40, borderRadius: radius.full, backgroundColor: colors.surface2, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.accent },
});
