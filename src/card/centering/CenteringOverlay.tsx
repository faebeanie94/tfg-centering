import type { CenteringResult, Rect } from '../../lib/centering';

interface Props {
  measurements: CenteringResult;
  outer: Rect;
  inner: Rect;
  width?: number;
  height?: number;
}

/** Debug overlay: estimated artwork box + L/R T/B percents from computeCentering. */
export function CenteringOverlay({ measurements, outer, inner, width = 300, height = 420 }: Props) {
  const sx = width / Math.max(outer.width, 1);
  const sy = height / Math.max(outer.height, 1);
  const x = (inner.x - outer.x) * sx;
  const y = (inner.y - outer.y) * sy;
  const w = inner.width * sx;
  const h = inner.height * sy;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      <line x1={width / 2} y1={0} x2={width / 2} y2={height} stroke="#00ff88" strokeWidth={1} strokeDasharray="5 5" />
      <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="#00ff88" strokeWidth={1} strokeDasharray="5 5" />
      <rect x={x} y={y} width={w} height={h} fill="none" stroke="#00ffff" strokeWidth={2} />
      <text x={x / 2} y={height / 2} fill="white" textAnchor="middle" fontSize={13} fontWeight="bold">
        {measurements.leftRight.left.toFixed(1)}%
      </text>
      <text x={x + w + (width - x - w) / 2} y={height / 2} fill="white" textAnchor="middle" fontSize={13} fontWeight="bold">
        {measurements.leftRight.right.toFixed(1)}%
      </text>
      <text x={width / 2} y={Math.max(14, y / 2)} fill="white" textAnchor="middle" fontSize={13} fontWeight="bold">
        {measurements.topBottom.top.toFixed(1)}%
      </text>
      <text
        x={width / 2}
        y={Math.min(height - 6, y + h + (height - y - h) / 2)}
        fill="white"
        textAnchor="middle"
        fontSize={13}
        fontWeight="bold"
      >
        {measurements.topBottom.bottom.toFixed(1)}%
      </text>
    </svg>
  );
}
