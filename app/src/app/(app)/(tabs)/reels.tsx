import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View, type LayoutChangeEvent, type ViewToken } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clapperboard, Search } from '@/ui/icons';

import { ReelItem } from '@/components/ReelItem';
import { usePostActions } from '@/components/usePostActions';
import { useFeed } from '@/lib/api/posts';
import { useMe } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import type { FeedItem } from '@/lib/types';
import { EmptyState, ErrorState, IconButton, Loading, space, Text } from '@/ui';

export default function Reels() {
  const { userId } = useMe();
  const feed = useFeed('reels');
  const insets = useSafeAreaInsets();
  const actions = usePostActions(userId);
  const [height, setHeight] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [focused, setFocused] = useState(true);
  const items = useMemo(() => feed.data?.pages.flat() ?? [], [feed.data]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken<FeedItem>[] }) => {
    setActiveId(viewableItems.find((v) => v.isViewable)?.item?.id ?? null);
  }, []);

  const onLayout = (e: LayoutChangeEvent) => setHeight(Math.round(e.nativeEvent.layout.height));

  return (
    <View style={styles.root} onLayout={onLayout}>
      {height > 0 && items.length > 0 ? (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <ReelItem post={item} me={userId} active={focused && item.id === (activeId ?? items[0]?.id)} height={height} bottomInset={0} onMore={actions.open} />
          )}
          pagingEnabled
          snapToInterval={height}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 70 }}
          onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()}
          onEndReachedThreshold={2}
          windowSize={3}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          removeClippedSubviews
          showsVerticalScrollIndicator={false}
        />
      ) : feed.isLoading ? (
        <Loading />
      ) : feed.isError ? (
        <ErrorState message={errorMessage(feed.error)} onRetry={() => feed.refetch()} />
      ) : height > 0 ? (
        <EmptyState icon={Clapperboard} title="Todavía no hay reels" text="Subí el primer video vertical y aparecé acá." action="Subir un video" onAction={() => router.push({ pathname: '/create', params: { mode: 'video' } })} />
      ) : null}

      <View style={[styles.top, { paddingTop: insets.top + 4 }]} pointerEvents="box-none">
        <Text variant="subheading" tone="white">
          Reels
        </Text>
        <IconButton icon={Search} label="Buscar" color="#fff" onPress={() => router.push('/search')} />
      </View>
      {actions.sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[4] },
});
