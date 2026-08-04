import { useEffect, useState } from 'react';
import { getSyncStatus, subscribeSyncStatus } from '../lib/offline';

export function useOfflineStatus() {
  const [status, setStatus] = useState(getSyncStatus());
  useEffect(() => subscribeSyncStatus(setStatus), []);
  return status;
}
