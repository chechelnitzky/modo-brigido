import { CheckCircle2, KeyRound, Link2, RefreshCw, ShieldCheck, Unplug } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFatSecretDaily } from '../hooks/useFatSecretDaily';
import { dateInTimezone } from '../lib/date';
import { getSupabase } from '../lib/supabase';

export function FatSecretIntegrationPanel() {
  const supabase = getSupabase();
  const { profile } = useAuth();
  const today = dateInTimezone(profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const fatsecret = useFatSecretDaily(today);
  const [consumerKey, setConsumerKey] = useState('');
  const [consumerSecret, setConsumerSecret] = useState('');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const hashQuery = window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '';
    const query = new URLSearchParams(hashQuery || window.location.search.slice(1));
    const result = query.get('fatsecret');
    if (result === 'connected') setMessage('FatSecret quedó conectado correctamente.');
    if (result === 'denied') setMessage('La conexión con FatSecret fue cancelada.');
    if (result === 'error') setError(query.get('fatsecret_message') || 'FatSecret no pudo completar la conexión.');
  }, []);

  const connect = async () => {
    setWorking(true);
    setError('');
    setMessage('');
    try {
      await fatsecret.connect();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar la conexión con FatSecret.');
      setWorking(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('¿Desconectar FatSecret? Modo Bestia dejará de leer tu diario.')) return;
    setWorking(true);
    setError('');
    setMessage('');
    try {
      await fatsecret.disconnect();
      setMessage('FatSecret fue desconectado.');
      await fatsecret.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo desconectar FatSecret.');
    } finally {
      setWorking(false);
    }
  };

  const configure = async (event: FormEvent) => {
    event.preventDefault();
    setWorking(true);
    setError('');
    setMessage('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('fatsecret-integration', {
        body: {
          action: 'configure',
          consumerKey: consumerKey.trim(),
          consumerSecret: consumerSecret.trim()
        }
      });
      if (invokeError) throw invokeError;
      if (!data?.configured) throw new Error(data?.error || 'No se pudieron guardar las credenciales de FatSecret.');
      setConsumerSecret('');
      setMessage('Credenciales guardadas de forma segura. Ahora conecta tu cuenta.');
      await fatsecret.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo configurar FatSecret.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="panel">
      <div className="section-title">
        <div><p className="eyebrow">NUTRICIÓN AUTOMÁTICA</p><h2>FatSecret</h2></div>
        <ShieldCheck />
      </div>
      <p className="muted">Modo Bestia lee en modo solo lectura las calorías y proteína que registras en FatSecret. Nunca crea, edita ni elimina comidas.</p>

      {!fatsecret.configured && (
        <form className="form-grid" onSubmit={configure} autoComplete="off">
          <label>
            <span><KeyRound size={16} /> Consumer Key</span>
            <input value={consumerKey} onChange={(event) => setConsumerKey(event.target.value)} required spellCheck={false} autoCapitalize="none" autoCorrect="off" />
          </label>
          <label>
            <span><KeyRound size={16} /> Consumer Secret</span>
            <input type="password" value={consumerSecret} onChange={(event) => setConsumerSecret(event.target.value)} required spellCheck={false} autoCapitalize="none" autoCorrect="off" />
          </label>
          <button type="submit" className="secondary-button" disabled={working || consumerKey.trim().length < 16 || consumerSecret.trim().length < 16}>
            <ShieldCheck size={17} /> {working ? 'Guardando…' : 'Guardar credenciales'}
          </button>
          <small className="field-help">Se guardan cifradas en Supabase Vault y no quedan almacenadas en el navegador.</small>
        </form>
      )}

      {fatsecret.configured && !fatsecret.connected && (
        <div className="alert"><Link2 size={16} /> FatSecret está configurado, pero tu cuenta todavía no está conectada.</div>
      )}

      {fatsecret.connected && (
        <div className="alert success">
          <CheckCircle2 size={16} />
          <span>Conectado. Hoy Modo Bestia está leyendo {fatsecret.calories ?? 0} kcal y {fatsecret.protein ?? 0} g de proteína desde FatSecret.</span>
        </div>
      )}

      {(fatsecret.error || error) && <div className="alert error">{error || fatsecret.error}</div>}
      {message && <div className="alert success">{message}</div>}

      {fatsecret.configured && (
        <div className="button-row">
          {!fatsecret.connected && (
            <button type="button" className="secondary-button" onClick={connect} disabled={working || fatsecret.loading}>
              <Link2 size={17} /> {working ? 'Conectando…' : 'Conectar FatSecret'}
            </button>
          )}
          {fatsecret.connected && (
            <>
              <button type="button" className="secondary-button" onClick={() => void fatsecret.refresh()} disabled={working || fatsecret.loading}>
                <RefreshCw size={17} /> {fatsecret.loading ? 'Actualizando…' : 'Actualizar ahora'}
              </button>
              <button type="button" className="secondary-button" onClick={disconnect} disabled={working}>
                <Unplug size={17} /> Desconectar
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
