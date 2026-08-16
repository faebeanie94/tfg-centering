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
  /** Preview width/height so dashes are not stretched into blocks on a tall phone. */
  frameAspect?: number;
}

function boxToSvg(box: DetectedCard, vbW: number, vbH: number) {
  return {
    x: box.left * vbW,
    y: box.top * vbH,
    w: box.width * vbW,
    h: box.height * vbH,
  };
}

export function ScannerOverlay({
  level,
  guideBox,
  detectedBox,
  alignment,
  showLevel,
  progress = 0,
  frameAspect = 3 / 4,
}: ScannerOverlayProps) {
  const phoneLevel = showLevel && level.isLevel;
  const cardReady = alignment.fitsGuide;
  const ready = !showLevel || (phoneLevel && cardReady);

  const fa = frameAspect > 0.15 && Number.isFinite(frameAspect) ? frameAspect : 3 / 4;
  const vbH = 100;
  const vbW = 100 * fa;

  const guide = boxToSvg(guideBox, vbW, vbH);
  const detected = detectedBox ? boxToSvg(detectedBox, vbW, vbH) : null;

  const guideColor = '#ffffff';
  const detectedColor = !detectedBox
    ? '#adb5bd'
    : showLevel && cardReady
      ? '#78c285'
      : '#e77d31';

  const cx = guide.x + guide.w / 2;
  const cy = guide.y + guide.h / 2;
  const stroke = Math.max(0.35, Math.min(vbW, vbH) * 0.0045);

  return (
    <div className="scanner-overlay">
      <svg
        className="scanner-overlay-svg"
        viewBox={`0 0 ${vbW} ${vbH}`}
        preserveAspectRatio="none"
      >
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
              strokeWidth={stroke * 1.35}
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
          strokeWidth={stroke}
          strokeDasharray={`${stroke * 3.2} ${stroke * 2.4}`}
          strokeLinejoin="round"
          className="scanner-guide-box"
        />

        {showLevel && phoneLevel && detectedBox && !cardReady && (
          <g className="scanner-alignment-hint" stroke="#e77d31" strokeWidth={stroke} opacity={0.9}>
            {Math.abs(alignment.offsetX) > 0.03 && (
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#e77d31"
                fontSize={Math.min(vbW, vbH) * 0.045}
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
                fontSize={Math.min(vbW, vbH) * 0.045}
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
            r={Math.min(detected.w, detected.h) * 0.45}
            fill="none"
            stroke="#78c285"
            strokeWidth={stroke}
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
