import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { useAppeal } from '@/lib/api/social';
import { errorMessage } from '@/lib/errors';
import { Button, colors, Header, Input, Screen, space, Text, useToast } from '@/ui';

const LABEL: Record<string, string> = {
  post: 'la decisión sobre tu publicación',
  story: 'la decisión sobre tu historia',
  comment: 'la decisión sobre tu comentario',
  account: 'una decisión sobre tu cuenta',
  kyc: 'la decisión sobre tu verificación',
  strike: 'un strike',
};

export default function Appeal() {
  const { type = 'account', id } = useLocalSearchParams<{ type?: string; id?: string }>();
  const [message, setMessage] = useState('');
  const appeal = useAppeal();
  const toast = useToast();

  const submit = () => {
    if (message.trim().length < 10) return toast('Contanos un poco más (mínimo 10 caracteres).', 'error');
    appeal.mutate(
      { target_type: type, target_id: id || null, message },
      {
        onSuccess: () => {
          toast('Apelación enviada. Una persona la va a revisar.');
          router.back();
        },
        onError: (e) => toast(errorMessage(e), 'error'),
      },
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Apelar" />
      <Screen scroll keyboard footer={<Button title="Enviar apelación" onPress={submit} loading={appeal.isPending} />}>
        <View style={{ gap: space[4], paddingTop: space[2] }}>
          <Text variant="body" tone="muted">
            Vas a apelar {LABEL[type] ?? 'una decisión'}. Explicá por qué creés que fue un error; lo revisa una persona del equipo.
          </Text>
          <Input label="Tu mensaje" value={message} onChangeText={setMessage} multiline maxLength={1000} hint={`${message.length}/1000`} />
        </View>
      </Screen>
    </View>
  );
}
