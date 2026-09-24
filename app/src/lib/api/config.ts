import { useQuery } from '@tanstack/react-query';

import { supabase } from '../supabase';
import type { Category } from '../types';

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').order('sort');
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });
}

export function usePublicConfig() {
  return useQuery({
    queryKey: ['config'],
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('app_config').select('key, value');
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value])) as Record<string, any>;
    },
  });
}

export async function deleteMyAccount(confirmation: string) {
  const { error } = await supabase.functions.invoke('delete-account', { body: { confirm: confirmation } });
  if (error) {
    let message = 'No pudimos eliminar la cuenta. Probá de nuevo o contactá a soporte.';
    try {
      const ctx = await (error as any).context?.json?.();
      if (ctx?.error) message = ctx.error;
    } catch {}
    throw new Error(message);
  }
}
