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

export function PerspectiveCorrector({ imageSrc, onComplete, onSkip, onCancel }: PerspectiveCorrectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [displayScale, setDisplayScale] = useState(1);
  const [corners, setCorners] = useState<QuadCorners | null>(null);
  const [dragging, setDragging] = useState<CornerKey | null>(null);
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

  const handlePointerDown = useCallback(
    (key: CornerKey, e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      if (!corners) return;
      dragStartRef.current = { x: e.clientX, y: e.clientY, corners: { ...corners, [key]: { ...corners[key] } } };
      setDragging(key);
    },
    [corners],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging || !dragStartRef.current || !imageSize) return;
      const dx = (e.clientX - dragStartRef.current.x) / displayScale;
      const dy = (e.clientY - dragStartRef.current.y) / displayScale;
      const start = dragStartRef.current.corners[dragging];
      setCorners((prev) =>
        prev
          ? {
              ...prev,
              [dragging]: {
                x: Math.max(0, Math.min(imageSize.width, start.x + dx)),
                y: Math.max(0, Math.min(imageSize.height, start.y + dy)),
              },
            }
          : prev,
      );
    },
    [dragging, displayScale, imageSize],
  );

  const handlePointerUp = useCallback(() => {
    dragStartRef.current = null;
    setDragging(null);
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
  const cornerList: Array<{ key: CornerKey; label: string }> = [
    { key: 'tl', label: 'TL' },
    { key: 'tr', label: 'TR' },
    { key: 'br', label: 'BR' },
    { key: 'bl', label: 'BL' },
  ];

  const points = [corners.tl, corners.tr, corners.br, corners.bl, corners.tl];
  const linePoints = points.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="perspective">
      <div className="perspective-header">
        <button type="button" className="btn btn-secondary btn-small" onClick={onCancel}>
          ← Cancel
        </button>
        <h2>Perspective Fix</h2>
      </div>

      <p className="perspective-hint">
        Drag the four corners to the card edges. This flattens skewed photos before measuring borders.
      </p>

      <div
        ref={containerRef}
        className="editor-canvas"
        style={{ height: displayHeight }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <img src={imageSrc} alt="Card to correct" draggable={false} style={{ width: '100%' }} />

        <svg
          className="editor-overlay"
          viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
          preserveAspectRatio="none"
        >
          <polygon points={linePoints} fill="rgba(59,130,246,0.15)" stroke="#3b82f6" strokeWidth={3} strokeDasharray="8 4" />
        </svg>

        <div className="handles-layer">
          {cornerList.map(({ key, label }) => (
            <div
              key={key}
              className="handle handle-perspective"
              style={{
                left: corners[key].x * displayScale - 18,
                top: corners[key].y * displayScale - 18,
              }}
              onPointerDown={(e) => handlePointerDown(key, e)}
            >
              {label}
            </div>
          ))}
        </div>
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
