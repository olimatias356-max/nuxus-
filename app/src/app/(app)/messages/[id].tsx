import { useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ellipsis, Flag, SendHorizontal, ShieldAlert, User } from '@/ui/icons';

import { markConversationRead, useInbox, useMessages, useSendMessage } from '@/lib/api/activity';
import { useMe } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Message, MiniProfile } from '@/lib/types';
import { ActionSheet, Avatar, colors, fonts, Header, IconButton, Loading, radius, space, Text, useToast, VerifiedBadge } from '@/ui';

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useMe();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const messages = useMessages(id);
  const send = useSendMessage();
  const { data: inbox } = useInbox();
  const [text, setText] = useState('');
  const convo = inbox?.find((c) => c.conversation_id === id);

  const other = useQuery({
    queryKey: ['conversation-other', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversation_members')
        .select('user_id, profile:profiles!conversation_members_user_id_fkey(id, username, display_name, avatar_path, is_verified)')
        .eq('conversation_id', id)
        .neq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return (data?.profile ?? null) as unknown as MiniProfile | null;
    },
  });

  const count = messages.data?.length ?? 0;
  useEffect(() => {
    if (id) markConversationRead(id).catch(() => {});
  }, [id, count]);

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    send.mutate(
      { conversationId: id, body },
      {
        onError: (e) => {
          setText(body);
          toast(errorMessage(e), 'error');
        },
      },
    );
  };

  const p = other.data;
  const canMessage = convo?.can_message ?? true;

  const [menu, setMenu] = useState(false);

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header
        title={p?.display_name ?? 'Conversación'}
        subtitle={p ? `@${p.username}` : undefined}
        right={<IconButton icon={Ellipsis} label="Opciones" onPress={() => p && setMenu(true)} />}
      />
      {messages.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          inverted
          data={messages.data ?? []}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: space[4], gap: 6 }}
          renderItem={({ item, index }) => <Bubble m={item} mine={item.sender_id === userId} next={messages.data?.[index + 1]} />}
          ListFooterComponent={
            p ? (
              <View style={styles.intro}>
                <Avatar path={p.avatar_path} name={p.username} size={72} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Text variant="subheading">{p.display_name}</Text>
                  {p.is_verified ? <VerifiedBadge size={16} /> : null}
                </View>
                <Text variant="small" tone="subtle" align="center">
                  Los mensajes son privados entre ustedes dos. Nunca compartas contraseñas ni códigos.
                </Text>
              </View>
            ) : null
          }
        />
      )}
      {canMessage ? (
        <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space[3]) }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Escribí un mensaje…"
            placeholderTextColor={colors.textSubtle}
            selectionColor={colors.accent}
            style={styles.input}
            multiline
            maxLength={2000}
            accessibilityLabel="Mensaje"
          />
          <Pressable
            onPress={submit}
            disabled={!text.trim()}
            accessibilityRole="button"
            accessibilityLabel="Enviar mensaje"
            style={({ pressed }) => [styles.send, (!text.trim() || pressed) && { opacity: 0.5 }]}>
            <SendHorizontal size={20} color={colors.onAccent} strokeWidth={2.4} />
          </Pressable>
        </View>
      ) : (
        <View style={[styles.blocked, { paddingBottom: Math.max(insets.bottom, space[4]) }]}>
          <ShieldAlert size={18} color={colors.textSubtle} />
          <Text variant="small" tone="subtle" style={{ flex: 1 }}>
            No podés responder en esta conversación.
          </Text>
        </View>
      )}
      <ActionSheet
        visible={menu}
        title={p ? `@${p.username}` : undefined}
        onClose={() => setMenu(false)}
        actions={
          p
            ? [
                { label: 'Ver perfil', icon: User, onPress: () => router.push({ pathname: '/u/[username]', params: { username: p.username } }) },
                { label: 'Reportar conversación', icon: Flag, danger: true, onPress: () => router.push({ pathname: '/report', params: { type: 'user', id: p.id, name: p.username } }) },
              ]
            : []
        }
      />
    </KeyboardAvoidingView>
  );
}

function Bubble({ m, mine, next }: { m: Message; mine: boolean; next?: Message }) {
  const showDate = !next || new Date(next.created_at).toDateString() !== new Date(m.created_at).toDateString();
  const time = new Date(m.created_at);
  return (
    <View>
      {showDate ? (
        <Text variant="caption" tone="subtle" align="center" style={{ marginVertical: space[3] }}>
          {formatDate(m.created_at)}
        </Text>
      ) : null}
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
        <Text variant="body" tone={mine ? 'onAccent' : 'default'}>
          {m.body}
        </Text>
        <Text variant="caption" style={{ color: mine ? 'rgba(10,10,15,0.55)' : colors.textSubtle, alignSelf: 'flex-end', fontSize: 10 }}>
          {time.getHours().toString().padStart(2, '0')}:{time.getMinutes().toString().padStart(2, '0')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  intro: { alignItems: 'center', gap: space[2], paddingVertical: space[6], paddingHorizontal: space[6] },
  bubble: { maxWidth: '80%', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, gap: 2 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.accent, borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface2, borderBottomLeftRadius: 6 },
  bar: { flexDirection: 'row', alignItems: 'flex-end', gap: space[2], paddingHorizontal: space[3], paddingTop: space[2], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  input: { flex: 1, minHeight: 44, maxHeight: 130, borderRadius: radius.lg, backgroundColor: colors.surface2, paddingHorizontal: 16, paddingVertical: 11, color: colors.text, fontFamily: fonts.medium, fontSize: 15 },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  blocked: { flexDirection: 'row', alignItems: 'center', gap: space[2], padding: space[4], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
