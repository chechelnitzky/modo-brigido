import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { syncPacerSteps } from '../lib/pacer';

const SYNC_COOLDOWN_MS = 60_000;

function isTodayRoute() {
  return window.location.hash === '' || window.location.hash === '#' || window.location.hash === '#/';
}

export function PacerAutoSync() {
  const { user } = useAuth();
  const runningRef = useRef(false);

  useEffect(() => {
    if (!user) return;

    const storageKey = `modo-bestia:pacer-auto-sync:${user.id}`;

    const syncNow = async () => {
      if (runningRef.current || !navigator.onLine || document.visibilityState === 'hidden') return;

      const lastAttempt = Number(localStorage.getItem(storageKey) || 0);
      if (Date.now() - lastAttempt < SYNC_COOLDOWN_MS) return;

      // Mark before the request so a reload after a successful sync cannot create a loop.
      localStorage.setItem(storageKey, String(Date.now()));
      runningRef.current = true;

      try {
        // The first OAuth connection already imports up to 31 days. On normal app entry,
        // today + yesterday is enough and keeps the Pacer request lightweight.
        const result = await syncPacerSteps(2);
        if (result.connected && isTodayRoute()) {
          window.location.reload();
        }
      } catch {
        // Auto-sync is best effort. Manual sync in Settings remains available for diagnostics.
      } finally {
        runningRef.current = false;
      }
    };

    void syncNow();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void syncNow();
    };
    const onPageShow = () => void syncNow();
    const onOnline = () => void syncNow();

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('online', onOnline);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('online', onOnline);
    };
  }, [user]);

  return null;
}
