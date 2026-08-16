import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  type CornerKey,
  type QuadCorners,
  defaultCorners,
  perspectiveCorrect,
} from '../lib/perspective';
import { detectCardCornersFromImage } from '../lib/auto-crop';
import { useFitScale, useAppShellMode } from '../hooks/useFitScale';

interface PerspectiveCorrectorProps {
  imageSrc: string;
  invertColors?: boolean;
  /** Pre-detected corners from auto-crop (pixel coords). */
  initialCorners?: QuadCorners | null;
  /** Portrait width/height for the selected card format. */
  cardAspect?: number;
  onComplete: (correctedSrc: string) => void;
  onSkip: () => void;
  onCancel: () => void;
}

const CORNERS: Array<{ key: CornerKey; label: string; arrow: string }> = [
  { key: 'tl', label: 'TL', arrow: '↖' },
  { key: 'tr', label: 'TR', arrow: '↗' },
  { key: 'bl', label: 'BL', arrow: '↙' },
  { key: 'br', label: 'BR', arrow: '↘' },
];

const LOUPE_SIZE = 112;
const LOUPE_ZOOM = 1.25;

/** Convert desired on-screen pixels to SVG/image coordinate units. */
function screenPx(px: number, displayScale: number) {
  return px / Math.max(displayScale, 0.02);
}

function cornerAtPoint(corners: QuadCorners, x: number, y: number, hitRadius: number): CornerKey | null {
  for (const { key } of CORNERS) {
    const p = corners[key];
    if (Math.hypot(p.x - x, p.y - y) <= hitRadius) return key;
  }
  return null;
}

export function PerspectiveCorrector({
  imageSrc,
  invertColors = false,
  initialCorners = null,
  cardAspect,
  onComplete,
  onSkip,
  onCancel,
}: PerspectiveCorrectorProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [corners, setCorners] = useState<QuadCorners | null>(null);
  const [selectedCorner, setSelectedCorner] = useState<CornerKey>('tl');
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; corners: QuadCorners } | null>(null);

  useAppShellMode('editor-mode', true);
  const displayScale = useFitScale(viewportRef, imageSize);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = async () => {
      if (cancelled) return;
      const size = { width: img.naturalWidth, height: img.naturalHeight };
      // Set size + corners together so the viewport mounts immediately and
      // useFitScale can measure it (waiting on async detect left scale stuck).
      const fallback = initialCorners ?? defaultCorners(size.width, size.height);
      setImageSize(size);
      setCorners(fallback);

      if (!initialCorners) {
        try {
          const detected = await detectCardCornersFromImage(imageSrc, undefined, {
            cardAspect,
          });
          if (!cancelled && detected) setCorners(detected.corners);
        } catch {
          // keep fallback corners
        }
      }

      bitmapRef.current?.close();
      try {
        bitmapRef.current = await createImageBitmap(img);
      } catch {
        bitmapRef.current = null;
      }
    };
    img.src = imageSrc;
    return () => {
      cancelled = true;
      bitmapRef.current?.close();
      bitmapRef.current = null;
    };
  }, [imageSrc, initialCorners]);

  const drawLoupe = useCallback(
    (corner: CornerKey) => {
      const canvas = loupeCanvasRef.current;
      const bitmap = bitmapRef.current;
      const img = imageRef.current;
      if (!canvas || !corners || !imageSize) return;
      const source = bitmap ?? img;
      if (!source) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = LOUPE_SIZE * dpr;
      canvas.height = LOUPE_SIZE * dpr;
      canvas.style.width = `${LOUPE_SIZE}px`;
      canvas.style.height = `${LOUPE_SIZE}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;

      const { x: cx, y: cy } = corners[corner];
      const srcSize = LOUPE_SIZE / LOUPE_ZOOM;

      ctx.clearRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
      ctx.save();
      ctx.beginPath();
      ctx.arc(LOUPE_SIZE / 2, LOUPE_SIZE / 2, LOUPE_SIZE / 2 - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(
        source,
        cx - srcSize / 2,
        cy - srcSize / 2,
        srcSize,
        srcSize,
        0,
        0,
        LOUPE_SIZE,
        LOUPE_SIZE,
      );

      const center = LOUPE_SIZE / 2;
      ctx.strokeStyle = '#e77d31';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(center, 0);
      ctx.lineTo(center, LOUPE_SIZE);
      ctx.moveTo(0, center);
      ctx.lineTo(LOUPE_SIZE, center);
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(center, center, 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = '#e77d31';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(LOUPE_SIZE / 2, LOUPE_SIZE / 2, LOUPE_SIZE / 2 - 1.5, 0, Math.PI * 2);
      ctx.stroke();
    },
    [corners, imageSize],
  );

  // Draw before paint so the loupe is never an empty circle on first drag frame.
  useLayoutEffect(() => {
    if (dragging && corners) drawLoupe(selectedCorner);
  }, [dragging, corners, selectedCorner, drawLoupe]);

  const beginDrag = useCallback(
    (clientX: number, clientY: number, corner: CornerKey) => {
      if (!corners) return;
      setSelectedCorner(corner);
      dragStartRef.current = {
        x: clientX,
        y: clientY,
        corners: {
          tl: { ...corners.tl },
          tr: { ...corners.tr },
          br: { ...corners.br },
          bl: { ...corners.bl },
        },
      };
      setDragging(true);
    },
    [corners],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!corners || !imageSize || !containerRef.current) return;
      e.preventDefault();
      containerRef.current.setPointerCapture(e.pointerId);

      const rect = containerRef.current.getBoundingClientRect();
      const imageX = (e.clientX - rect.left) / displayScale;
      const imageY = (e.clientY - rect.top) / displayScale;
      const hitRadius = screenPx(26, displayScale);
      const hit = cornerAtPoint(corners, imageX, imageY, hitRadius);

      beginDrag(e.clientX, e.clientY, hit ?? selectedCorner);
    },
    [corners, imageSize, displayScale, selectedCorner, beginDrag],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging || !dragStartRef.current || !imageSize) return;
      const dx = (e.clientX - dragStartRef.current.x) / displayScale;
      const dy = (e.clientY - dragStartRef.current.y) / displayScale;
      const start = dragStartRef.current.corners[selectedCorner];
      setCorners((prev) =>
        prev
          ? {
              ...prev,
              [selectedCorner]: {
                x: Math.max(0, Math.min(imageSize.width, start.x + dx)),
                y: Math.max(0, Math.min(imageSize.height, start.y + dy)),
              },
            }
          : prev,
      );
    },
    [dragging, displayScale, imageSize, selectedCorner],
  );

  const handlePointerUp = useCallback(() => {
    dragStartRef.current = null;
    setDragging(false);
  }, []);

  const selectCorner = useCallback((key: CornerKey) => {
    setSelectedCorner(key);
  }, []);

  async function applyCorrection() {
    if (!corners) return;
    setProcessing(true);
    try {
      const corrected = await perspectiveCorrect(imageSrc, corners, cardAspect);
      onComplete(corrected);
    } catch {
      onComplete(imageSrc);
    } finally {
      setProcessing(false);
    }
  }

  if (!imageSize || !corners) {
    return <div className="loading">Loading image…</div>;
  }

  const displayHeight = imageSize.height * displayScale;
  const displayWidth = imageSize.width * displayScale;
  const crosshairArm = screenPx(16, displayScale);
  const crosshairStroke = screenPx(1.75, displayScale);
  const crosshairStrokeActive = screenPx(2.25, displayScale);
  const guideStroke = screenPx(1.25, displayScale);
  const hitRadius = screenPx(26, displayScale);
  const hubRadius = screenPx(5, displayScale);
  const hubStroke = screenPx(1.25, displayScale);
  const hubStrokeActive = screenPx(1.75, displayScale);
  const centerDot = screenPx(2, displayScale);
  const outlineExtra = screenPx(0.75, displayScale);
  const points = [corners.tl, corners.tr, corners.br, corners.bl, corners.tl];
  const linePoints = points.map((p) => `${p.x},${p.y}`).join(' ');
  const active = corners[selectedCorner];
  const fitted = displayScale > 0;

  return (
    <div className="perspective editor-shell">
      <div className="perspective-header">
        <button type="button" className="btn btn-secondary btn-small" onClick={onCancel}>
          ← Cancel
        </button>
        <h2>Perspective Fix</h2>
      </div>

      <div ref={viewportRef} className="editor-viewport perspective-viewport">
        {!fitted ? (
          <div className="loading">Fitting image…</div>
        ) : (
        <div
          ref={containerRef}
          className="editor-canvas perspective-canvas"
          style={{ width: displayWidth, height: displayHeight }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <img
            ref={imageRef}
            src={imageSrc}
            alt="Card to correct"
            draggable={false}
            className={invertColors ? 'editor-image-inverted' : undefined}
            style={{ width: '100%', height: '100%' }}
          />

          <svg
            className="editor-overlay perspective-overlay"
            viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
            preserveAspectRatio="none"
          >
            <polygon
              points={linePoints}
              fill="rgba(59,130,246,0.12)"
              stroke="#49a3e1"
              strokeWidth={2}
              strokeDasharray="8 4"
            />

            <line
              x1={active.x}
              y1={0}
              x2={active.x}
              y2={imageSize.height}
              className="perspective-guide-line"
              strokeWidth={guideStroke}
            />
            <line
              x1={0}
              y1={active.y}
              x2={imageSize.width}
              y2={active.y}
              className="perspective-guide-line"
              strokeWidth={guideStroke}
            />

            {CORNERS.map(({ key }) => {
              const p = corners[key];
              const isActive = key === selectedCorner;
              const color = isActive ? '#e77d31' : '#ffffff';
              const stroke = isActive ? crosshairStrokeActive : crosshairStroke;
              const outline = outlineExtra;
              return (
                <g key={key} className={`perspective-crosshair ${isActive ? 'active' : ''}`}>
                  <line
                    x1={p.x - crosshairArm}
                    y1={p.y}
                    x2={p.x + crosshairArm}
                    y2={p.y}
                    stroke="#000"
                    strokeWidth={stroke + outline * 2}
                    strokeOpacity={0.45}
                    strokeLinecap="round"
                  />
                  <line
                    x1={p.x}
                    y1={p.y - crosshairArm}
                    x2={p.x}
                    y2={p.y + crosshairArm}
                    stroke="#000"
                    strokeWidth={stroke + outline * 2}
                    strokeOpacity={0.45}
                    strokeLinecap="round"
                  />
                  <line
                    x1={p.x - crosshairArm}
                    y1={p.y}
                    x2={p.x + crosshairArm}
                    y2={p.y}
                    stroke={color}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                  />
                  <line
                    x1={p.x}
                    y1={p.y - crosshairArm}
                    x2={p.x}
                    y2={p.y + crosshairArm}
                    stroke={color}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={hitRadius}
                    fill="transparent"
                    className="perspective-crosshair-hit"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      selectCorner(key);
                      beginDrag(e.clientX, e.clientY, key);
                      containerRef.current?.setPointerCapture(e.pointerId);
                    }}
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={hubRadius}
                    fill="rgba(0,0,0,0.28)"
                    stroke={color}
                    strokeWidth={isActive ? hubStrokeActive : hubStroke}
                    pointerEvents="none"
                  />
                  <circle cx={p.x} cy={p.y} r={centerDot} fill={color} pointerEvents="none" />
                </g>
              );
            })}
          </svg>
        </div>
        )}

        {fitted && dragging && (
          <div
            className={`perspective-loupe-dock ${
              selectedCorner === 'tl' || selectedCorner === 'tr' ? 'dock-bottom' : 'dock-top'
            }`}
            aria-label="Magnified corner view"
          >
            <span className="perspective-loupe-label">
              {CORNERS.find((c) => c.key === selectedCorner)?.label} corner
            </span>
            <div className="perspective-loupe" style={{ width: LOUPE_SIZE, height: LOUPE_SIZE }}>
              <canvas ref={loupeCanvasRef} />
            </div>
          </div>
        )}
      </div>

      <div className="perspective-corner-tabs">
        {CORNERS.map(({ key, label, arrow }) => (
          <button
            key={key}
            type="button"
            className={`perspective-corner-tab ${selectedCorner === key ? 'active' : ''}`}
            onClick={() => selectCorner(key)}
          >
            {label} {arrow}
          </button>
        ))}
      </div>

      <div className="perspective-actions">
        <button type="button" className="btn btn-secondary" onClick={onSkip} disabled={processing}>
          Skip
        </button>
        <button type="button" className="btn btn-primary btn-large" onClick={applyCorrection} disabled={processing}>
          {processing ? 'Processing…' : 'Apply & Continue'}
        </button>
      </div>
    </div>
  );
}
