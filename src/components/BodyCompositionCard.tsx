import { Activity, Info, Scale } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { DailyLog, Profile } from '../types';
import { estimateBodyCompositionForLog, missingBodyFatFields } from '../lib/bodyFat';

export function BodyCompositionCard({ profile, log, title = 'Composición corporal' }: { profile: Profile; log: DailyLog; title?: string }) {
  const estimate = estimateBodyCompositionForLog(profile, log);
  const missing = missingBodyFatFields(profile, log);
  return (
    <section className="panel bodyfat-panel">
      <div className="section-title"><div><p className="eyebrow">MÉTODO U.S. NAVY</p><h2>{title}</h2></div><Activity /></div>
      {!estimate ? (
        <div className="bodyfat-empty"><Info /><div><strong>Faltan datos para estimar tu grasa corporal</strong><p className="muted">Completa {missing.join(', ')}. La fórmula usa circunferencias y es solo una estimación.</p><Link className="text-link" to="/ajustes">Completar configuración</Link></div></div>
      ) : (
        <>
          <div className="bodyfat-hero"><div><span>Grasa corporal estimada</span><strong>{estimate.bodyFatPercentage.toFixed(1)}%</strong><small>{estimate.category}</small></div><div className="bodyfat-gauge"><i style={{ width: `${Math.min(100, estimate.bodyFatPercentage / 45 * 100)}%` }} /></div></div>
          <div className="bodyfat-grid">
            <div><span>Masa grasa</span><strong>{estimate.fatMassKg.toFixed(1)} kg</strong></div>
            <div><span>Masa magra</span><strong>{estimate.leanMassKg.toFixed(1)} kg</strong></div>
            <div><span>Referencia Jackson & Pollock</span><strong>{estimate.idealBodyFatPercentage === null ? '—' : `${estimate.idealBodyFatPercentage.toFixed(1)}%`}</strong></div>
            <div><span>Peso estimado manteniendo masa magra</span><strong>{estimate.estimatedTargetWeightKg === null ? '—' : `${estimate.estimatedTargetWeightKg.toFixed(1)} kg`}</strong></div>
          </div>
          {estimate.estimatedWeightToLoseKg !== null && estimate.estimatedWeightToLoseKg > 0 && <div className="bodyfat-target"><Scale size={17} /><span>Brecha estimada al objetivo: <strong>{estimate.estimatedWeightToLoseKg.toFixed(1)} kg</strong></span></div>}
          <p className="bodyfat-disclaimer">Estimación antropométrica, no diagnóstico. El peso estimado supone conservar la masa magra y usa la referencia etaria Jackson & Pollock.</p>
        </>
      )}
    </section>
  );
}
