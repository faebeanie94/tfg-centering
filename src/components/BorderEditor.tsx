import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Rect,
  computeCentering,
  defaultInnerRect,
  defaultOuterRect,
  formatPct,
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
import type { CardFormat } from '../lib/card-sizes';
import { formatCardSizeMm } from '../lib/card-sizes';
import type { AutoCropSkipReason, InnerSideConfidence } from '../lib/auto-crop';

const SKIP_REASON_LABEL: Record<AutoCropSkipReason, string> = {
  no_detection: "couldn't find the card automatically",
  low_confidence: 'not fully confident in the corners',
  not_frontal: 'card looked tilted',
  rotation: 'phone wasn’t level at capture',
};

interface BorderEditorProps {
  imageSrc: string;
  side: CardSide;
  settings: AppSettings;
  /** Physical card size for absolute mm (from Settings or post-capture pick). */
  cardFormat: CardFormat;
  session: GradingSession;
  cardName: string;
  initialOuter?: Rect;
  initialInner?: Rect;
  /** Which inner-box sides were actually measured vs estimated from the others. */
  innerSideConfidence?: InnerSideConfidence;
  /** Auto-crop applied but wasn't fully confident — dismissible "worth checking" note. */
  autoCropInfo?: { confidence: number; reason: AutoCropSkipReason } | null;
  onDismissAutoCropInfo?: () => void;
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

export function BorderEditor({
  imageSrc,
  side,
  settings,
  cardFormat,
  session,
  initialOuter,
  initialInner,
  innerSideConfidence: initialInnerSideConfidence,
  autoCropInfo = null,
  onDismissAutoCropInfo,
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
  const [innerSideConfidence, setInnerSideConfidence] = useState<InnerSideConfidence | null>(
    initialInnerSideConfidence ?? null,
  );
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
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = imageSrc;
  }, [imageSrc]);

  useEffect(() => {
    if (!imageSize) return;
    setInnerSideConfidence(initialInnerSideConfidence ?? null);
    if (initialOuter && initialInner) {
      setOuter(initialOuter);
      setInner(initialInner);
      return;
    }
    const o = defaultOuterRect(imageSize.width, imageSize.height);
    setOuter(o);
    setInner(defaultInnerRect(o));
  }, [imageSize, initialOuter, initialInner, initialInnerSideConfidence]);

  const result = useMemo(() => {
    if (!outer || !inner) return null;
    return computeCentering(outer, inner, cardFormat.widthMm, cardFormat.heightMm);
  }, [outer, inner, cardFormat.widthMm, cardFormat.heightMm]);

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
      cardFormatId: cardFormat.id,
    };
  }, [imageSrc, outer, inner, result, tfgGrade, cardName, cardFormat.id]);

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

      // Once the user starts adjusting the inner box by hand, whatever was
      // estimated vs measured no longer applies — they're setting it now.
      if (target?.rect === 'inner') setInnerSideConfidence(null);

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
      const imageScale = (rect && imageSize && rect.width > 0) ? rect.width / imageSize.width : displayScale;
      const dx = (e.clientX - start.x) / imageScale;
      const dy = (e.clientY - start.y) / imageScale;
      const r = start.rect;
      let next: Rect = { ...r };

      const isOuter = dragTarget.rect === 'outer';
      const innerMinX = inner?.x ?? 0;
      const innerMaxX = inner ? inner.x + inner.width : imageSize.width;
      const innerMinY = inner?.y ?? 0;
      const innerMaxY = inner ? inner.y + inner.height : imageSize.height;

      if ('edge' in dragTarget) {
        switch (dragTarget.edge) {
          case 'left':
            const leftMax = isOuter ? Math.min(r.x + r.width - 20, innerMinX) : r.x + r.width - 20;
            next.x = clamp(r.x + dx, 0, leftMax);
            next.width = r.width - (next.x - r.x);
            break;
          case 'right':
            const rightMin = isOuter ? Math.max(20, innerMaxX - r.x) : 20;
            next.width = clamp(r.width + dx, rightMin, imageSize.width - r.x);
            break;
          case 'top':
            const topMax = isOuter ? Math.min(r.y + r.height - 20, innerMinY) : r.y + r.height - 20;
            next.y = clamp(r.y + dy, 0, topMax);
            next.height = r.height - (next.y - r.y);
            break;
          case 'bottom':
            const bottomMin = isOuter ? Math.max(20, innerMaxY - r.y) : 20;
            next.height = clamp(r.height + dy, bottomMin, imageSize.height - r.y);
            break;
        }
      } else if ('corner' in dragTarget) {
        switch (dragTarget.corner) {
          case 'tl':
            const tlLeftMax = isOuter ? Math.min(r.x + r.width - 20, innerMinX) : r.x + r.width - 20;
            const tlTopMax = isOuter ? Math.min(r.y + r.height - 20, innerMinY) : r.y + r.height - 20;
            next.x = clamp(r.x + dx, 0, tlLeftMax);
            next.y = clamp(r.y + dy, 0, tlTopMax);
            next.width = r.width - (next.x - r.x);
            next.height = r.height - (next.y - r.y);
            break;
          case 'tr':
            const trTopMax = isOuter ? Math.min(r.y + r.height - 20, innerMinY) : r.y + r.height - 20;
            const trRightMin = isOuter ? Math.max(20, innerMaxX - r.x) : 20;
            next.y = clamp(r.y + dy, 0, trTopMax);
            next.width = clamp(r.width + dx, trRightMin, imageSize.width - r.x);
            next.height = r.height - (next.y - r.y);
            break;
          case 'bl':
            const blLeftMax = isOuter ? Math.min(r.x + r.width - 20, innerMinX) : r.x + r.width - 20;
            const blBottomMin = isOuter ? Math.max(20, innerMaxY - r.y) : 20;
            next.x = clamp(r.x + dx, 0, blLeftMax);
            next.width = r.width - (next.x - r.x);
            next.height = clamp(r.height + dy, blBottomMin, imageSize.height - r.y);
            break;
          case 'br':
            const brRightMin = isOuter ? Math.max(20, innerMaxX - r.x) : 20;
            const brBottomMin = isOuter ? Math.max(20, innerMaxY - r.y) : 20;
            next.width = clamp(r.width + dx, brRightMin, imageSize.width - r.x);
            next.height = clamp(r.height + dy, brBottomMin, imageSize.height - r.y);
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

  const mmReadings = (
    [
      { key: 'left', label: 'Left', value: result.bordersMm.left },
      { key: 'right', label: 'Right', value: result.bordersMm.right },
      { key: 'top', label: 'Top', value: result.bordersMm.top },
      { key: 'bottom', label: 'Bottom', value: result.bordersMm.bottom },
    ] as const
  ).map((r) => ({ ...r, estimated: innerSideConfidence ? innerSideConfidence[r.key] === 0 : false }));

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

      {autoCropInfo && (
        <div className="autocrop-note">
          <span>
            Auto-crop applied — {SKIP_REASON_LABEL[autoCropInfo.reason]}
            {autoCropInfo.confidence > 0 ? ` (${Math.round(autoCropInfo.confidence * 100)}% confidence)` : ''}.
            Worth a check via{' '}
            <button type="button" className="autocrop-note-link" onClick={onPerspectiveFix}>
              Fix perspective
            </button>{' '}
            if it looks off.
          </span>
          {onDismissAutoCropInfo && (
            <button
              type="button"
              className="autocrop-note-dismiss"
              onClick={onDismissAutoCropInfo}
              aria-label="Dismiss"
            >
              ×
            </button>
          )}
        </div>
      )}

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

      <div className="mm-readout" aria-label="Border measurements in millimetres">
        {mmReadings.map((reading) => (
          <div
            key={reading.key}
            className={`mm-readout-cell ${reading.estimated ? 'mm-readout-cell-estimated' : ''}`}
            title={reading.estimated ? "Couldn't find this edge — estimated from the other sides" : undefined}
          >
            <span className="mm-readout-label">
              {reading.label}
              {reading.estimated && <span className="mm-readout-est-mark">~</span>}
            </span>
            <span className="mm-readout-value">{reading.value.toFixed(2)}</span>
            <span className="mm-readout-unit">mm</span>
          </div>
        ))}
      </div>
      <p className="mm-scale-hint">
        mm from {cardFormat.shortLabel} size ({formatCardSizeMm(cardFormat)}) — keep the green box on
        the card edges
        {mmReadings.some((r) => r.estimated) && (
          <> · <span className="mm-scale-hint-est">~ estimated, not detected — drag to correct</span></>
        )}
      </p>

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
        <div className="editor-canvas-media">
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
        </div>

        <div className="handles-layer">
          {renderEdgeHandles(outer, 'outer', settings.handleColor)}
          {renderEdgeHandles(inner, 'inner', settings.handleColor)}
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
