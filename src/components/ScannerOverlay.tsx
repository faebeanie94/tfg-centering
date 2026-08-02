import type { DetectedCard } from '../lib/card-edge-detect';
import type { LevelState } from '../hooks/useDeviceLevel';

interface ScannerOverlayProps {
  level: LevelState;
  cardBox: DetectedCard;
  detected: boolean;
  showLevel: boolean;
  progress?: number;
}

export function ScannerOverlay({ level, cardBox, detected, showLevel, progress = 0 }: ScannerOverlayProps) {
  const isLevel = showLevel && level.isLevel;
  const color = !showLevel ? '#ffffff' : isLevel ? '#22c55e' : '#f97316';
  const { left, top, width, height } = cardBox;
  const cx = (left + width / 2) * 100;
  const cy = (top + height / 2) * 100;

  return (
    <div className="scanner-overlay">
      <svg className="scanner-overlay-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect
          x={left * 100}
          y={top * 100}
          width={width * 100}
          height={height * 100}
          fill="none"
          stroke={color}
          strokeWidth={0.5}
          className={`scanner-edge-box ${showLevel ? (isLevel ? 'level-ok' : 'level-bad') : 'guide-only'} ${detected ? 'detected' : 'guide'}`}
        />

        {showLevel && !isLevel && (
          <g className="scanner-crosshair" stroke={color} strokeWidth={0.3} opacity={0.85}>
            <line x1={cx} y1={top * 100} x2={cx} y2={(top + height) * 100} />
            <line x1={left * 100} y1={cy} x2={(left + width) * 100} y2={cy} />
          </g>
        )}

        {progress > 0 && (
          <circle
            cx={cx}
            cy={cy}
            r={Math.min(width, height) * 50}
            fill="none"
            stroke="#22c55e"
            strokeWidth={0.5}
            strokeDasharray={`${progress * 160} 160`}
            transform={`rotate(-90 ${cx} ${cy})`}
            opacity={0.8}
          />
        )}
      </svg>

      {showLevel && isLevel && (
        <div className="scanner-level-badge level-ok">
          <span className="scanner-level-icon">✓</span> Level
        </div>
      )}
    </div>
  );
}
