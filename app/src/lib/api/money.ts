import { useMutation, useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';

import { uploadFile, type PickedMedia } from '../media';
import { queryClient } from '../query';
import { supabase } from '../supabase';
import type { CreatorStats, LedgerEntry, Monetization, Plan } from '../types';

export function useMonetization() {
  return useQuery({
    queryKey: ['monetization'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_monetization');
      if (error) throw error;
      return data as Monetization;
    },
  });
}

export function useCreatorStats() {
  return useQuery({
    queryKey: ['creator-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_creator_stats');
      if (error) throw error;
      return data as CreatorStats;
    },
  });
}

export function usePlans() {
  return useQuery({
    queryKey: ['plans'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('plans').select('*').order('tier');
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });
}

export function useLedger() {
  return useQuery({
    queryKey: ['ledger'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallet_ledger')
        .select('id, tx_id, currency, bucket, amount, entry_type, source, description, created_at')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as LedgerEntry[];
    },
  });
}

export function invalidateMoney() {
  queryClient.invalidateQueries({ queryKey: ['monetization'] });
  queryClient.invalidateQueries({ queryKey: ['ledger'] });
  queryClient.invalidateQueries({ queryKey: ['notifications'] });
}

export type KycInput = {
  legalName: string;
  documentType: 'ci' | 'dni' | 'cpf' | 'passport';
  documentCountry: string;
  documentNumber: string;
  front: PickedMedia;
  back: PickedMedia | null;
  selfie: PickedMedia;
};

export function useSubmitKyc() {
  return useMutation({
    mutationFn: async ({ input, userId }: { input: KycInput; userId: string }) => {
      const up = (m: PickedMedia, name: string) =>
        uploadFile('kyc', `${userId}/${Crypto.randomUUID()}-${name}.jpg`, m);
      const [front, back, selfie] = await Promise.all([
        up(input.front, 'front'),
        input.back ? up(input.back, 'back') : Promise.resolve(null),
        up(input.selfie, 'selfie'),
      ]);
      const { error } = await supabase.rpc('submit_kyc', {
        p_legal_name: input.legalName.trim(),
        p_document_type: input.documentType,
        p_document_country: input.documentCountry,
        p_document_number: input.documentNumber,
        p_front_path: front,
        p_back_path: back,
        p_selfie_path: selfie,
      });
      if (error) throw error;
    },
    onSuccess: invalidateMoney,
  });
}

export function useUpsertBankAccount() {
  return useMutation({
    mutationFn: async (input: { bankName: string; accountType: 'savings' | 'checking'; holderName: string; accountNumber: string }) => {
      const { error } = await supabase.rpc('upsert_bank_account', {
        p_bank_name: input.bankName.trim(),
        p_account_type: input.accountType,
        p_holder_name: input.holderName.trim(),
        p_account_number: input.accountNumber,
      });
      if (error) throw error;
    },
    onSuccess: invalidateMoney,
  });
}

export function useRequestPayout() {
  return useMutation({
    mutationFn: async (amount: number | null) => {
      const { data, error } = await supabase.rpc('request_payout', { p_amount: amount });
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidateMoney,
  });
}
