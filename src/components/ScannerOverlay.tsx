import type { CardAlignmentState } from '../lib/card-alignment';
import type { DetectedCard } from '../lib/card-edge-detect';
import type { LevelState } from '../hooks/useDeviceLevel';

interface ScannerOverlayProps {
  level: LevelState;
  guideBox: DetectedCard;
  detectedBox: DetectedCard | null;
  alignment: CardAlignmentState;
  showLevel: boolean;
  progress?: number;
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
  progress = 0,
}: ScannerOverlayProps) {
  const phoneLevel = showLevel && level.isLevel;
  const cardReady = alignment.fitsGuide;
  const ready = !showLevel || (phoneLevel && cardReady);

  const guide = boxToSvg(guideBox);
  const detected = detectedBox ? boxToSvg(detectedBox) : null;

  const guideColor = '#ffffff';
  const detectedColor = !detectedBox
    ? '#94a3b8'
    : showLevel && cardReady
      ? '#22c55e'
      : '#f97316';

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
              fill="rgba(249, 115, 22, 0.18)"
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
          <g className="scanner-alignment-hint" stroke="#f97316" strokeWidth={0.35} opacity={0.9}>
            {Math.abs(alignment.offsetX) > 0.03 && (
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#f97316"
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
                fill="#f97316"
                fontSize="3.5"
                fontWeight="700"
              >
                {alignment.offsetY > 0 ? '↑' : '↓'}
              </text>
            )}
          </g>
        )}

        {progress > 0 && detected && (
          <circle
            cx={detected.x + detected.w / 2}
            cy={detected.y + detected.h / 2}
            r={Math.min(detected.w, detected.h) * 50}
            fill="none"
            stroke="#22c55e"
            strokeWidth={0.5}
            strokeDasharray={`${progress * 160} 160`}
            transform={`rotate(-90 ${detected.x + detected.w / 2} ${detected.y + detected.h / 2})`}
            opacity={0.8}
          />
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
