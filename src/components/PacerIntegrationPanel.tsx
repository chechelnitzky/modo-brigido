import { CheckCircle2, Footprints, Link2, RefreshCw, Unplug } from 'lucide-react';
import { useEffect, useState } from 'react';
import { disconnectPacer, getPacerStatus, startPacerConnection, syncPacerSteps, type PacerStatus } from '../lib/pacer';
import { FatSecretIntegrationPanel } from './FatSecretIntegrationPanel';

function formatDateTime(value: string | null) {
  if (!value) return 'Todavía no';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
}

export function PacerIntegrationPanel() {
  const [status, setStatus] = useState<PacerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refreshStatus = async () => {
    setLoading(true);
    try {
      setStatus(await getPacerStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo revisar la conexión con Pacer.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const query = window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '';
    const result = new URLSearchParams(query).get('pacer');
    if (result === 'connected') setMessage('Pacer quedó conectado. Se importó el historial disponible de pasos.');
    if (result === 'cancelled') setMessage('La conexión con Pacer fue cancelada.');
    if (result === 'error') setError('Pacer no pudo completar la conexión. Puedes intentarlo nuevamente.');
    void refreshStatus();
  }, []);

  const connect = async () => {
    setWorking(true);
    setError('');
    setMessage('');
    try {
      const { authorizeUrl } = await startPacerConnection();
      window.location.assign(authorizeUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar la conexión con Pacer.');
      setWorking(false);
    }
  };

  const sync = async () => {
    setWorking(true);
    setError('');
    setMessage('');
    try {
      const result = await syncPacerSteps(31);
      setMessage(`Pacer Cloud sincronizado${typeof result.synced === 'number' ? `: ${result.synced} días actualizados` : ''}.`);
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron sincronizar los pasos.');
    } finally {
      setWorking(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('¿Desconectar Pacer? Los pasos que ya fueron sincronizados se conservarán.')) return;
    setWorking(true);
    setError('');
    setMessage('');
    try {
      await disconnectPacer();
      setMessage('Pacer fue desconectado.');
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo desconectar Pacer.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <section className="panel">
        <div className="section-title">
          <div><p className="eyebrow">PASOS AUTOMÁTICOS</p><h2>Pacer</h2></div>
          <Footprints />
        </div>
        <p className="muted">Modo Bestia consulta Pacer Cloud. Al abrir o volver a la app intenta actualizar de inmediato y, mientras está abierta, vuelve a consultar periódicamente.</p>

        {loading && <div className="alert">Revisando conexión con Pacer…</div>}

        {!loading && status && !status.configured && (
          <div className="alert error">La integración ya está preparada, pero falta activar el cliente de Pacer en el servidor.</div>
        )}

        {!loading && status?.configured && !status.connected && (
          <div className="alert"><Link2 size={16} /> Pacer todavía no está conectado a esta cuenta.</div>
        )}

        {!loading && status?.connected && (
          <div className="alert success">
            <CheckCircle2 size={16} />
            <span>
              Conectado{status.displayName ? ` como ${status.displayName}` : ''}. Última lectura de Pacer Cloud: {formatDateTime(status.lastSyncAt)}.
              {' '}El servidor también revisa cada 15 minutos.
            </span>
          </div>
        )}

        {status?.lastSyncStatus === 'error' && status.lastSyncError && <div className="alert error">Último error de sincronización: {status.lastSyncError}</div>}
        {message && <div className="alert success">{message}</div>}
        {error && <div className="alert error">{error}</div>}

        <div className="button-row">
          {!status?.connected && (
            <button type="button" className="secondary-button" onClick={connect} disabled={working || loading || !status?.configured}>
              <Link2 size={17} /> {working ? 'Conectando…' : 'Conectar Pacer'}
            </button>
          )}
          {status?.connected && (
            <>
              <button type="button" className="secondary-button" onClick={sync} disabled={working}>
                <RefreshCw size={17} /> {working ? 'Sincronizando…' : 'Sincronizar ahora'}
              </button>
              <button type="button" className="secondary-button" onClick={disconnect} disabled={working}>
                <Unplug size={17} /> Desconectar
              </button>
            </>
          )}
        </div>
        <small className="field-help">Pacer puede mostrar pasos en el teléfono antes de subirlos a su nube. En ese caso Modo Bestia los verá apenas Pacer Cloud los publique; por eso hacemos reintentos automáticos sin reemplazar tus demás datos.</small>
      </section>
      <FatSecretIntegrationPanel />
    </>
  );
}
