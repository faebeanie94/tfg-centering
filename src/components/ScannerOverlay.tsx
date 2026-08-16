import type { CardAlignmentState } from '../lib/card-alignment';
import type { DetectedCard } from '../lib/card-edge-detect';
import type { LevelState } from '../hooks/useDeviceLevel';

interface ScannerOverlayProps {
  level: LevelState;
  guideBox: DetectedCard;
  detectedBox: DetectedCard | null;
  alignment: CardAlignmentState;
  showLevel: boolean;
}

function boxToSvg(box: DetectedCard) {
  return {
    x: box.left * 100,
    y: box.top * 100,
    w: box.width * 100,
    h: box.height * 100,
  };
}

export function ScannerOverlay({
  level,
  guideBox,
  detectedBox,
  alignment,
  showLevel,
}: ScannerOverlayProps) {
  const phoneLevel = showLevel && level.isLevel;
  const cardReady = alignment.fitsGuide;
  const ready = !showLevel || (phoneLevel && cardReady);

  const guide = boxToSvg(guideBox);
  const cx = guide.x + guide.w / 2;
  const cy = guide.y + guide.h / 2;

  return (
    <div className="scanner-overlay">
      <svg className="scanner-overlay-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect
          x={guide.x}
          y={guide.y}
          width={guide.w}
          height={guide.h}
          fill="none"
          stroke="#ffffff"
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
