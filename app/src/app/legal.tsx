import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { LEGAL, type LegalDoc } from '@/lib/legal';
import { Card, Header, Screen, space, Text } from '@/ui';

export default function Legal() {
  const { doc = 'terms' } = useLocalSearchParams<{ doc: LegalDoc }>();
  const content = LEGAL[doc] ?? LEGAL.terms;
  return (
    <View style={{ flex: 1 }}>
      <Header title={content.title} back="close" />
      <Screen scroll>
        <View style={{ gap: space[5], paddingTop: space[2] }}>
          <Text variant="small" tone="subtle">
            Última actualización: {content.updated}
          </Text>
          {content.sections.map((s) => (
            <View key={s.h} style={{ gap: space[2] }}>
              <Text variant="subheading">{s.h}</Text>
              <Text variant="body" tone="muted">
                {s.p}
              </Text>
            </View>
          ))}
          <Card tone="warning">
            <Text variant="small" tone="warning">
              Borrador: este texto debe ser revisado por asesoría legal antes de publicar la app.
            </Text>
          </Card>
        </View>
      </Screen>
    </View>
  );
}
