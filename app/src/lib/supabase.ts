import './polyfills';
import { AppState, Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

import { env, isConfigured } from './env';
import { secureStorage } from './secure-storage';

export const supabase = createClient(
  isConfigured ? env.supabaseUrl : 'http://localhost:54321',
  isConfigured ? env.supabaseKey : 'not-configured',
  {
    auth: {
      storage: secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    global: { headers: { 'x-client-info': 'mbaretefans-app/1.0' } },
  },
);

// Refresh tokens only while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
