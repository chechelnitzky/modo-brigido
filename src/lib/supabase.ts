import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getAppConfig } from './config';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const config = getAppConfig();
  if (!config) throw new Error('Supabase no está configurado.');

  client = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
  return client;
}
