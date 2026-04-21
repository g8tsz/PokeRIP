/**
 * Minimal SVG sparkline / area chart. Server-renderable, zero dependencies.
 * Pass `series` as an array of numbers; the x-axis is just the index.
 * Optional `labels` for tooltips on hover (via <title>).
 */
export function Sparkline({
  series,
  labels,
  width = 600,
  height = 140,
  color = "#ffcc00",
  fillOpacity = 0.12,
  stroke = 2,
  format = (n: number) => String(n),
}: {
  series: number[];
  labels?: string[];
  width?: number;
  height?: number;
  color?: string;
  fillOpacity?: number;
  stroke?: number;
  format?: (n: number) => string;
}) {
  if (series.length === 0) {
    return (
      <div
        className="glass rounded-xl grid place-items-center text-white/40 text-sm"
        style={{ height }}
      >
        No data yet
      </div>
    );
  }

  const pad = { t: 8, r: 8, b: 20, l: 8 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;

  const max = Math.max(1, ...series);
  const min = Math.min(0, ...series);

  const stepX = series.length > 1 ? innerW / (series.length - 1) : innerW;
  const y = (v: number) => pad.t + innerH * (1 - (v - min) / Math.max(1, max - min));

  const points = series.map((v, i) => [pad.l + i * stepX, y(v)] as const);
  const line = points.map(([x, yv], i) => (i === 0 ? `M${x},${yv}` : `L${x},${yv}`)).join(" ");
  const area =
    `M${points[0]![0]},${y(min)} ` +
    points.map(([x, yv]) => `L${x},${yv}`).join(" ") +
    ` L${points[points.length - 1]![0]},${y(min)} Z`;

  const lastIdx = series.length - 1;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className="block"
    >
      <defs>
        <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={fillOpacity * 2} />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#grad-${color.replace("#", "")})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={stroke} strokeLinejoin="round" strokeLinecap="round" />
      {/* last point marker */}
      <circle cx={points[lastIdx]![0]} cy={points[lastIdx]![1]} r={3.5} fill={color} />
      {/* invisible hover targets for tooltips */}
      {labels &&
        points.map(([x, yv], i) => (
          <g key={i}>
            <rect
              x={x - stepX / 2}
              y={pad.t}
              width={Math.max(stepX, 1)}
              height={innerH}
              fill="transparent"
            >
              <title>
                {labels[i]}: {format(series[i]!)}
              </title>
            </rect>
            <circle cx={x} cy={yv} r={2} fill={color} opacity={0.5} />
          </g>
        ))}
    </svg>
  );
}

/**
 * Tiny bar chart variant.
 */
export function BarChart({
  series,
  labels,
  width = 600,
  height = 140,
  color = "#5ab0ff",
  format = (n: number) => String(n),
}: {
  series: number[];
  labels?: string[];
  width?: number;
  height?: number;
  color?: string;
  format?: (n: number) => string;
}) {
  if (series.length === 0) {
    return (
      <div className="glass rounded-xl grid place-items-center text-white/40 text-sm" style={{ height }}>
        No data yet
      </div>
    );
  }
  const pad = { t: 8, r: 8, b: 8, l: 8 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const max = Math.max(1, ...series);
  const gap = 2;
  const barW = Math.max(1, innerW / series.length - gap);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      {series.map((v, i) => {
        const h = (v / max) * innerH;
        const x = pad.l + i * (barW + gap);
        const y = pad.t + (innerH - h);
        return (
          <rect key={i} x={x} y={y} width={barW} height={h} fill={color} opacity={0.85} rx={2}>
            <title>
              {labels?.[i] ?? i}: {format(v)}
            </title>
          </rect>
        );
      })}
    </svg>
  );
}
