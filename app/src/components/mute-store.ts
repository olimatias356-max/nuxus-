import { useSyncExternalStore } from 'react';

// Videos start muted (WCAG 1.4.2); the choice is shared across feed and reels.
let muted = true;
const listeners = new Set<() => void>();

export function setMuted(next: boolean) {
  muted = next;
  listeners.forEach((l) => l());
}

export function useMuted(): [boolean, (v: boolean) => void] {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => muted,
    () => muted,
  );
  return [value, setMuted];
}
