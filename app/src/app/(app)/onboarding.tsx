import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { SuggestedCreators } from '@/components/SuggestedCreators';
import { saveInterests, useCategories } from '@/lib/api/config';
import { useMe } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { onboardingKey } from '@/lib/onboarding';
import { queryClient } from '@/lib/query';
import { secureStorage } from '@/lib/secure-storage';
import { Button, colors, radius, Screen, space, Text, useToast } from '@/ui';
import { Check } from '@/ui/icons';

const EMOJI: Record<string, string> = {
  cultura: '🧉', humor: '😂', musica: '🎶', deportes: '⚽', cocina: '🍲', tecnologia: '💻', arte: '🎨',
  educacion: '📚', moda: '👗', viajes: '🌿', gaming: '🎮', fitness: '💪', negocios: '📈', otros: '✨',
};

export default function Onboarding() {
  const { userId } = useMe();
  const { data: categories } = useCategories();
  const [picked, setPicked] = useState<string[]>([]);
  const [step, setStep] = useState<'topics' | 'creators'>('topics');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const toggle = (slug: string) => setPicked((p) => (p.includes(slug) ? p.filter((s) => s !== slug) : [...p, slug]));

  const finish = async () => {
    await secureStorage.setItem(onboardingKey(userId), '1').catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['feed'] });
    router.back();
  };

  const next = async () => {
    setSaving(true);
    try {
      await saveInterests(picked);
      queryClient.invalidateQueries({ queryKey: ['interests'] });
      setStep('creators');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (step === 'creators') {
    return (
      <Screen scroll edges={['top', 'bottom']} padded={false} footer={<Button title="Empezar" onPress={finish} />}>
        <View style={styles.head}>
          <Text variant="title">Seguí a algunos creadores</Text>
          <Text variant="body" tone="muted">
            Así tu inicio arranca con contenido que te gusta. Podés cambiarlo cuando quieras.
          </Text>
        </View>
        <SuggestedCreators me={userId} />
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      edges={['top', 'bottom']}
      footer={
        <View style={{ gap: space[2] }}>
          <Button title={picked.length ? `Continuar (${picked.length})` : 'Elegí al menos 1'} onPress={next} disabled={!picked.length} loading={saving} />
          <Button title="Saltar" variant="ghost" onPress={finish} />
        </View>
      }>
      <View style={[styles.head, { paddingHorizontal: 0 }]}>
        <Text variant="title">¿Qué te gusta ver?</Text>
        <Text variant="body" tone="muted">
          Elegí tus temas. Tu inicio se adapta a lo que mirás, y siempre vas a descubrir creadores nuevos.
        </Text>
      </View>
      <View style={styles.grid} accessibilityRole="list">
        {(categories ?? []).map((c) => {
          const on = picked.includes(c.slug);
          return (
            <Pressable
              key={c.slug}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={c.name}
              onPress={() => toggle(c.slug)}
              style={[styles.topic, on && styles.topicOn]}>
              <Text style={styles.emoji}>{EMOJI[c.slug] ?? '✨'}</Text>
              <Text variant="bodyStrong" tone={on ? 'onAccent' : 'default'}>
                {c.name}
              </Text>
              {on ? (
                <View style={styles.check}>
                  <Check size={12} color={colors.accent} strokeWidth={3.5} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: space[2], paddingHorizontal: space[5], paddingTop: space[6], paddingBottom: space[4] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  topic: { width: '47%', flexGrow: 1, minHeight: 86, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, padding: space[4], justifyContent: 'space-between' },
  topicOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  emoji: { fontSize: 26, lineHeight: 32 },
  check: { position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.onAccent, alignItems: 'center', justifyContent: 'center' },
});
