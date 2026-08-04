import { Dumbbell, LockKeyhole, Mail, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { getSupabase } from '../lib/supabase';

export function AuthPage() {
  const supabase = getSupabase();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      if (mode === 'signup') {
        const { error: signupError, data } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName },
            emailRedirectTo: window.location.href.split('#')[0]
          }
        });
        if (signupError) throw signupError;
        if (!data.session) setMessage('Cuenta creada. Revisa tu correo para confirmar el acceso.');
      } else {
        const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
        if (loginError) throw loginError;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar el acceso.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="center-page auth-page">
      <section className="auth-card">
        <div className="brand-mark large">MB</div>
        <p className="eyebrow">MODO BRÍGIDO</p>
        <h1>{mode === 'login' ? 'Vuelve a tu plan' : 'Crea tu cuenta'}</h1>
        <p className="muted">Peso, pasos, nutrición y entrenamiento sincronizados.</p>
        <form onSubmit={submit} className="stack-form">
          {mode === 'signup' && (
            <label><span><UserPlus size={16} /> Nombre</span>
              <input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Joseph" />
            </label>
          )}
          <label><span><Mail size={16} /> Correo</span>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" autoCapitalize="none" />
          </label>
          <label><span><LockKeyhole size={16} /> Contraseña</span>
            <input required minLength={6} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
          </label>
          {error && <div className="alert error">{error}</div>}
          {message && <div className="alert success">{message}</div>}
          <button className="primary-button" disabled={loading} type="submit"><Dumbbell size={18} /> {loading ? 'Procesando…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}</button>
        </form>
        <button className="link-button" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? 'No tengo cuenta todavía' : 'Ya tengo una cuenta'}
        </button>
      </section>
    </div>
  );
}
