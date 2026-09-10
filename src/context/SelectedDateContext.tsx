import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { dateInTimezone } from '../lib/date';

type SelectedDateContextValue = {
  selectedDate: string;
  today: string;
  isToday: boolean;
  setSelectedDate: (date: string) => void;
  resetToToday: () => void;
};

const SelectedDateContext = createContext<SelectedDateContextValue | null>(null);

export function SelectedDateProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const timezone = profile?.timezone || 'America/Santiago';
  const storageKey = user ? `modo-brigido-selected-date:${user.id}` : 'modo-brigido-selected-date';
  const modeKey = user ? `modo-brigido-selected-date-mode:${user.id}` : 'modo-brigido-selected-date-mode';
  const initialToday = dateInTimezone(timezone);
  const [today, setToday] = useState(initialToday);
  const [selectedDate, setSelectedDateState] = useState(initialToday);
  const manualSelectionRef = useRef(false);

  // Restore only an explicitly pinned historical date. Older app versions stored
  // every selected date, including the then-current day, so an unmarked stored
  // date is treated as "follow today" to avoid reopening on yesterday by mistake.
  useEffect(() => {
    const freshToday = dateInTimezone(timezone);
    const storedDate = localStorage.getItem(storageKey);
    const storedMode = localStorage.getItem(modeKey);
    const hasValidManualSelection = storedMode === 'manual' && !!storedDate && storedDate <= freshToday;

    manualSelectionRef.current = hasValidManualSelection;
    setToday(freshToday);
    setSelectedDateState(hasValidManualSelection ? storedDate! : freshToday);

    if (!hasValidManualSelection) {
      localStorage.setItem(storageKey, freshToday);
      localStorage.setItem(modeKey, 'today');
    }
  }, [storageKey, modeKey, timezone]);

  // Keep "today" genuinely live. This covers midnight while the app stays open,
  // plus PWA/browser resume after the phone has left the app suspended overnight.
  useEffect(() => {
    const syncCurrentDay = () => {
      const freshToday = dateInTimezone(timezone);
      setToday((current) => current === freshToday ? current : freshToday);

      if (!manualSelectionRef.current) {
        setSelectedDateState((current) => current === freshToday ? current : freshToday);
        localStorage.setItem(storageKey, freshToday);
        localStorage.setItem(modeKey, 'today');
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') syncCurrentDay();
    };

    syncCurrentDay();
    const intervalId = window.setInterval(syncCurrentDay, 60_000);
    window.addEventListener('focus', syncCurrentDay);
    window.addEventListener('pageshow', syncCurrentDay);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', syncCurrentDay);
      window.removeEventListener('pageshow', syncCurrentDay);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [storageKey, modeKey, timezone]);

  const setSelectedDate = (date: string) => {
    const safeDate = date && date <= today ? date : today;
    const isManualSelection = safeDate !== today;
    manualSelectionRef.current = isManualSelection;
    setSelectedDateState(safeDate);
    localStorage.setItem(storageKey, safeDate);
    localStorage.setItem(modeKey, isManualSelection ? 'manual' : 'today');
  };

  const resetToToday = () => setSelectedDate(today);

  const value = useMemo(() => ({
    selectedDate,
    today,
    isToday: selectedDate === today,
    setSelectedDate,
    resetToToday
  }), [selectedDate, today]);

  return <SelectedDateContext.Provider value={value}>{children}</SelectedDateContext.Provider>;
}

export function useSelectedDate() {
  const context = useContext(SelectedDateContext);
  if (!context) throw new Error('useSelectedDate debe usarse dentro de SelectedDateProvider.');
  return context;
}
