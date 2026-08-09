import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { syncPendingMutations } from '../lib/offline';
import { syncPacerSteps } from '../lib/pacer';

const SYNC_COOLDOWN_MS = 60_000;
export const PACER_SYNC_EVENT = 'modo-bestia:pacer-steps-synced';

export function PacerAutoSync() {
  const { user } = useAuth();
  const runningRef = useRef(false);

  useEffect(() => {
    if (!user) return;

    const storageKey = `modo-bestia:pacer-auto-sync:${user.id}`;

    const syncNow = async () => {
      if (runningRef.current || !navigator.onLine || document.visibilityState === 'hidden') return;

      const lastSuccess = Number(localStorage.getItem(storageKey) || 0);
      if (Date.now() - lastSuccess < SYNC_COOLDOWN_MS) return;

      runningRef.current = true;
      try {
        // Always flush locally saved check-ins before Pacer touches today's steps.
        await syncPendingMutations();

        // Today + yesterday is enough for normal foreground refreshes.
        const result = await syncPacerSteps(2);
        if (result.connected) {
          localStorage.setItem(storageKey, String(Date.now()));
          window.dispatchEvent(new CustomEvent(PACER_SYNC_EVENT, {
            detail: { activities: result.activities ?? [], syncedAt: result.lastSyncAt ?? null }
          }));
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
