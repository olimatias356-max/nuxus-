import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Session storage backed by the iOS Keychain / Android Keystore.
// Keystore entries are size-limited, so values are split into chunks.
// Tokens never leave the device (THIS_DEVICE_ONLY: not restored from backups).
const CHUNK_SIZE = 1800;
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

async function getItem(key: string): Promise<string | null> {
  const k = safeKey(key);
  const count = Number(await SecureStore.getItemAsync(`${k}.n`, options));
  if (!count) return null;
  const parts = await Promise.all(
    Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${k}.${i}`, options)),
  );
  if (parts.some((p) => p == null)) return null;
  return parts.join('');
}

async function setItem(key: string, value: string): Promise<void> {
  const k = safeKey(key);
  const previous = Number(await SecureStore.getItemAsync(`${k}.n`, options)) || 0;
  const chunks = value.match(new RegExp(`[\\s\\S]{1,${CHUNK_SIZE}}`, 'g')) ?? [''];
  await Promise.all(chunks.map((c, i) => SecureStore.setItemAsync(`${k}.${i}`, c, options)));
  await SecureStore.setItemAsync(`${k}.n`, String(chunks.length), options);
  for (let i = chunks.length; i < previous; i++) {
    await SecureStore.deleteItemAsync(`${k}.${i}`, options);
  }
}

async function removeItem(key: string): Promise<void> {
  const k = safeKey(key);
  const count = Number(await SecureStore.getItemAsync(`${k}.n`, options)) || 0;
  for (let i = 0; i < count; i++) {
    await SecureStore.deleteItemAsync(`${k}.${i}`, options);
  }
  await SecureStore.deleteItemAsync(`${k}.n`, options);
}

const webStorage = {
  getItem: async (key: string) => (typeof localStorage === 'undefined' ? null : localStorage.getItem(key)),
  setItem: async (key: string, value: string) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  },
};

export const secureStorage = Platform.OS === 'web' ? webStorage : { getItem, setItem, removeItem };
