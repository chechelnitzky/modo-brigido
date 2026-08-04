const STORAGE_KEY = 'modo-brigido-supabase-config';

export type AppConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

export function getAppConfig(): AppConfig | null {
  const runtime = window.MODO_BRIGIDO_CONFIG;
  if (runtime?.supabaseUrl && runtime?.supabasePublishableKey) {
    return {
      supabaseUrl: runtime.supabaseUrl.trim(),
      supabasePublishableKey: runtime.supabasePublishableKey.trim()
    };
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as AppConfig;
    if (!parsed.supabaseUrl || !parsed.supabasePublishableKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveAppConfig(config: AppConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function clearAppConfig() {
  localStorage.removeItem(STORAGE_KEY);
}
