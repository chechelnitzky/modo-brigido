export function ProgressBar({ value, max = 100 }: { value: number; max?: number }) {
  const percent = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  return (
    <div className="progress-track" aria-label={`${Math.round(percent)}%`}>
      <div className="progress-fill" style={{ width: `${percent}%` }} />
    </div>
  );
}
