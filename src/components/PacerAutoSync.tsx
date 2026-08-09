import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { syncPendingMutations } from '../lib/offline';
import { PACER_SYNC_EVENT, syncPacerSteps } from '../lib/pacer';

const SYNC_COOLDOWN_MS = 30_000;
const FOREGROUND_REFRESH_MS = 2 * 60_000;

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
        // Offline remains a safety net only: if anything was queued, send it first.
        await syncPendingMutations();

        // Pacer OpenAPI is cloud-backed. Refresh today + yesterday on entry and while visible
        // so a delayed phone -> Pacer Cloud upload appears in Modo Bestia as soon as possible.
        const result = await syncPacerSteps(2);
        if (result.connected) {
          localStorage.setItem(storageKey, String(Date.now()));
          window.dispatchEvent(new CustomEvent(PACER_SYNC_EVENT, {
            detail: { activities: result.activities ?? [], syncedAt: result.lastSyncAt ?? null }
          }));
        }
      } catch {
        // Best effort; Settings still exposes manual sync for diagnostics.
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
    const interval = window.setInterval(() => void syncNow(), FOREGROUND_REFRESH_MS);

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('online', onOnline);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('online', onOnline);
    };
  }, [user]);

  return null;
}
