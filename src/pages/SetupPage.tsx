import { Database, ExternalLink, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { saveAppConfig } from '../lib/config';

export function SetupPage() {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [error, setError] = useState('');

  const save = () => {
    setError('');
    if (!/^https:\/\/.+\.supabase\.co\/?$/.test(url.trim())) {
      setError('La URL debe verse como https://xxxxx.supabase.co');
      return;
    }
    if (key.trim().length < 20) {
      setError('La publishable key parece incompleta.');
      return;
    }
    saveAppConfig({ supabaseUrl: url.trim().replace(/\/$/, ''), supabasePublishableKey: key.trim() });
    window.location.reload();
  };

  return (
    <div className="center-page setup-page">
      <section className="auth-card wide-card">
        <div className="brand-mark large">MB</div>
        <p className="eyebrow">PRIMERA CONFIGURACIÓN</p>
        <h1>Conecta Modo Brígido con Supabase</h1>
        <p className="muted">Esto se hace una sola vez por dispositivo, salvo que completes <code>public/app-config.js</code> antes de publicar.</p>

        <div className="feature-grid compact">
          <div><Database /><strong>Memoria real</strong><span>Los datos sobreviven al cambio de teléfono.</span></div>
          <div><ShieldCheck /><strong>Cuentas separadas</strong><span>Cada usuario ve solamente sus registros.</span></div>
        </div>

        <label>Project URL
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxxx.supabase.co" autoCapitalize="none" />
        </label>
        <label>Publishable key
          <textarea value={key} onChange={(e) => setKey(e.target.value)} placeholder="sb_publishable_..." rows={3} autoCapitalize="none" />
        </label>
        {error && <div className="alert error">{error}</div>}
        <button className="primary-button" onClick={save}>Guardar y continuar</button>
        <p className="small muted">Primero debes crear el proyecto y ejecutar el archivo <code>supabase/schema.sql</code>. Las instrucciones están en el README.</p>
        <a className="text-link" href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Abrir Supabase <ExternalLink size={15} /></a>
      </section>
    </div>
  );
}
