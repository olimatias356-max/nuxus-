import { useInfiniteQuery, useMutation, useQuery, type InfiniteData } from '@tanstack/react-query';

import { makeVideoCover, objectPath, removeFiles, uploadFile, type PickedMedia } from '../media';
import { queryClient } from '../query';
import { supabase } from '../supabase';
import type { FeedItem } from '../types';

export type FeedMode = 'for_you' | 'following' | 'reels';
const PAGE = 12;

export function useFeed(mode: FeedMode) {
  return useInfiniteQuery({
    queryKey: ['feed', mode],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('get_feed', { p_mode: mode, p_limit: PAGE, p_offset: pageParam });
      if (error) throw error;
      return (data ?? []) as FeedItem[];
    },
    getNextPageParam: (last, all) => (last.length < PAGE ? undefined : all.length * PAGE),
    select: (data) => {
      // offsets over a ranked feed can repeat items between pages: dedupe
      const seen = new Set<string>();
      return {
        ...data,
        pages: data.pages.map((page) => page.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))),
      };
    },
  });
}

export function useUserPosts(authorId: string | undefined) {
  return useQuery({
    queryKey: ['posts', 'author', authorId],
    enabled: !!authorId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_posts', { p_author: authorId, p_limit: 60 });
      if (error) throw error;
      return (data ?? []) as FeedItem[];
    },
  });
}

export function useSavedPosts(enabled = true) {
  return useQuery({
    queryKey: ['posts', 'saved'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_posts', { p_saved: true, p_limit: 60 });
      if (error) throw error;
      return (data ?? []) as FeedItem[];
    },
  });
}

export function usePost(id: string | undefined) {
  return useQuery({
    queryKey: ['posts', 'one', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_posts', { p_post: id, p_limit: 1 });
      if (error) throw error;
      return ((data ?? []) as FeedItem[])[0] ?? null;
    },
  });
}

/** Applies a patch to a post in every cached list (feeds, grids, detail). */
export function patchPost(id: string, patch: (p: FeedItem) => FeedItem) {
  queryClient.setQueriesData<InfiniteData<FeedItem[]>>({ queryKey: ['feed'] }, (old) =>
    old ? { ...old, pages: old.pages.map((page) => page.map((p) => (p.id === id ? patch(p) : p))) } : old,
  );
  queryClient.setQueriesData<FeedItem[] | FeedItem | null>({ queryKey: ['posts'] }, (old) => {
    if (!old) return old;
    if (Array.isArray(old)) return old.map((p) => (p.id === id ? patch(p) : p));
    return old.id === id ? patch(old) : old;
  });
}

export function removePostFromCache(id: string) {
  queryClient.setQueriesData<InfiniteData<FeedItem[]>>({ queryKey: ['feed'] }, (old) =>
    old ? { ...old, pages: old.pages.map((page) => page.filter((p) => p.id !== id)) } : old,
  );
  queryClient.setQueriesData<FeedItem[] | FeedItem | null>({ queryKey: ['posts'] }, (old) => {
    if (!old) return old;
    if (Array.isArray(old)) return old.filter((p) => p.id !== id);
    return old.id === id ? null : old;
  });
}

/** Hides every post of an author (after blocking). */
export function removeAuthorFromCache(authorId: string) {
  queryClient.setQueriesData<InfiniteData<FeedItem[]>>({ queryKey: ['feed'] }, (old) =>
    old ? { ...old, pages: old.pages.map((page) => page.filter((p) => p.author_id !== authorId)) } : old,
  );
}

export function useToggleLike() {
  return useMutation({
    mutationFn: async ({ post, userId }: { post: FeedItem; userId: string }) => {
      const { error } = post.liked
        ? await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', userId)
        : await supabase.from('likes').insert({ post_id: post.id });
      if (error && error.code !== '23505') throw error;
    },
    onMutate: ({ post }) => {
      patchPost(post.id, (p) => ({ ...p, liked: !post.liked, like_count: Math.max(0, p.like_count + (post.liked ? -1 : 1)) }));
    },
    onError: (_e, { post }) => {
      patchPost(post.id, (p) => ({ ...p, liked: post.liked, like_count: post.like_count }));
    },
  });
}

export function useToggleSave() {
  return useMutation({
    mutationFn: async ({ post, userId }: { post: FeedItem; userId: string }) => {
      const { error } = post.saved
        ? await supabase.from('saves').delete().eq('post_id', post.id).eq('user_id', userId)
        : await supabase.from('saves').insert({ post_id: post.id });
      if (error && error.code !== '23505') throw error;
    },
    onMutate: ({ post }) => patchPost(post.id, (p) => ({ ...p, saved: !post.saved })),
    onError: (_e, { post }) => patchPost(post.id, (p) => ({ ...p, saved: post.saved })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['posts', 'saved'] }),
  });
}

export type NewPost = { media: PickedMedia; caption: string; category: string | null };

export function useCreatePost() {
  return useMutation({
    mutationFn: async ({ input, userId, onProgress }: { input: NewPost; userId: string; onProgress?: (f: number) => void }) => {
      const { media } = input;
      const uploaded: string[] = [];
      try {
        let thumbPath: string | null = null;
        if (media.kind === 'video') {
          const cover = await makeVideoCover(media);
          thumbPath = await uploadFile('media', objectPath(userId, cover.mimeType), cover);
          uploaded.push(thumbPath);
        }
        const mediaPath = await uploadFile('media', objectPath(userId, media.mimeType), media, (f) => onProgress?.(f * 0.95));
        uploaded.push(mediaPath);
        const { data, error } = await supabase
          .from('posts')
          .insert({
            kind: media.kind,
            media_path: mediaPath,
            thumb_path: thumbPath,
            width: Math.round(media.width) || null,
            height: Math.round(media.height) || null,
            duration_ms: media.durationMs ? Math.round(media.durationMs) : null,
            caption: input.caption.trim(),
            category: input.category,
          })
          .select('id')
          .single();
        if (error) throw error;
        onProgress?.(1);
        return data.id as string;
      } catch (e) {
        await removeFiles('media', uploaded).catch(() => {});
        throw e;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['posts', 'author'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

export function useDeletePost() {
  return useMutation({
    mutationFn: async (post: Pick<FeedItem, 'id' | 'media_path' | 'thumb_path'>) => {
      const { error } = await supabase.from('posts').delete().eq('id', post.id);
      if (error) throw error;
      await removeFiles('media', [post.media_path, post.thumb_path ?? '']).catch(() => {});
    },
    onSuccess: (_d, post) => {
      removePostFromCache(post.id);
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

export function useUpdateCaption() {
  return useMutation({
    mutationFn: async ({ id, caption }: { id: string; caption: string }) => {
      const { error } = await supabase.from('posts').update({ caption: caption.trim() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, { id, caption }) => patchPost(id, (p) => ({ ...p, caption: caption.trim() })),
  });
}

const tracked = new Set<string>();
/** Records a view for the ranking (once per session per post). */
export function trackView(postId: string, watchedMs = 0, completed = false) {
  const key = `${postId}:${completed ? 'c' : 'v'}`;
  if (tracked.has(key)) return;
  tracked.add(key);
  supabase.rpc('track_view', { p_post: postId, p_watched_ms: Math.round(watchedMs), p_completed: completed }).then(
    () => {},
    () => tracked.delete(key),
  );
}

export function useExplore(category: string | null) {
  return useQuery({
    queryKey: ['posts', 'explore', category],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_explore', { p_category: category, p_limit: 45 });
      if (error) throw error;
      return (data ?? []) as FeedItem[];
    },
  });
}
