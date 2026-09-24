import { useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PostGrid } from '@/components/PostGrid';
import { SuggestedCreators } from '@/components/SuggestedCreators';
import { useCategories } from '@/lib/api/config';
import { useExplore } from '@/lib/api/posts';
import { useSearchProfiles } from '@/lib/api/social';
import { useMe } from '@/lib/auth';
import { formatCount } from '@/lib/format';
import { Avatar, colors, EmptyState, fonts, IconButton, Loading, radius, space, Text, VerifiedBadge } from '@/ui';
import { ChevronLeft, Compass, Search as SearchIcon, X } from '@/ui/icons';

export default function Search() {
  const { userId } = useMe();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setQ(text), 300);
    return () => clearTimeout(t);
  }, [text]);
  const results = useSearchProfiles(q);
  const explore = useExplore(category);
  const { data: categories } = useCategories();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 4 }]}>
      <View style={styles.bar}>
        <IconButton icon={ChevronLeft} label="Volver" onPress={() => router.back()} size={26} />
        <View style={styles.field}>
          <SearchIcon size={18} color={colors.textSubtle} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Buscar creadores"
            placeholderTextColor={colors.textSubtle}
            selectionColor={colors.accent}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Buscar creadores"
          />
          {text ? <IconButton icon={X} label="Borrar búsqueda" size={18} onPress={() => setText('')} /> : null}
        </View>
      </View>
      {!q.trim() ? (
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {[{ slug: null as string | null, name: 'Tendencias' }, ...(categories ?? [])].map((c) => {
              const on = category === c.slug;
              return (
                <Pressable key={c.slug ?? 'all'} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setCategory(c.slug)} style={[styles.chip, on && styles.chipOn]}>
                  <Text variant="smallStrong" tone={on ? 'onAccent' : 'default'}>
                    {c.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {!category ? <SuggestedCreators me={userId} /> : null}
          {explore.isLoading ? (
            <Loading />
          ) : explore.data?.length ? (
            <PostGrid posts={explore.data} />
          ) : (
            <EmptyState icon={Compass} title="Nada por acá todavía" text="Todavía no hay publicaciones recientes en esta categoría." />
          )}
          <View style={{ height: insets.bottom + space[6] }} />
        </ScrollView>
      ) : results.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={results.data ?? []}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<EmptyState icon={SearchIcon} title="Sin resultados" text={`No encontramos creadores para "${q}".`} />}
          renderItem={({ item }) => (
            <Pressable style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]} onPress={() => router.push({ pathname: '/u/[username]', params: { username: item.username } })} accessibilityRole="button">
              <Avatar path={item.avatar_path} name={item.display_name} size={48} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {item.display_name}
                  </Text>
                  {item.is_verified ? <VerifiedBadge size={14} /> : null}
                </View>
                <Text variant="small" tone="subtle">
                  @{item.username} · {formatCount(item.followers_count)} seguidores
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', paddingRight: space[4], paddingLeft: space[1], gap: space[1] },
  field: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[2], height: 44, borderRadius: radius.full, backgroundColor: colors.surface2, paddingLeft: 14 },
  input: { flex: 1, color: colors.text, fontFamily: fonts.medium, fontSize: 16 },
  chips: { gap: space[2], paddingHorizontal: space[4], paddingVertical: space[3] },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: radius.full, backgroundColor: colors.surface2, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3] },
});
