import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import { secureStorage } from './secure-storage';
import { supabase } from './supabase';

// Push notifications through Expo Push. The permission prompt is only shown
// when the user taps "Activar" (never on first launch).
const TOKEN_KEY = 'mbf.push_token';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

export type PushState = 'unsupported' | 'granted' | 'denied' | 'undetermined';

export async function pushState(): Promise<PushState> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unsupported';
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

/** Asks for permission (if needed) and registers this device for the signed-in user. */
export async function enablePush(ask: boolean): Promise<PushState> {
  let state = await pushState();
  if (state === 'unsupported') return state;
  if (state !== 'granted' && ask) {
    const { status } = await Notifications.requestPermissionsAsync();
    state = status === 'granted' ? 'granted' : 'denied';
  }
  if (state !== 'granted') return state;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'MbareteFans',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#C8FF3D',
    });
  }
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return state; // run `eas init` to link the project (see README)
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
  if (!error) await secureStorage.setItem(TOKEN_KEY, token);
  return state;
}

/** Call before signing out so this device stops receiving the account's pushes. */
export async function disablePush() {
  const token = await secureStorage.getItem(TOKEN_KEY);
  if (!token) return;
  await supabase.rpc('unregister_push_token', { p_token: token }).then(
    () => {},
    () => {},
  );
  await secureStorage.removeItem(TOKEN_KEY);
}

const SAFE_ROUTE = /^\/(post|u|messages|creator|activity|settings)(\/[A-Za-z0-9._\/-]*)?$/;

/** Registers silently when already allowed and opens the screen of tapped notifications. */
export function usePushNotifications(userId: string | null) {
  useEffect(() => {
    if (!userId || Platform.OS === 'web') return;
    enablePush(false).catch(() => {});
    const open = (url: unknown) => {
      // only follow in-app routes we know (never arbitrary URLs from a payload)
      if (typeof url === 'string' && SAFE_ROUTE.test(url)) router.push(url as never);
    };
    const last = Notifications.getLastNotificationResponse();
    if (last) open(last.notification.request.content.data?.url);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data?.url));
    return () => sub.remove();
  }, [userId]);
}
