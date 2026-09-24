import { useMutation, useQuery } from '@tanstack/react-query';

import { objectPath, removeFiles, uploadFile, type PickedMedia } from '../media';
import { queryClient } from '../query';
import { supabase } from '../supabase';
import type { Story, StoryRailItem } from '../types';

export function useStoryRail() {
  return useQuery({
    queryKey: ['stories', 'rail'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_story_rail');
      if (error) throw error;
      return (data ?? []) as StoryRailItem[];
    },
  });
}

export function useStories(authorId: string | undefined) {
  return useQuery({
    queryKey: ['stories', 'author', authorId],
    enabled: !!authorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stories')
        .select('id, author_id, kind, media_path, caption, duration_ms, created_at, expires_at')
        .eq('author_id', authorId!)
        .eq('status', 'published')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Story[];
    },
  });
}

export async function markStoryViewed(storyId: string) {
  await supabase.from('story_views').upsert({ story_id: storyId }, { onConflict: 'story_id,viewer_id', ignoreDuplicates: true });
}

export function useCreateStory() {
  return useMutation({
    mutationFn: async ({ media, caption, userId, onProgress }: { media: PickedMedia; caption: string; userId: string; onProgress?: (f: number) => void }) => {
      const path = await uploadFile('media', objectPath(userId, media.mimeType), media, onProgress);
      const { error } = await supabase.from('stories').insert({
        kind: media.kind,
        media_path: path,
        caption: caption.trim(),
        duration_ms: media.durationMs ? Math.round(media.durationMs) : null,
      });
      if (error) {
        await removeFiles('media', [path]).catch(() => {});
        throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stories'] }),
  });
}

export function useDeleteStory() {
  return useMutation({
    mutationFn: async (story: Pick<Story, 'id' | 'media_path'>) => {
      const { error } = await supabase.from('stories').delete().eq('id', story.id);
      if (error) throw error;
      await removeFiles('media', [story.media_path]).catch(() => {});
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stories'] }),
  });
}
