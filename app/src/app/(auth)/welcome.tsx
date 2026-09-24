import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BadgeCheck, Heart, Play, TrendingUp } from '@/ui/icons';

import { Button, colors, fonts, radius, space, Text, Wordmark } from '@/ui';

export default function Welcome() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + space[4], paddingBottom: Math.max(insets.bottom, space[5]) }]}>
      <Wordmark size={20} />

      <View style={styles.collage} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <LinearGradient colors={['#3D5AFE', '#00B8D4']} style={[styles.tile, styles.tileA]}>
          <View style={styles.playChip}>
            <Play size={14} color={colors.white} fill={colors.white} />
            <Text variant="caption" tone="white">0:32</Text>
          </View>
        </LinearGradient>
        <LinearGradient colors={['#FF3B6B', '#FF9E3D']} style={[styles.tile, styles.tileB]}>
          <View style={styles.likeChip}>
            <Heart size={14} color={colors.like} fill={colors.like} />
            <Text variant="caption">12,4K</Text>
          </View>
        </LinearGradient>
        <LinearGradient colors={['#7C4DFF', '#FF4FD8']} style={[styles.tile, styles.tileC]} />
        <View style={styles.earnCard}>
          <View style={styles.earnIcon}>
            <TrendingUp size={16} color={colors.onAccent} strokeWidth={2.6} />
          </View>
          <View>
            <Text variant="caption" tone="subtle">Ganancias del mes</Text>
            <Text style={styles.earnValue}>236.500 Gs</Text>
          </View>
        </View>
        <View style={styles.verifiedCard}>
          <BadgeCheck size={16} color={colors.verified} />
          <Text variant="caption">Identidad verificada</Text>
        </View>
      </View>

      <View style={styles.copy}>
        <Text variant="hero">
          Creá. Crecé.{'\n'}
          <Text variant="hero" tone="accent">Cobrá.</Text>
        </Text>
        <Text variant="body" tone="muted">
          La red de creadores hecha en Paraguay para toda LATAM. Tu contenido crece por lo que vale, no por lo que pagás.
        </Text>
      </View>

      <View style={styles.actions}>
        <Button title="Crear cuenta" onPress={() => router.push('/sign-up')} />
        <Button title="Ya tengo cuenta" variant="secondary" onPress={() => router.push('/sign-in')} />
        <Text variant="small" tone="subtle" align="center">
          Al continuar aceptás los{' '}
          <Text variant="smallStrong" tone="muted" onPress={() => router.push({ pathname: '/legal', params: { doc: 'terms' } })} accessibilityRole="link">
            Términos
          </Text>{' '}
          y la{' '}
          <Text variant="smallStrong" tone="muted" onPress={() => router.push({ pathname: '/legal', params: { doc: 'privacy' } })} accessibilityRole="link">
            Política de privacidad
          </Text>
          .
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space[5], gap: space[5] },
  collage: { flex: 1, minHeight: 260, position: 'relative' },
  tile: { position: 'absolute', borderRadius: radius.xl },
  tileA: { width: '46%', height: '78%', left: 0, top: '8%', transform: [{ rotate: '-6deg' }] },
  tileB: { width: '44%', height: '62%', right: 0, top: 0, transform: [{ rotate: '5deg' }] },
  tileC: { width: '36%', height: '34%', right: '10%', bottom: 0, transform: [{ rotate: '-3deg' }], opacity: 0.9 },
  playChip: { position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full },
  likeChip: { position: 'absolute', right: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.bg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full },
  earnCard: { position: 'absolute', left: '18%', bottom: '4%', flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface2, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.borderStrong },
  earnIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  earnValue: { fontFamily: fonts.display, fontSize: 16, color: colors.text },
  verifiedCard: { position: 'absolute', right: '4%', top: '58%', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface2, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.borderStrong },
  copy: { gap: space[3] },
  actions: { gap: space[3] },
});
