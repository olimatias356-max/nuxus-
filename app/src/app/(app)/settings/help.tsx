import { Linking, View } from 'react-native';
import { LifeBuoy, Mail } from 'lucide-react-native';

import { usePublicConfig } from '@/lib/api/config';
import { useMe } from '@/lib/auth';
import { Button, Card, colors, Header, Screen, space, Text } from '@/ui';

const FAQ = [
  { q: '¿Puedo ganar dinero siendo gratuito?', a: 'Sí. Generás ganancias por publicidad válida (70% para vos) y membresías (80%). Para retirarlas necesitás un plan Pro, identidad verificada y una cuenta bancaria a tu nombre.' },
  { q: '¿Pro me garantiza más vistas?', a: 'No. Pro da herramientas, retiro y una prioridad controlada. La distribución depende sobre todo de cómo rinde tu contenido.' },
  { q: '¿Cómo consigo la insignia azul?', a: 'Verificando tu identidad desde el Panel de creador. No se compra.' },
  { q: '¿Cuánto tarda un retiro?', a: 'Entre 1 y 3 días hábiles según el banco. Si el banco rechaza la transferencia, el saldo vuelve a disponible.' },
  { q: '¿Cómo cancelo Pro?', a: 'Desde Google Play o App Store (Suscripciones). Pro sigue activo hasta el final del período pagado.' },
  { q: 'Alguien me acosa, ¿qué hago?', a: 'Bloqueá la cuenta desde su perfil y reportala. Los reportes graves se revisan con prioridad.' },
];

export default function Help() {
  const { data: config } = usePublicConfig();
  const { profile } = useMe();
  const support = (config?.['app.support_email'] as string) ?? 'soporte@mbaretefans.com';
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Ayuda y contacto" />
      <Screen scroll>
        <View style={{ gap: space[4], paddingTop: space[2] }}>
          {FAQ.map((f) => (
            <Card key={f.q}>
              <Text variant="bodyStrong">{f.q}</Text>
              <Text variant="small" tone="muted" style={{ marginTop: space[1] }}>
                {f.a}
              </Text>
            </Card>
          ))}
          <Card tone="accent">
            <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
              <LifeBuoy size={22} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">¿Necesitás ayuda?</Text>
                <Text variant="small" tone="muted">
                  {support}
                </Text>
              </View>
            </View>
            <Button
              title="Escribir a soporte"
              icon={Mail}
              size="md"
              style={{ marginTop: space[3] }}
              onPress={() => Linking.openURL(`mailto:${support}?subject=${encodeURIComponent(`Ayuda · @${profile?.username ?? ''}`)}`)}
            />
          </Card>
        </View>
      </Screen>
    </View>
  );
}
