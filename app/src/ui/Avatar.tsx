import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { avatarUrl } from '@/lib/media';
import { initials } from '@/lib/format';
import { Text } from './Text';
import { colors, fonts } from './theme';

const PALETTES: Array<[string, string]> = [
  ['#3D5AFE', '#00B8D4'],
  ['#FF3B6B', '#FF9E3D'],
  ['#7C4DFF', '#FF4FD8'],
  ['#00C853', '#00B8D4'],
  ['#FFB300', '#FF5252'],
  ['#2979FF', '#7C4DFF'],
];

function palette(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return PALETTES[Math.abs(h) % PALETTES.length];
}

type Props = {
  path?: string | null;
  name: string;
  size?: number;
  ring?: 'none' | 'unseen' | 'seen';
};

export function Avatar({ path, name, size = 40, ring = 'none' }: Props) {
  const uri = avatarUrl(path);
  const inner = ring === 'none' ? size : size - 8;
  const content = uri ? (
    <Image
      source={{ uri }}
      style={{ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: colors.surface3 }}
      contentFit="cover"
      transition={150}
      accessibilityIgnoresInvertColors
    />
  ) : (
    <LinearGradient colors={palette(name)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: inner, height: inner, borderRadius: inner / 2, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: fonts.extrabold, fontSize: inner * 0.38, lineHeight: inner * 0.46, color: colors.white }}>
        {initials(name)}
      </Text>
    </LinearGradient>
  );

  if (ring === 'none') return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{content}</View>;

  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {ring === 'unseen' ? (
        <LinearGradient colors={[colors.accent, '#3DDCFF']} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: colors.surface3 }]} />
      )}
      <View style={[styles.gap, { width: size - 4, height: size - 4, borderRadius: (size - 4) / 2, margin: 2 }]}>{content}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});
