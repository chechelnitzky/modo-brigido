import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
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
  const today = dateInTimezone(profile?.timezone || 'America/Santiago');
  const storageKey = user ? `modo-brigido-selected-date:${user.id}` : 'modo-brigido-selected-date';
  const [selectedDate, setSelectedDateState] = useState(today);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    setSelectedDateState(stored && stored <= today ? stored : today);
  }, [storageKey, today]);

  const setSelectedDate = (date: string) => {
    const safeDate = date && date <= today ? date : today;
    setSelectedDateState(safeDate);
    localStorage.setItem(storageKey, safeDate);
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
