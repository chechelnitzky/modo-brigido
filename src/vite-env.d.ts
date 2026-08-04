/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface Window {
  MODO_BRIGIDO_CONFIG?: {
    supabaseUrl?: string;
    supabasePublishableKey?: string;
  };
}
