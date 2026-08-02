import { useCallback, useEffect, useRef, useState } from 'react';
import type { Rect } from '../lib/centering';
import { cropImage, defaultCropRect } from '../lib/crop-image';

interface CropEditorProps {
  imageSrc: string;
  invertColors?: boolean;
  onComplete: (croppedSrc: string) => void;
  onCancel: () => void;
}

type DragTarget =
  | { edge: 'left' | 'right' | 'top' | 'bottom' }
  | { corner: 'tl' | 'tr' | 'bl' | 'br' }
  | null;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function CropEditor({ imageSrc, invertColors = false, onComplete, onCancel }: CropEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [displayScale, setDisplayScale] = useState(1);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [dragging, setDragging] = useState<DragTarget>(null);
  const [processing, setProcessing] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; rect: Rect } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const size = { width: img.naturalWidth, height: img.naturalHeight };
      setImageSize(size);
      setCrop(defaultCropRect(size.width, size.height));
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
    (target: DragTarget, e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      if (!crop) return;
      dragStartRef.current = { x: e.clientX, y: e.clientY, rect: { ...crop } };
      setDragging(target);
    },
    [crop],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging || !dragStartRef.current || !imageSize) return;

      const dx = (e.clientX - dragStartRef.current.x) / displayScale;
      const dy = (e.clientY - dragStartRef.current.y) / displayScale;
      const r = dragStartRef.current.rect;
      let next: Rect = { ...r };

      if ('edge' in dragging) {
        switch (dragging.edge) {
          case 'left':
            next.x = clamp(r.x + dx, 0, r.x + r.width - 40);
            next.width = r.width - (next.x - r.x);
            break;
          case 'right':
            next.width = clamp(r.width + dx, 40, imageSize.width - r.x);
            break;
          case 'top':
            next.y = clamp(r.y + dy, 0, r.y + r.height - 40);
            next.height = r.height - (next.y - r.y);
            break;
          case 'bottom':
            next.height = clamp(r.height + dy, 40, imageSize.height - r.y);
            break;
        }
      } else if ('corner' in dragging) {
        switch (dragging.corner) {
          case 'tl':
            next.x = clamp(r.x + dx, 0, r.x + r.width - 40);
            next.y = clamp(r.y + dy, 0, r.y + r.height - 40);
            next.width = r.width - (next.x - r.x);
            next.height = r.height - (next.y - r.y);
            break;
          case 'tr':
            next.y = clamp(r.y + dy, 0, r.y + r.height - 40);
            next.width = clamp(r.width + dx, 40, imageSize.width - r.x);
            next.height = r.height - (next.y - r.y);
            break;
          case 'bl':
            next.x = clamp(r.x + dx, 0, r.x + r.width - 40);
            next.width = r.width - (next.x - r.x);
            next.height = clamp(r.height + dy, 40, imageSize.height - r.y);
            break;
          case 'br':
            next.width = clamp(r.width + dx, 40, imageSize.width - r.x);
            next.height = clamp(r.height + dy, 40, imageSize.height - r.y);
            break;
        }
      }

      setCrop(next);
    },
    [dragging, displayScale, imageSize],
  );

  const handlePointerUp = useCallback(() => {
    dragStartRef.current = null;
    setDragging(null);
  }, []);

  async function applyCrop() {
    if (!crop) return;
    setProcessing(true);
    try {
      const cropped = await cropImage(imageSrc, crop);
      onComplete(cropped);
    } catch {
      onComplete(imageSrc);
    } finally {
      setProcessing(false);
    }
  }

  if (!imageSize || !crop) {
    return <div className="loading">Loading image…</div>;
  }

  const displayHeight = imageSize.height * displayScale;

  const handles: Array<{ target: DragTarget; style: React.CSSProperties; label?: string }> = [
    { target: { corner: 'tl' }, style: { left: crop.x * displayScale - 14, top: crop.y * displayScale - 14 } },
    { target: { corner: 'tr' }, style: { left: (crop.x + crop.width) * displayScale - 14, top: crop.y * displayScale - 14 } },
    { target: { corner: 'bl' }, style: { left: crop.x * displayScale - 14, top: (crop.y + crop.height) * displayScale - 14 } },
    { target: { corner: 'br' }, style: { left: (crop.x + crop.width) * displayScale - 14, top: (crop.y + crop.height) * displayScale - 14 } },
    { target: { edge: 'top' }, style: { left: (crop.x + crop.width / 2) * displayScale - 14, top: crop.y * displayScale - 14 }, label: '↕' },
    { target: { edge: 'bottom' }, style: { left: (crop.x + crop.width / 2) * displayScale - 14, top: (crop.y + crop.height) * displayScale - 14 }, label: '↕' },
    { target: { edge: 'left' }, style: { left: crop.x * displayScale - 14, top: (crop.y + crop.height / 2) * displayScale - 14 }, label: '↔' },
    { target: { edge: 'right' }, style: { left: (crop.x + crop.width) * displayScale - 14, top: (crop.y + crop.height / 2) * displayScale - 14 }, label: '↔' },
  ];

  return (
    <div className="perspective">
      <div className="perspective-header">
        <button type="button" className="btn btn-secondary btn-small" onClick={onCancel}>
          ← Cancel
        </button>
        <h2>Crop Image</h2>
      </div>

      <p className="perspective-hint">Drag the handles to crop around the card.</p>

      <div
        ref={containerRef}
        className="editor-canvas"
        style={{ height: displayHeight }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <img
          src={imageSrc}
          alt="Crop preview"
          draggable={false}
          className={invertColors ? 'editor-image-inverted' : undefined}
          style={{ width: '100%' }}
        />

        <svg className="editor-overlay" viewBox={`0 0 ${imageSize.width} ${imageSize.height}`} preserveAspectRatio="none">
          <defs>
            <mask id="crop-mask">
              <rect x="0" y="0" width={imageSize.width} height={imageSize.height} fill="white" />
              <rect x={crop.x} y={crop.y} width={crop.width} height={crop.height} fill="black" />
            </mask>
          </defs>
          <rect x="0" y="0" width={imageSize.width} height={imageSize.height} fill="rgba(0,0,0,0.55)" mask="url(#crop-mask)" />
          <rect x={crop.x} y={crop.y} width={crop.width} height={crop.height} fill="none" stroke="#3b82f6" strokeWidth={3} />
        </svg>

        <div className="handles-layer">
          {handles.map(({ target, style, label }, i) => (
            <div
              key={i}
              className="handle handle-crop"
              style={style}
              onPointerDown={(e) => handlePointerDown(target, e)}
            >
              {label}
            </div>
          ))}
        </div>
      </div>

      <div className="perspective-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={processing}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-large" onClick={applyCrop} disabled={processing}>
          {processing ? 'Processing…' : 'Apply Crop'}
        </button>
      </div>
    </div>
  );
}
