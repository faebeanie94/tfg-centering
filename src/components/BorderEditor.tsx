import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Rect,
  computeCentering,
  defaultInnerRect,
  defaultOuterRect,
} from '../lib/centering';
import { hexToRgba } from '../lib/perspective';
import type { SideSnapshot, GradingSession } from '../lib/session';
import { formatGrade, sessionHasAny } from '../lib/session';
import { getTfgGrade, type CardSide } from '../lib/tfg-standards';
import type { AppSettings } from '../hooks/useAppSettings';
import { useFitScale, useAppShellMode } from '../hooks/useFitScale';
import { usePinchZoom } from '../hooks/usePinchZoom';
import { StandardsPanel } from './StandardsPanel';
import { CardMenu } from './CardMenu';
import { EdgeArrowHandle, edgeHandleStyle } from './EdgeArrowHandle';

interface BorderEditorProps {
  imageSrc: string;
  side: CardSide;
  settings: AppSettings;
  session: GradingSession;
  cardName: string;
  initialOuter?: Rect;
  initialInner?: Rect;
  onNameChange: (name: string) => void;
  onSave: (snapshot: SideSnapshot) => void;
  onSideChange: (side: CardSide) => void;
  onCaptureSide: (side: CardSide) => void;
  onCrop: () => void;
  onPerspectiveFix: () => void;
  onDelete: () => void;
  onCompare: () => void;
  onSettings: () => void;
  onSettingsChange: (patch: Partial<AppSettings>) => void;
  onReset: () => void;
  onLibrary?: () => void;
  onSaveToLibrary?: (session: GradingSession) => Promise<boolean>;
  libraryMessage?: string | null;
}

type DragTarget =
  | { rect: 'outer' | 'inner'; edge: 'left' | 'right' | 'top' | 'bottom' }
  | { rect: 'outer' | 'inner'; corner: 'tl' | 'tr' | 'bl' | 'br' }
  | null;

interface ImageSize {
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatMm(n: number): string {
  return `${n.toFixed(2)} mm`;
}

function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

export function BorderEditor({
  imageSrc,
  side,
  settings,
  session,
  initialOuter,
  initialInner,
  cardName,
  onNameChange,
  onSave,
  onSideChange,
  onCaptureSide,
  onCrop,
  onPerspectiveFix,
  onDelete,
  onCompare,
  onSettings,
  onSettingsChange,
  onReset,
  onLibrary,
  onSaveToLibrary,
  libraryMessage,
}: BorderEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  useAppShellMode('editor-mode', true);
  const displayScale = useFitScale(viewportRef, imageSize);
  const { zoom, reset: resetZoom, layerStyle, viewportHandlers } = usePinchZoom(viewportRef, 15);
  const [outer, setOuter] = useState<Rect | null>(initialOuter ?? null);
  const [inner, setInner] = useState<Rect | null>(initialInner ?? null);
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const [showStandards, setShowStandards] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [savingToLibrary, setSavingToLibrary] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; rect: Rect } | null>(null);
  const patternId = useMemo(() => `stripe-${side}-${Math.random().toString(36).slice(2)}`, [side, imageSrc]);

  useEffect(() => {
    resetZoom();
  }, [imageSrc, resetZoom]);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const size = { width: img.naturalWidth, height: img.naturalHeight };
      setImageSize(size);
      if (!initialOuter || !initialInner) {
        const o = defaultOuterRect(size.width, size.height);
        setOuter(o);
        setInner(defaultInnerRect(o));
      }
    };
    img.src = imageSrc;
  }, [imageSrc, initialOuter, initialInner]);

  const result = useMemo(() => {
    if (!outer || !inner) return null;
    return computeCentering(outer, inner);
  }, [outer, inner]);

  const tfgGrade = useMemo(() => {
    if (!result) return null;
    return getTfgGrade(result.bordersPx, side);
  }, [result, side]);

  const buildSnapshot = useCallback((): SideSnapshot | null => {
    if (!outer || !inner || !result || !tfgGrade) return null;
    return {
      imageSrc,
      outer,
      inner,
      result,
      grade: tfgGrade,
      savedAt: Date.now(),
      name: cardName.trim() || undefined,
    };
  }, [imageSrc, outer, inner, result, tfgGrade, cardName]);

  function resetLines() {
    if (!imageSize) return;
    const o = defaultOuterRect(imageSize.width, imageSize.height);
    setOuter(o);
    setInner(defaultInnerRect(o));
  }

  function handleSave() {
    const snap = buildSnapshot();
    if (!snap) return;
    onSave(snap);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }

  function handleSideSwitch(target: CardSide) {
    const snap = buildSnapshot();
    if (snap) onSave(snap);
    onSideChange(target);
  }

  const handlePointerDown = useCallback(
    (target: DragTarget, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      const currentRect = target?.rect === 'outer' ? outer : inner;
      if (!currentRect) return;

      dragStartRef.current = { x: e.clientX, y: e.clientY, rect: { ...currentRect } };
      setDragTarget(target);
    },
    [outer, inner],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragTarget || !dragStartRef.current || !imageSize) return;

      const start = dragStartRef.current;
      const rect = containerRef.current?.getBoundingClientRect();
      const imageScale = rect && imageSize ? rect.width / imageSize.width : displayScale;
      const dx = (e.clientX - start.x) / imageScale;
      const dy = (e.clientY - start.y) / imageScale;
      const r = start.rect;
      let next: Rect = { ...r };

      if ('edge' in dragTarget) {
        switch (dragTarget.edge) {
          case 'left':
            next.x = clamp(r.x + dx, 0, r.x + r.width - 20);
            next.width = r.width - (next.x - r.x);
            break;
          case 'right':
            next.width = clamp(r.width + dx, 20, imageSize.width - r.x);
            break;
          case 'top':
            next.y = clamp(r.y + dy, 0, r.y + r.height - 20);
            next.height = r.height - (next.y - r.y);
            break;
          case 'bottom':
            next.height = clamp(r.height + dy, 20, imageSize.height - r.y);
            break;
        }
      } else if ('corner' in dragTarget) {
        switch (dragTarget.corner) {
          case 'tl':
            next.x = clamp(r.x + dx, 0, r.x + r.width - 20);
            next.y = clamp(r.y + dy, 0, r.y + r.height - 20);
            next.width = r.width - (next.x - r.x);
            next.height = r.height - (next.y - r.y);
            break;
          case 'tr':
            next.y = clamp(r.y + dy, 0, r.y + r.height - 20);
            next.width = clamp(r.width + dx, 20, imageSize.width - r.x);
            next.height = r.height - (next.y - r.y);
            break;
          case 'bl':
            next.x = clamp(r.x + dx, 0, r.x + r.width - 20);
            next.width = r.width - (next.x - r.x);
            next.height = clamp(r.height + dy, 20, imageSize.height - r.y);
            break;
          case 'br':
            next.width = clamp(r.width + dx, 20, imageSize.width - r.x);
            next.height = clamp(r.height + dy, 20, imageSize.height - r.y);
            break;
        }
      }

      if (dragTarget.rect === 'outer') setOuter(next);
      else setInner(next);
    },
    [dragTarget, displayScale, imageSize],
  );

  const handlePointerUp = useCallback(() => {
    dragStartRef.current = null;
    setDragTarget(null);
  }, []);

  if (!imageSize || !outer || !inner || !result || !tfgGrade) {
    return <div className="loading">Loading image…</div>;
  }

  const displayHeight = imageSize.height * displayScale;
  const fillStroke = hexToRgba(settings.borderFillColor, 0.55);
  const otherSide: CardSide = side === 'front' ? 'back' : 'front';
  const otherSaved = session[otherSide] !== null;

  function renderEdgeHandles(rect: Rect, rectType: 'outer' | 'inner', color: string) {
    const edges: Array<'left' | 'right' | 'top' | 'bottom'> = ['left', 'right', 'top', 'bottom'];

    return edges.map((edge) => (
      <div
        key={`${rectType}-${edge}`}
        className="edge-handle-wrap"
        style={edgeHandleStyle(edge, rect, displayScale, rectType)}
      >
        <EdgeArrowHandle
          edge={edge}
          color={color}
          onPointerDown={(e) => handlePointerDown({ rect: rectType, edge }, e)}
        />
      </div>
    ));
  }

  return (
    <div className="editor editor-shell">
      <div className="editor-toolbar">
        <button type="button" className="btn btn-secondary btn-small" onClick={onReset}>
          ← New
        </button>
        <div className="side-toggle">
          <button
            type="button"
            className={`side-btn ${side === 'front' ? 'active' : ''}`}
            onClick={() => handleSideSwitch('front')}
          >
            Front {session.front && '✓'}
          </button>
          <button
            type="button"
            className={`side-btn ${side === 'back' ? 'active' : ''}`}
            onClick={() => handleSideSwitch('back')}
          >
            Back {session.back && '✓'}
          </button>
        </div>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => setShowMenu(true)}>
          ⋯
        </button>
        {onLibrary && (
          <button type="button" className="btn btn-secondary btn-small" onClick={onLibrary}>
            Library
          </button>
        )}
        <button type="button" className="btn btn-secondary btn-small" onClick={onSettings}>
          ⚙
        </button>
      </div>

      {libraryMessage && <div className="library-toast">{libraryMessage}</div>}

      <div className="grade-banner">
        <div className="grade-banner-brand">
          <span className="tfg-logo-sm">TFG</span>
          <span className="grade-banner-side">
            {side === 'front' ? 'Front' : 'Back'}
            {cardName && <span className="grade-banner-name"> · {cardName}</span>}
          </span>
        </div>
        <div className="grade-banner-metrics">
          <div className="metric">
            <span className="metric-label">L | R</span>
            <span className="metric-value">
              {formatPct(result.leftRight.left)} | {formatPct(result.leftRight.right)}
            </span>
          </div>
          <div className="metric">
            <span className="metric-label">T | B</span>
            <span className="metric-value">
              {formatPct(result.topBottom.top)} | {formatPct(result.topBottom.bottom)}
            </span>
          </div>
        </div>
        <div className="grade-banner-score">{formatGrade(tfgGrade.grade)}</div>
      </div>

      <div ref={viewportRef} className="editor-viewport" {...viewportHandlers}>
      <div className="editor-zoom-layer" style={layerStyle}>
      <div
        ref={containerRef}
        className="editor-canvas"
        style={{ width: imageSize.width * displayScale, height: displayHeight }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <img
          src={imageSrc}
          alt="Trading card"
          draggable={false}
          className={settings.invertColors ? 'editor-image-inverted' : undefined}
          style={{ width: '100%' }}
        />

        <svg
          className="editor-overlay"
          viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
          preserveAspectRatio="none"
        >
          <defs>
            <pattern id={patternId} patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="8" stroke={fillStroke} strokeWidth="4" />
            </pattern>
          </defs>

          <rect x={outer.x} y={outer.y} width={inner.x - outer.x} height={outer.height} fill={`url(#${patternId})`} />
          <rect x={inner.x + inner.width} y={outer.y} width={outer.x + outer.width - (inner.x + inner.width)} height={outer.height} fill={`url(#${patternId})`} />
          <rect x={inner.x} y={outer.y} width={inner.width} height={inner.y - outer.y} fill={`url(#${patternId})`} />
          <rect x={inner.x} y={inner.y + inner.height} width={inner.width} height={outer.y + outer.height - (inner.y + inner.height)} fill={`url(#${patternId})`} />

          <rect x={outer.x} y={outer.y} width={outer.width} height={outer.height} fill="none" stroke={settings.outerEdgeColor} strokeWidth={3} />
          <rect x={inner.x} y={inner.y} width={inner.width} height={inner.height} fill="none" stroke={settings.handleColor} strokeWidth={2} />
        </svg>

        <div className="handles-layer">
          {renderEdgeHandles(outer, 'outer', settings.handleColor)}
          {renderEdgeHandles(inner, 'inner', settings.handleColor)}
        </div>

        <div className="border-label" style={{ left: (outer.x + (inner.x - outer.x) / 2) * displayScale, top: (outer.y + outer.height / 2) * displayScale }}>
          {formatMm(result.bordersMm.left)}
        </div>
        <div className="border-label" style={{ left: (inner.x + inner.width + (outer.x + outer.width - inner.x - inner.width) / 2) * displayScale, top: (outer.y + outer.height / 2) * displayScale }}>
          {formatMm(result.bordersMm.right)}
        </div>
        <div className="border-label" style={{ left: (outer.x + outer.width / 2) * displayScale, top: (outer.y + (inner.y - outer.y) / 2) * displayScale }}>
          {formatMm(result.bordersMm.top)}
        </div>
        <div className="border-label" style={{ left: (outer.x + outer.width / 2) * displayScale, top: (inner.y + inner.height + (outer.y + outer.height - inner.y - inner.height) / 2) * displayScale }}>
          {formatMm(result.bordersMm.bottom)}
        </div>
      </div>
      </div>
      {zoom > 1 && (
        <div className="editor-zoom-badge">{zoom.toFixed(1)}×</div>
      )}
      </div>

      <div className="editor-actions">
        <button type="button" className="btn btn-secondary" onClick={() => setShowStandards(true)}>
          Standards
        </button>
        <button type="button" className={`btn btn-primary ${savedFlash ? 'btn-saved' : ''}`} onClick={handleSave}>
          {savedFlash ? 'Saved ✓' : `Save ${side}`}
        </button>
        {!otherSaved ? (
          <button type="button" className="btn btn-secondary" onClick={() => { handleSave(); onCaptureSide(otherSide); }}>
            Capture {otherSide}
          </button>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={onCompare} disabled={!sessionHasAny(session)}>
            Compare
          </button>
        )}
      </div>

      <StandardsPanel open={showStandards} onClose={() => setShowStandards(false)} />
      <CardMenu
        open={showMenu}
        side={side}
        imageSrc={imageSrc}
        cardName={cardName}
        invertColors={settings.invertColors}
        onInvertColorsChange={(invertColors) => onSettingsChange({ invertColors })}
        onNameChange={onNameChange}
        onCrop={onCrop}
        onPerspectiveFix={onPerspectiveFix}
        onFlipSide={() => handleSideSwitch(side === 'front' ? 'back' : 'front')}
        onResetLines={resetLines}
        onDelete={onDelete}
        onSaveToLibrary={
          onSaveToLibrary
            ? async () => {
                setSavingToLibrary(true);
                try {
                  const snap = buildSnapshot();
                  const merged: GradingSession = {
                    ...session,
                    [side]: snap ?? session[side],
                  };
                  return await onSaveToLibrary(merged);
                } finally {
                  setSavingToLibrary(false);
                }
              }
            : undefined
        }
        savingToLibrary={savingToLibrary}
        onClose={() => setShowMenu(false)}
      />
    </div>
  );
}
