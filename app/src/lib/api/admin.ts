import { useMutation, useQuery } from '@tanstack/react-query';

import { queryClient } from '../query';
import { supabase } from '../supabase';
import type { AdminKyc, AdminReport, AdminRole, Appeal } from '../types';

export function useAdminRoles(enabled: boolean) {
  return useQuery({
    queryKey: ['admin-roles'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_admin_roles');
      if (error) throw error;
      return (data ?? []) as AdminRole[];
    },
  });
}

export const hasRole = (roles: AdminRole[] | undefined, role: AdminRole) => !!roles?.some((r) => r === role || r === 'SUPER_ADMIN');

export function useAdminReports() {
  return useQuery({
    queryKey: ['admin', 'reports'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_list_reports', { p_limit: 100 });
      if (error) throw error;
      return (data ?? []) as AdminReport[];
    },
  });
}

export function useResolveReport() {
  return useMutation({
    mutationFn: async (input: { targetType: string; targetId: string; action: 'dismiss' | 'remove' | 'restore' | 'suspend_user'; note?: string }) => {
      const { error } = await supabase.rpc('admin_resolve_report', {
        p_target_type: input.targetType,
        p_target_id: input.targetId,
        p_action: input.action,
        p_note: input.note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export function useAdminKyc() {
  return useQuery({
    queryKey: ['admin', 'kyc'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_list_kyc');
      if (error) throw error;
      return (data ?? []) as AdminKyc[];
    },
  });
}

export async function kycDocumentUrl(path: string) {
  const { data, error } = await supabase.storage.from('kyc').createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

export function useReviewKyc() {
  return useMutation({
    mutationFn: async (input: { userId: string; decision: 'approve' | 'reject' | 'suspend'; reason?: string }) => {
      const { error } = await supabase.rpc('admin_review_kyc', {
        p_user: input.userId,
        p_decision: input.decision,
        p_reason: input.reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export function useAdminAppeals() {
  return useQuery({
    queryKey: ['admin', 'appeals'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_list_appeals');
      if (error) throw error;
      return (data ?? []) as Appeal[];
    },
  });
}

export function useResolveAppeal() {
  return useMutation({
    mutationFn: async (input: { id: string; accept: boolean; note: string }) => {
      const { error } = await supabase.rpc('admin_resolve_appeal', { p_appeal: input.id, p_accept: input.accept, p_note: input.note });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export function useCreditEarnings() {
  return useMutation({
    mutationFn: async (input: { username: string; source: 'ads' | 'membership'; gross: number; reference: string }) => {
      const { error } = await supabase.rpc('admin_credit_earnings', {
        p_username: input.username,
        p_source: input.source,
        p_gross: input.gross,
        p_reference: input.reference,
      });
      if (error) throw error;
    },
  });
}

export function useAdvanceBalance() {
  return useMutation({
    mutationFn: async (input: { username: string; from: string; to: string; amount: number; reference: string }) => {
      const { error } = await supabase.rpc('admin_advance_balance', {
        p_username: input.username,
        p_from: input.from,
        p_to: input.to,
        p_amount: input.amount,
        p_reference: input.reference,
      });
      if (error) throw error;
    },
  });
}
