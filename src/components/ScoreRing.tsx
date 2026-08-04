export function ScoreRing({ value }: { value: number }) {
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(100, value)) / 100) * circumference;
  return (
    <div className="score-ring">
      <svg viewBox="0 0 120 120" role="img" aria-label={`Puntaje ${value} de 100`}>
        <circle className="ring-bg" cx="60" cy="60" r={radius} />
        <circle
          className="ring-value"
          cx="60"
          cy="60"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="score-ring-label"><strong>{value}</strong><span>/100</span></div>
    </div>
  );
}
