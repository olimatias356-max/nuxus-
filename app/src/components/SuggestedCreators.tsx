import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { useIsFollowing, useSuggestedCreators, useToggleFollow } from '@/lib/api/social';
import { formatCount } from '@/lib/format';
import { Avatar, Button, colors, radius, space, Text, VerifiedBadge } from '@/ui';

export function SuggestedCreators({ me }: { me: string }) {
  const { data } = useSuggestedCreators(me);
  if (!data?.length) return null;
  return (
    <View style={{ gap: space[3], paddingVertical: space[4] }}>
      <Text variant="subheading" style={{ paddingHorizontal: space[4] }}>
        Creadores para seguir
      </Text>
      <FlatList
        horizontal
        data={data}
        keyExtractor={(p) => p.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space[4], gap: space[3] }}
        renderItem={({ item }) => <CreatorCard me={me} creator={item} />}
      />
    </View>
  );
}

function CreatorCard({ me, creator }: { me: string; creator: { id: string; username: string; display_name: string; avatar_path: string | null; is_verified: boolean; followers_count: number } }) {
  const { data: following } = useIsFollowing(me, creator.id);
  const follow = useToggleFollow();
  return (
    <Pressable style={styles.card} onPress={() => router.push({ pathname: '/u/[username]', params: { username: creator.username } })} accessibilityRole="button" accessibilityLabel={`Perfil de ${creator.display_name}`}>
      <Avatar path={creator.avatar_path} name={creator.username} size={64} />
      <View style={styles.name}>
        <Text variant="smallStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
          {creator.display_name}
        </Text>
        {creator.is_verified ? <VerifiedBadge size={13} /> : null}
      </View>
      <Text variant="caption" tone="subtle">
        {formatCount(creator.followers_count)} seguidores
      </Text>
      <Button
        title={following ? 'Siguiendo' : 'Seguir'}
        size="sm"
        variant={following ? 'secondary' : 'primary'}
        onPress={() => follow.mutate({ me, target: creator.id, following: !!following })}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 150, alignItems: 'center', gap: 6, padding: space[3], borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  name: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
});
