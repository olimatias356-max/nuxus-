import { useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import { queryClient } from '../query';
import { supabase } from '../supabase';
import type { AppNotification, InboxItem, Message } from '../types';

const MINI = 'id, username, display_name, avatar_path, is_verified';

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select(`id, type, body, post_id, data, read_at, created_at, actor:profiles!notifications_actor_id_fkey(${MINI})`)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as AppNotification[];
    },
  });
}

export function useMarkNotificationsRead() {
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('mark_notifications_read');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['badges'] });
      queryClient.setQueryData<AppNotification[]>(['notifications'], (old) =>
        old?.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })),
      );
    },
  });
}

export function useBadges(enabled: boolean) {
  return useQuery({
    queryKey: ['badges'],
    enabled,
    refetchInterval: 45_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_badges');
      if (error) throw error;
      const row = (data ?? [])[0] ?? { unread_notifications: 0, unread_messages: 0 };
      return row as { unread_notifications: number; unread_messages: number };
    },
  });
}

/** Live updates for badges, inbox and notifications (RLS applies to Realtime). */
export function useRealtimeActivity(userId: string | null) {
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`activity:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        queryClient.invalidateQueries({ queryKey: ['badges'] });
        queryClient.invalidateQueries({ queryKey: ['monetization'] });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as Message;
        queryClient.setQueryData<Message[]>(['messages', msg.conversation_id], (old) =>
          old && !old.some((m) => m.id === msg.id) ? [msg, ...old] : old,
        );
        queryClient.invalidateQueries({ queryKey: ['inbox'] });
        queryClient.invalidateQueries({ queryKey: ['badges'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);
}

// messages --------------------------------------------------------------------
export function useInbox() {
  return useQuery({
    queryKey: ['inbox'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_inbox');
      if (error) throw error;
      return (data ?? []) as InboxItem[];
    },
  });
}

export function useMessages(conversationId: string | undefined) {
  return useQuery({
    queryKey: ['messages', conversationId],
    enabled: !!conversationId,
    refetchInterval: 15_000, // fallback when Realtime is unavailable
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, conversation_id, sender_id, body, created_at')
        .eq('conversation_id', conversationId!)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });
}

export function useSendMessage() {
  return useMutation({
    mutationFn: async ({ conversationId, body }: { conversationId: string; body: string }) => {
      const { data, error } = await supabase
        .from('messages')
        .insert({ conversation_id: conversationId, body: body.trim() })
        .select('id, conversation_id, sender_id, body, created_at')
        .single();
      if (error) throw error;
      return data as Message;
    },
    onSuccess: (msg) => {
      queryClient.setQueryData<Message[]>(['messages', msg.conversation_id], (old) =>
        old ? (old.some((m) => m.id === msg.id) ? old : [msg, ...old]) : [msg],
      );
      queryClient.invalidateQueries({ queryKey: ['inbox'] });
    },
  });
}

export async function startConversation(otherId: string): Promise<string> {
  const { data, error } = await supabase.rpc('start_conversation', { p_other: otherId });
  if (error) throw error;
  return data as string;
}

export async function markConversationRead(conversationId: string) {
  await supabase.rpc('mark_conversation_read', { p_conversation: conversationId });
  queryClient.invalidateQueries({ queryKey: ['badges'] });
  queryClient.setQueryData<InboxItem[]>(['inbox'], (old) =>
    old?.map((c) => (c.conversation_id === conversationId ? { ...c, unread_count: 0 } : c)),
  );
}
