import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, useWindowDimensions, View, type ViewToken } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Compass, MessageCircle, Search } from '@/ui/icons';

import { PostCard } from '@/components/PostCard';
import { StoryRail } from '@/components/StoryRail';
import { SuggestedCreators } from '@/components/SuggestedCreators';
import { usePostActions } from '@/components/usePostActions';
import { useBadges } from '@/lib/api/activity';
import { useInterests } from '@/lib/api/config';
import { useFeed, type FeedMode } from '@/lib/api/posts';
import { useMe } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { onboardingKey } from '@/lib/onboarding';
import { secureStorage } from '@/lib/secure-storage';
import type { FeedItem } from '@/lib/types';
import { colors, EmptyState, ErrorState, IconButton, Loading, Segmented, Skeleton, space, Wordmark } from '@/ui';

export default function Home() {
  const { userId, profile } = useMe();
  const [mode, setMode] = useState<Exclude<FeedMode, 'reels'>>('for_you');
  const feed = useFeed(mode);
  const { data: badges } = useBadges(true);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const actions = usePostActions(userId);
  const [activeId, setActiveId] = useState<string | null>(null);

  const items = useMemo(() => feed.data?.pages.flat() ?? [], [feed.data]);
  const interests = useInterests();

  // First visit: choose interests (once per account and device).
  useEffect(() => {
    if (!interests.data || interests.data.length > 0) return;
    let alive = true;
    secureStorage.getItem(onboardingKey(userId)).then((done) => {
      if (alive && done !== '1') router.push('/onboarding');
    });
    return () => {
      alive = false;
    };
  }, [interests.data, userId]);

  // must keep a stable identity: FlatList does not allow changing it on the fly
  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken<FeedItem>[] }) => {
    const first = viewableItems.find((v) => v.isViewable);
    setActiveId(first?.item?.id ?? null);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => <PostCard post={item} me={userId} active={item.id === activeId} width={width} onMore={actions.open} />,
    [userId, activeId, width, actions.open],
  );

  const header = (
    <View>
      <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
        <Wordmark size={19} />
        <View style={styles.topActions}>
          <IconButton icon={Search} label="Buscar" onPress={() => router.push('/search')} />
          <IconButton icon={MessageCircle} label="Mensajes" badge={badges?.unread_messages} onPress={() => router.push('/messages')} />
        </View>
      </View>
      <StoryRail me={profile} />
      <View style={styles.segment}>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'for_you', label: 'Para vos' },
            { value: 'following', label: 'Siguiendo' },
          ]}
        />
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <FlatList
        data={items}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={
          feed.isLoading ? (
            <View style={{ padding: space[4], gap: space[4] }}>
              <Skeleton height={44} />
              <Skeleton height={width * 0.9} />
              <Skeleton height={20} width="60%" />
            </View>
          ) : feed.isError ? (
            <ErrorState message={errorMessage(feed.error)} onRetry={() => feed.refetch()} />
          ) : mode === 'following' ? (
            <View>
              <EmptyState icon={Compass} title="Todavía no seguís a nadie" text="Seguí creadores para ver sus publicaciones acá." />
              <SuggestedCreators me={userId} />
            </View>
          ) : (
            <View>
              <EmptyState icon={Compass} title="Todavía no hay publicaciones" text="Sé de los primeros en publicar: tocá el botón + de abajo." action="Crear publicación" onAction={() => router.push('/create')} />
              <SuggestedCreators me={userId} />
            </View>
          )
        }
        ListFooterComponent={feed.isFetchingNextPage ? <Loading /> : <View style={{ height: space[6] }} />}
        onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()}
        onEndReachedThreshold={0.6}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60, minimumViewTime: 150 }}
        refreshControl={<RefreshControl refreshing={feed.isRefetching && !feed.isFetchingNextPage} onRefresh={() => feed.refetch()} tintColor={colors.accent} colors={[colors.accent]} />}
        windowSize={7}
        initialNumToRender={3}
        maxToRenderPerBatch={4}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
      />
      {actions.sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[4], paddingBottom: space[1] },
  topActions: { flexDirection: 'row', alignItems: 'center' },
  segment: { paddingHorizontal: space[4], paddingTop: space[1], paddingBottom: space[3] },
});
