import { useEffect, useState } from 'react';

import { supabase } from './supabase';

// Private media is served through short-lived signed URLs. Requests made in the
// same frame are batched into a single API call and cached until near expiry.
const TTL_SECONDS = 3600;
const cache = new Map<string, { url: string; expires: number }>();
const pending = new Map<string, ((url: string | null) => void)[]>();
let timer: ReturnType<typeof setTimeout> | null = null;

function cached(path: string): string | null {
  const hit = cache.get(path);
  return hit && hit.expires > Date.now() + 60_000 ? hit.url : null;
}

async function flush() {
  timer = null;
  const batch = [...pending.entries()];
  pending.clear();
  for (let i = 0; i < batch.length; i += 100) {
    const chunk = batch.slice(i, i + 100);
    const { data, error } = await supabase.storage.from('media').createSignedUrls(chunk.map(([p]) => p), TTL_SECONDS);
    const byPath = new Map<string, string>();
    if (!error && data) {
      for (const item of data) {
        if (item.path && item.signedUrl && !item.error) byPath.set(item.path, item.signedUrl);
      }
    }
    for (const [path, resolvers] of chunk) {
      const url = byPath.get(path) ?? null;
      if (url) cache.set(path, { url, expires: Date.now() + TTL_SECONDS * 1000 });
      resolvers.forEach((resolve) => resolve(url));
    }
  }
}

export function getSignedUrl(path: string): Promise<string | null> {
  const hit = cached(path);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => {
    const list = pending.get(path) ?? [];
    list.push(resolve);
    pending.set(path, list);
    if (!timer) timer = setTimeout(flush, 16);
  });
}

export function useMediaUrl(path: string | null | undefined): string | null {
  const [resolved, setResolved] = useState<{ path: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!path || cached(path)) return;
    let alive = true;
    getSignedUrl(path).then((url) => alive && setResolved({ path, url }));
    return () => {
      alive = false;
    };
  }, [path]);
  if (!path) return null;
  return cached(path) ?? (resolved?.path === path ? resolved.url : null);
}

export function clearSignedUrls() {
  cache.clear();
}
