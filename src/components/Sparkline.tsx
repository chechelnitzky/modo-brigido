export function Sparkline({ values, labels }: { values: number[]; labels?: string[] }) {
  if (values.length < 2) {
    return <div className="empty-chart">Aún faltan registros para mostrar una tendencia.</div>;
  }
  const width = 520;
  const height = 180;
  const padding = 18;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const points = values.map((value, index) => {
    const x = padding + (index / (values.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / spread) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="sparkline-wrap">
      <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <polyline className="sparkline-line" points={points} />
        {points.split(' ').map((point, index) => {
          const [cx, cy] = point.split(',');
          return <circle key={index} className="sparkline-dot" cx={cx} cy={cy} r="4" />;
        })}
      </svg>
      {labels?.length ? (
        <div className="chart-labels">
          <span>{labels[0]}</span>
          <span>{labels[Math.floor(labels.length / 2)]}</span>
          <span>{labels[labels.length - 1]}</span>
        </div>
      ) : null}
    </div>
  );
}
