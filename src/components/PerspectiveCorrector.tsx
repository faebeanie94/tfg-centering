import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type CornerKey,
  type QuadCorners,
  defaultCorners,
  perspectiveCorrect,
} from '../lib/perspective';

interface PerspectiveCorrectorProps {
  imageSrc: string;
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

const CROSSHAIR_ARM = 48;
const LOUPE_SIZE = 140;
const LOUPE_ZOOM = 3;

function cornerAtPoint(corners: QuadCorners, x: number, y: number, hitRadius: number): CornerKey | null {
  for (const { key } of CORNERS) {
    const p = corners[key];
    if (Math.hypot(p.x - x, p.y - y) <= hitRadius) return key;
  }
  return null;
}

export function PerspectiveCorrector({ imageSrc, onComplete, onSkip, onCancel }: PerspectiveCorrectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [displayScale, setDisplayScale] = useState(1);
  const [corners, setCorners] = useState<QuadCorners | null>(null);
  const [selectedCorner, setSelectedCorner] = useState<CornerKey>('tl');
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; corners: QuadCorners } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const size = { width: img.naturalWidth, height: img.naturalHeight };
      setImageSize(size);
      setCorners(defaultCorners(size.width, size.height));
    };
    img.src = imageSrc;
  }, [imageSrc]);

  useEffect(() => {
    function updateScale() {
      if (!containerRef.current || !imageSize) return;
      setDisplayScale(containerRef.current.clientWidth / imageSize.width);
    }
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [imageSize]);

  const drawLoupe = useCallback(
    (corner: CornerKey) => {
      const canvas = loupeCanvasRef.current;
      const img = imageRef.current;
      if (!canvas || !img || !corners || !imageSize) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = LOUPE_SIZE * dpr;
      canvas.height = LOUPE_SIZE * dpr;
      canvas.style.width = `${LOUPE_SIZE}px`;
      canvas.style.height = `${LOUPE_SIZE}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const { x: cx, y: cy } = corners[corner];
      const srcSize = LOUPE_SIZE / LOUPE_ZOOM;

      ctx.clearRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
      ctx.save();
      ctx.beginPath();
      ctx.arc(LOUPE_SIZE / 2, LOUPE_SIZE / 2, LOUPE_SIZE / 2 - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(
        img,
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
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(center, 0);
      ctx.lineTo(center, LOUPE_SIZE);
      ctx.moveTo(0, center);
      ctx.lineTo(LOUPE_SIZE, center);
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(center, center, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(LOUPE_SIZE / 2, LOUPE_SIZE / 2, LOUPE_SIZE / 2 - 1.5, 0, Math.PI * 2);
      ctx.stroke();
    },
    [corners, imageSize],
  );

  useEffect(() => {
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
      const hitRadius = 36 / displayScale;
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
      const corrected = await perspectiveCorrect(imageSrc, corners);
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
  const points = [corners.tl, corners.tr, corners.br, corners.bl, corners.tl];
  const linePoints = points.map((p) => `${p.x},${p.y}`).join(' ');
  const active = corners[selectedCorner];

  const canvasWidth = imageSize.width * displayScale;
  const loupeLeft = Math.max(8, Math.min(active.x * displayScale - LOUPE_SIZE / 2, canvasWidth - LOUPE_SIZE - 8));
  const loupeTop = Math.max(8, active.y * displayScale - LOUPE_SIZE - 20);

  return (
    <div className="perspective">
      <div className="perspective-header">
        <button type="button" className="btn btn-secondary btn-small" onClick={onCancel}>
          ← Cancel
        </button>
        <h2>Perspective Fix</h2>
      </div>

      <p className="perspective-hint">
        Place the centre of each cross on a card corner. Drag anywhere to move the selected marker, or pick a corner below.
      </p>

      <div
        ref={containerRef}
        className="editor-canvas perspective-canvas"
        style={{ height: displayHeight }}
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
          style={{ width: '100%' }}
        />

        <svg
          className="editor-overlay perspective-overlay"
          viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
          preserveAspectRatio="none"
        >
          <polygon
            points={linePoints}
            fill="rgba(59,130,246,0.12)"
            stroke="#3b82f6"
            strokeWidth={2}
            strokeDasharray="8 4"
          />

          <line
            x1={active.x}
            y1={0}
            x2={active.x}
            y2={imageSize.height}
            className="perspective-guide-line"
          />
          <line
            x1={0}
            y1={active.y}
            x2={imageSize.width}
            y2={active.y}
            className="perspective-guide-line"
          />

          {CORNERS.map(({ key }) => {
            const p = corners[key];
            const isActive = key === selectedCorner;
            const color = isActive ? '#ef4444' : '#ffffff';
            return (
              <g key={key} className={`perspective-crosshair ${isActive ? 'active' : ''}`}>
                <line
                  x1={p.x - CROSSHAIR_ARM}
                  y1={p.y}
                  x2={p.x + CROSSHAIR_ARM}
                  y2={p.y}
                  stroke={color}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                <line
                  x1={p.x}
                  y1={p.y - CROSSHAIR_ARM}
                  x2={p.x}
                  y2={p.y + CROSSHAIR_ARM}
                  stroke={color}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={28}
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
                  r={16}
                  fill="rgba(0,0,0,0.25)"
                  stroke={color}
                  strokeWidth={isActive ? 2.5 : 2}
                  pointerEvents="none"
                />
                <circle cx={p.x} cy={p.y} r={3} fill={color} pointerEvents="none" />
              </g>
            );
          })}
        </svg>

        {dragging && (
          <div
            className="perspective-loupe"
            style={{ left: loupeLeft, top: loupeTop, width: LOUPE_SIZE, height: LOUPE_SIZE }}
          >
            <canvas ref={loupeCanvasRef} />
          </div>
        )}

        {dragging && (
          <div className="perspective-drag-hint">Drag anywhere</div>
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
