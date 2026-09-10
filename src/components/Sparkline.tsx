import { useEffect, useState } from 'react';

type SparklineProps = {
  values: number[];
  labels?: string[];
  tooltipLabels?: string[];
  tooltipValues?: string[];
  ariaLabel?: string;
};

type ChartPoint = {
  x: number;
  y: number;
  value: number;
};

type DateInfo = {
  weekday: string;
  weekdayIndex: number;
};

function dateInfoFromTooltipLabel(label?: string): DateInfo | null {
  if (!label) return null;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(label.trim());
  if (!match) return null;

  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(date.getTime())) return null;

  return {
    weekday: new Intl.DateTimeFormat('es-CL', { weekday: 'long', timeZone: 'UTC' }).format(date),
    weekdayIndex: date.getUTCDay()
  };
}

export function Sparkline({ values, labels, tooltipLabels, tooltipValues, ariaLabel = 'Gráfico de progreso' }: SparklineProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const isWeightChart = ariaLabel.toLowerCase().includes('peso');

  useEffect(() => {
    setSelectedIndex((current) => current !== null && current >= values.length ? null : current);
  }, [values.length]);

  if (!values.length) {
    return <div className="empty-chart">Aún faltan registros para mostrar una tendencia.</div>;
  }

  const width = 520;
  const height = 180;
  const padding = 18;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const points: ChartPoint[] = values.map((value, index) => {
    const x = values.length === 1
      ? width / 2
      : padding + (index / (values.length - 1)) * (width - padding * 2);
    const y = values.length === 1
      ? height / 2
      : height - padding - ((value - min) / spread) * (height - padding * 2);
    return { x, y, value };
  });
  const polylinePoints = points.map((point) => `${point.x},${point.y}`).join(' ');
  const selectedPoint = selectedIndex === null ? null : points[selectedIndex];
  const selectedXPercent = selectedPoint ? (selectedPoint.x / width) * 100 : 0;
  const selectedYPercent = selectedPoint ? (selectedPoint.y / height) * 100 : 0;
  const tooltipTransform = selectedXPercent < 18
    ? 'translate(0, calc(-100% - 14px))'
    : selectedXPercent > 82
      ? 'translate(-100%, calc(-100% - 14px))'
      : 'translate(-50%, calc(-100% - 14px))';

  const togglePoint = (index: number) => {
    setSelectedIndex((current) => current === index ? null : index);
  };

  const selectedBaseLabel = selectedIndex === null
    ? ''
    : tooltipLabels?.[selectedIndex] ?? labels?.[selectedIndex] ?? '';
  const selectedDateInfo = isWeightChart ? dateInfoFromTooltipLabel(selectedBaseLabel) : null;
  const selectedDisplayLabel = selectedDateInfo
    ? `${selectedDateInfo.weekday}, ${selectedBaseLabel}`
    : selectedBaseLabel;

  return (
    <div className="sparkline-wrap" style={{ position: 'relative' }}>
      <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={ariaLabel}>
        {values.length > 1 && <polyline className="sparkline-line" points={polylinePoints} />}
        {points.map((point, index) => {
          const pointLabel = tooltipLabels?.[index] ?? labels?.[index] ?? `Punto ${index + 1}`;
          const pointDateInfo = isWeightChart ? dateInfoFromTooltipLabel(pointLabel) : null;
          const isWeekStart = pointDateInfo?.weekdayIndex === 0;
          const isSelected = selectedIndex === index;

          return (
            <g key={index}>
              <circle
                className="sparkline-dot"
                cx={point.x}
                cy={point.y}
                r={isSelected ? 5.5 : isWeekStart ? 4.8 : 4}
                style={{
                  ...(isWeekStart ? { fill: '#f5c451' } : {}),
                  ...(isSelected ? { stroke: '#f2f6f3', strokeWidth: 2 } : {})
                }}
                pointerEvents="none"
              />
              <circle
                cx={point.x}
                cy={point.y}
                r="15"
                fill="transparent"
                stroke="transparent"
                role="button"
                tabIndex={0}
                aria-label={`${pointDateInfo ? `${pointDateInfo.weekday}, ` : ''}${pointLabel}: ${tooltipValues?.[index] ?? point.value}${isWeekStart ? ' · inicio de semana' : ''}`}
                style={{ cursor: 'pointer', outline: 'none' }}
                onClick={() => togglePoint(index)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    togglePoint(index);
                  }
                }}
              />
            </g>
          );
        })}
      </svg>

      {selectedPoint && selectedIndex !== null && (
        <div
          role="status"
          style={{
            position: 'absolute',
            left: `${selectedXPercent}%`,
            top: `${selectedYPercent}%`,
            transform: tooltipTransform,
            zIndex: 6,
            minWidth: 112,
            maxWidth: 190,
            padding: '8px 10px',
            borderRadius: 11,
            border: '1px solid rgba(112,228,72,.55)',
            background: 'rgba(8,16,11,.97)',
            boxShadow: '0 10px 30px rgba(0,0,0,.45)',
            pointerEvents: 'none',
            textAlign: 'left'
          }}
        >
          <strong style={{ display: 'block', fontSize: 13, color: '#f2f6f3', whiteSpace: 'nowrap' }}>
            {tooltipValues?.[selectedIndex] ?? selectedPoint.value}
          </strong>
          <span style={{ display: 'block', marginTop: 2, fontSize: 10, color: '#92a097', whiteSpace: 'nowrap' }}>
            {selectedDisplayLabel}
          </span>
          <i
            aria-hidden="true"
            style={{
              position: 'absolute',
              width: 8,
              height: 8,
              bottom: -5,
              left: selectedXPercent < 18 ? 12 : selectedXPercent > 82 ? 'calc(100% - 20px)' : 'calc(50% - 4px)',
              transform: 'rotate(45deg)',
              background: 'rgba(8,16,11,.97)',
              borderRight: '1px solid rgba(112,228,72,.55)',
              borderBottom: '1px solid rgba(112,228,72,.55)'
            }}
          />
        </div>
      )}

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
