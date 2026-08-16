import type { CardAlignmentState } from '../lib/card-alignment';
import type { DetectedCard } from '../lib/card-edge-detect';
import type { LevelState } from '../hooks/useDeviceLevel';
import { emptyTrackerSnapshot, type CardTrackerSnapshot } from '../lib/card-tracker';

interface ScannerOverlayProps {
  level: LevelState;
  guideBox: DetectedCard;
  detectedBox: DetectedCard | null;
  alignment: CardAlignmentState;
  showLevel: boolean;
  tracker?: CardTrackerSnapshot;
  /** Analysis frame size used by the tracker (for mapping px → viewBox). */
  analysisSize?: { width: number; height: number };
}

function boxToSvg(box: DetectedCard) {
  return {
    x: box.left * 100,
    y: box.top * 100,
    w: box.width * 100,
    h: box.height * 100,
  };
}

/** Debug overlay for the live tracker — confidence, stability, capture progress. */
export function CardTrackerOverlay({
  tracker,
  analysisWidth = 240,
  analysisHeight = 426,
}: {
  tracker: CardTrackerSnapshot;
  analysisWidth?: number;
  analysisHeight?: number;
}) {
  if (tracker.corners.length !== 4 || analysisWidth < 1 || analysisHeight < 1) {
    return null;
  }

  const pts = tracker.corners.map((p) => ({
    x: (p.x / analysisWidth) * 100,
    y: (p.y / analysisHeight) * 100,
  }));
  const poly = pts.map((p) => `${p.x},${p.y}`).join(' ');
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
  const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
  const color = tracker.isStable ? '#7CFFB2' : '#FFB347';
  const confidencePct = Math.round(Math.min(1, Math.max(0, tracker.confidence)) * 100);
  const stabilityPct = Math.round(tracker.stabilityPercentage);
  const progress = Math.min(1, tracker.stableFrames / Math.max(1, tracker.requiredStableFrames));
  const status = tracker.isStable ? 'READY — HOLD STEADY' : 'Hold steady...';

  return (
    <g className="scanner-tracker-overlay" pointerEvents="none">
      <polygon
        points={poly}
        fill="none"
        stroke="rgba(0,0,0,0.75)"
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
      <polygon
        points={poly}
        fill={tracker.isStable ? 'rgba(124,255,178,0.10)' : 'rgba(255,179,71,0.10)'}
        stroke={color}
        strokeWidth={1.15}
        strokeLinejoin="round"
      />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={2.4} fill="rgba(0,0,0,0.85)" />
          <circle cx={p.x} cy={p.y} r={1.35} fill={color} />
        </g>
      ))}
      <rect
        x={cx - 22}
        y={cy + 4}
        width={44}
        height={16}
        rx={2.2}
        fill="rgba(0,0,0,0.78)"
      />
      <text
        x={cx}
        y={cy + 8.2}
        textAnchor="middle"
        fill="#ffffff"
        fontSize="3.1"
        fontWeight="700"
      >
        {confidencePct}% confidence
      </text>
      <text
        x={cx}
        y={cy + 12.2}
        textAnchor="middle"
        fill="#ffffff"
        fontSize="3.1"
        fontWeight="700"
      >
        {stabilityPct}% stable
      </text>
      <text
        x={cx}
        y={cy + 16.2}
        textAnchor="middle"
        fill={color}
        fontSize="2.8"
        fontWeight="800"
      >
        {status}
      </text>
      <rect x={cx - 18} y={cy + 18.4} width={36} height={1.5} rx={0.7} fill="rgba(0,0,0,0.65)" />
      <rect
        x={cx - 18}
        y={cy + 18.4}
        width={36 * progress}
        height={1.5}
        rx={0.7}
        fill={color}
      />
    </g>
  );
}

export function ScannerOverlay({
  level,
  guideBox,
  detectedBox,
  alignment,
  showLevel,
  tracker = emptyTrackerSnapshot(),
  analysisSize,
}: ScannerOverlayProps) {
  const phoneLevel = showLevel && level.isLevel;
  const cardReady = alignment.fitsGuide || tracker.isStable;
  const ready = !showLevel || (phoneLevel && cardReady);

  const guide = boxToSvg(guideBox);
  const hasTrackedQuad = tracker.corners.length === 4;
  const detected = !hasTrackedQuad && detectedBox ? boxToSvg(detectedBox) : null;

  const guideColor = '#ffffff';
  const detectedColor = !detectedBox && !hasTrackedQuad
    ? '#adb5bd'
    : showLevel && cardReady
      ? '#78c285'
      : '#e77d31';

  const cx = guide.x + guide.w / 2;
  const cy = guide.y + guide.h / 2;

  return (
    <div className="scanner-overlay">
      <svg className="scanner-overlay-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        {detected && (
          <>
            <rect
              x={detected.x}
              y={detected.y}
              width={detected.w}
              height={detected.h}
              fill="rgba(231, 125, 49, 0.18)"
              stroke="none"
            />
            <rect
              x={detected.x}
              y={detected.y}
              width={detected.w}
              height={detected.h}
              fill="none"
              stroke={detectedColor}
              strokeWidth={1.2}
              className={`scanner-detected-box ${ready ? 'ready' : 'adjust'}`}
            />
          </>
        )}

        <CardTrackerOverlay
          tracker={tracker}
          analysisWidth={analysisSize?.width}
          analysisHeight={analysisSize?.height}
        />

        <rect
          x={guide.x}
          y={guide.y}
          width={guide.w}
          height={guide.h}
          fill="none"
          stroke={guideColor}
          strokeWidth={0.45}
          strokeDasharray="1.2 0.8"
          className="scanner-guide-box"
        />

        {showLevel && phoneLevel && detectedBox && !cardReady && (
          <g className="scanner-alignment-hint" stroke="#e77d31" strokeWidth={0.35} opacity={0.9}>
            {Math.abs(alignment.offsetX) > 0.03 && (
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#e77d31"
                fontSize="3.5"
                fontWeight="700"
              >
                {alignment.offsetX > 0 ? '←' : '→'}
              </text>
            )}
            {Math.abs(alignment.offsetY) > 0.03 && Math.abs(alignment.offsetX) <= 0.03 && (
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#e77d31"
                fontSize="3.5"
                fontWeight="700"
              >
                {alignment.offsetY > 0 ? '↑' : '↓'}
              </text>
            )}
          </g>
        )}
      </svg>

      {showLevel && ready && (
        <div className="scanner-level-badge level-ok">
          <span className="scanner-level-icon">✓</span> Ready
        </div>
      )}
    </div>
  );
}
