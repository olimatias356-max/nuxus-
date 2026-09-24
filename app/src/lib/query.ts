import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: (count, error: any) => {
        // do not retry permission / validation errors
        if (error?.code && /^(42|22|23|PT4|PGRST3)/.test(String(error.code))) return false;
        return count < 2;
      },
    },
    mutations: { retry: 0 },
  },
});
