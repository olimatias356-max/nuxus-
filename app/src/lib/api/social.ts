import { useMutation, useQuery } from '@tanstack/react-query';

import { queryClient } from '../query';
import { supabase } from '../supabase';
import type { Comment, MiniProfile, Profile } from '../types';
import { patchPost, removeAuthorFromCache } from './posts';

const MINI = 'id, username, display_name, avatar_path, is_verified';

export function useProfile(username: string | undefined) {
  return useQuery({
    queryKey: ['profile', 'by-username', username],
    enabled: !!username,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('username', username!.toLowerCase()).maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
  });
}

export function useIsFollowing(me: string, target: string | undefined) {
  return useQuery({
    queryKey: ['following', target],
    enabled: !!target && target !== me,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('follows')
        .select('followee_id', { count: 'exact', head: true })
        .eq('follower_id', me)
        .eq('followee_id', target!);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  });
}

export function useToggleFollow() {
  return useMutation({
    mutationFn: async ({ me, target, following }: { me: string; target: string; following: boolean }) => {
      const { error } = following
        ? await supabase.from('follows').delete().eq('follower_id', me).eq('followee_id', target)
        : await supabase.from('follows').insert({ followee_id: target });
      if (error && error.code !== '23505') throw error;
    },
    onMutate: ({ target, following }) => {
      queryClient.setQueryData(['following', target], !following);
      queryClient.setQueriesData<Profile | null>({ queryKey: ['profile', 'by-username'] }, (p) =>
        p && p.id === target ? { ...p, followers_count: Math.max(0, p.followers_count + (following ? -1 : 1)) } : p,
      );
    },
    onError: (_e, { target, following }) => queryClient.setQueryData(['following', target], following),
    onSettled: (_d, _e, { target, following }) => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['stories'] });
      // keep "Siguiendo" buttons in feeds consistent
      queryClient.getQueriesData<any>({ queryKey: ['feed'] }).forEach(([, data]) => {
        data?.pages?.flat().forEach((p: any) => p.author_id === target && patchPost(p.id, (x) => ({ ...x, following: !following })));
      });
    },
  });
}

export function useSearchProfiles(q: string) {
  const query = q.trim();
  return useQuery({
    queryKey: ['search', query],
    enabled: query.length >= 1,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_profiles', { p_query: query, p_limit: 25 });
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });
}

export function useSuggestedCreators(me: string) {
  return useQuery({
    queryKey: ['suggested'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(MINI + ', followers_count, bio')
        .neq('id', me)
        .eq('status', 'active')
        .order('followers_count', { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as unknown as (MiniProfile & { followers_count: number; bio: string })[];
    },
  });
}

export function useUpdateProfile() {
  return useMutation({
    mutationFn: async (patch: Partial<Pick<Profile, 'display_name' | 'bio' | 'avatar_path' | 'country'>> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase.from('profiles').update(rest).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
  });
}

// comments --------------------------------------------------------------------
export function useComments(postId: string | undefined) {
  return useQuery({
    queryKey: ['comments', postId],
    enabled: !!postId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comments')
        .select(`id, post_id, author_id, body, created_at, author:profiles!comments_author_id_fkey(${MINI})`)
        .eq('post_id', postId!)
        .eq('status', 'published')
        .order('created_at', { ascending: true })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as Comment[];
    },
  });
}

export function useAddComment() {
  return useMutation({
    mutationFn: async ({ postId, body }: { postId: string; body: string }) => {
      const { error } = await supabase.from('comments').insert({ post_id: postId, body: body.trim() });
      if (error) throw error;
    },
    onSuccess: (_d, { postId }) => {
      queryClient.invalidateQueries({ queryKey: ['comments', postId] });
      patchPost(postId, (p) => ({ ...p, comment_count: p.comment_count + 1 }));
    },
  });
}

export function useDeleteComment() {
  return useMutation({
    mutationFn: async ({ id }: { id: string; postId: string }) => {
      const { error } = await supabase.from('comments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, { postId }) => {
      queryClient.invalidateQueries({ queryKey: ['comments', postId] });
      patchPost(postId, (p) => ({ ...p, comment_count: Math.max(0, p.comment_count - 1) }));
    },
  });
}

// blocks & reports ----------------------------------------------------------------
export type BlockedUser = { user_id: string; username: string; display_name: string; avatar_path: string | null; blocked_at: string };

export function useBlocks() {
  return useQuery({
    queryKey: ['blocks'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_blocks');
      if (error) throw error;
      return (data ?? []) as BlockedUser[];
    },
  });
}

export function useBlockUser() {
  return useMutation({
    mutationFn: async ({ target }: { target: string }) => {
      const { error } = await supabase.from('blocks').insert({ blocked_id: target });
      if (error && error.code !== '23505') throw error;
    },
    onSuccess: (_d, { target }) => {
      removeAuthorFromCache(target);
      queryClient.invalidateQueries({ queryKey: ['blocks'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['stories'] });
      queryClient.invalidateQueries({ queryKey: ['inbox'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

export function useUnblockUser() {
  return useMutation({
    mutationFn: async ({ me, target }: { me: string; target: string }) => {
      const { error } = await supabase.from('blocks').delete().eq('blocker_id', me).eq('blocked_id', target);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blocks'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export type ReportTarget = 'post' | 'comment' | 'user' | 'message' | 'story';
export type ReportReason =
  | 'sexual' | 'minors' | 'violence' | 'harassment' | 'hate' | 'self_harm' | 'impersonation' | 'copyright' | 'spam' | 'other';

export function useReport() {
  return useMutation({
    mutationFn: async (input: { target_type: ReportTarget; target_id: string; reason: ReportReason; details?: string }) => {
      const { error } = await supabase.from('reports').insert({ ...input, details: input.details?.trim() ?? '' });
      if (error && error.code !== '23505') throw error; // already reported = fine
    },
  });
}

export function useAppeal() {
  return useMutation({
    mutationFn: async (input: { target_type: string; target_id: string | null; message: string }) => {
      const { error } = await supabase.from('appeals').insert({ ...input, message: input.message.trim() });
      if (error) throw error;
    },
  });
}
