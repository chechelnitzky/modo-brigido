import { KeyRound, ShieldCheck } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { getSupabase } from '../lib/supabase';
import { NutritionPage } from './NutritionPage';

export function NutritionGateway() {
  const supabase = getSupabase();
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [consumerKey, setConsumerKey] = useState('');
  const [consumerSecret, setConsumerSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.functions.invoke('fatsecret-integration', { body: { action: 'status' } });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setConfigured(false);
      } else {
        setConfigured(Boolean(data?.configured));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const { data: configData, error: configError } = await supabase.functions.invoke('fatsecret-integration', {
        body: { action: 'configure', consumerKey: consumerKey.trim(), consumerSecret: consumerSecret.trim() }
      });
      if (configError) throw configError;
      if (!configData?.configured) throw new Error(configData?.error || 'No se pudieron guardar las credenciales.');

      setConsumerSecret('');
      const { data: startData, error: startError } = await supabase.functions.invoke('fatsecret-integration', { body: { action: 'start' } });
      if (startError) throw startError;
      if (!startData?.authorizeUrl) throw new Error(startData?.error || 'No se pudo iniciar la autorización con FatSecret.');
      window.location.assign(String(startData.authorizeUrl));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo configurar FatSecret.');
      setSaving(false);
    }
  };

  if (loading) return <div className="page-loading">Revisando FatSecret…</div>;
  if (configured) return <NutritionPage />;

  return <div className="page-grid">
    <section className="page-heading simple">
      <div>
        <p className="eyebrow">FATSECRET · CONFIGURACIÓN SEGURA</p>
        <h1>Conectar FatSecret</h1>
        <p className="muted">Pega una sola vez las credenciales OAuth 1.0 de FatSecret. Se envían directo al backend y se guardan cifradas en Supabase Vault.</p>
      </div>
    </section>

    <section className="panel">
      <div className="section-title">
        <div className="metric-icon"><ShieldCheck /></div>
        <div><span>Configuración del servidor</span><h2>REST API OAuth 1.0</h2></div>
      </div>

      <form className="form-grid" onSubmit={submit} autoComplete="off">
        <label>
          <span><KeyRound size={16} /> Consumer Key</span>
          <input value={consumerKey} onChange={(event) => setConsumerKey(event.target.value)} required spellCheck={false} autoCapitalize="none" autoCorrect="off" />
        </label>
        <label>
          <span><KeyRound size={16} /> Consumer Secret</span>
          <input type="password" value={consumerSecret} onChange={(event) => setConsumerSecret(event.target.value)} required spellCheck={false} autoCapitalize="none" autoCorrect="off" />
        </label>
        <button className="primary-button" type="submit" disabled={saving || consumerKey.trim().length < 16 || consumerSecret.trim().length < 16}>
          {saving ? 'Guardando y conectando…' : 'Guardar y conectar FatSecret'}
        </button>
      </form>

      <p className="muted small">Las credenciales no se guardan en el navegador ni en GitHub. Después de guardarlas, FatSecret abrirá su pantalla oficial para autorizar tu diario.</p>
      {error && <div className="alert error">{error}</div>}
    </section>
  </div>;
}
