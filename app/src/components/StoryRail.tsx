import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Plus } from '@/ui/icons';

import { useStoryRail } from '@/lib/api/stories';
import type { Profile } from '@/lib/types';
import { Avatar, colors, space, Text } from '@/ui';

export function StoryRail({ me }: { me: Profile | null }) {
  const { data } = useStoryRail();
  const mine = data?.find((s) => s.author_id === me?.id);
  const others = (data ?? []).filter((s) => s.author_id !== me?.id);

  return (
    <FlatList
      horizontal
      data={others}
      keyExtractor={(s) => s.author_id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        me ? (
          <Pressable
            style={styles.item}
            accessibilityRole="button"
            accessibilityLabel={mine ? 'Ver tu historia' : 'Crear una historia'}
            onPress={() => (mine ? router.push({ pathname: '/story/[authorId]', params: { authorId: me.id } }) : router.push({ pathname: '/create', params: { mode: 'story' } }))}>
            <View>
              <Avatar path={me.avatar_path} name={me.display_name} size={68} ring={mine ? (mine.has_unseen ? 'unseen' : 'seen') : 'none'} />
              {!mine ? (
                <View style={styles.plus}>
                  <Plus size={14} color={colors.onAccent} strokeWidth={3} />
                </View>
              ) : null}
            </View>
            <Text variant="caption" tone="muted" numberOfLines={1} style={styles.label}>
              Tu historia
            </Text>
          </Pressable>
        ) : null
      }
      renderItem={({ item }) => (
        <Pressable
          style={styles.item}
          accessibilityRole="button"
          accessibilityLabel={`Historia de ${item.username}${item.has_unseen ? ', nueva' : ''}`}
          onPress={() => router.push({ pathname: '/story/[authorId]', params: { authorId: item.author_id } })}>
          <Avatar path={item.avatar_path} name={item.display_name} size={68} ring={item.has_unseen ? 'unseen' : 'seen'} />
          <Text variant="caption" tone={item.has_unseen ? 'default' : 'subtle'} numberOfLines={1} style={styles.label}>
            {item.username}
          </Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space[3], paddingVertical: space[2], gap: space[3] },
  item: { width: 72, alignItems: 'center', gap: 6 },
  label: { maxWidth: 72 },
  plus: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
