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
import type { SubmissionFolder } from '../lib/folder-submission';
import {
  LOOKUP_GAMES,
  LookupError,
  profileForLookup,
  resolveCentering,
  type LookupResult,
} from '../lib/card-lookup';
import {
  BORDERED_PROFILE,
  allLayoutProfiles,
  bordersForGrading,
  correctSplits,
  findLayoutProfile,
  isCorrectingProfile,
  newCustomProfileId,
} from '../lib/layout-profiles';

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
  onRetake?: (side: CardSide) => Promise<void>;
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
  submissionFolder?: SubmissionFolder | null;
  onEndSubmission?: () => void;
  onViewCards?: () => void;
  onRetakeSubmission?: () => void;
  onNextCard?: () => void;
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
  onNextCard,
  cardName,
  onNameChange,
  onSave,
  onSideChange,
  onCaptureSide,
  onRetake,
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
  submissionFolder,
  onEndSubmission,
  onRetakeSubmission,
  onViewCards,
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
  const [newLayoutName, setNewLayoutName] = useState<string | null>(null);
  const [lookupSet, setLookupSet] = useState('');
  const [lookupNumber, setLookupNumber] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupOutcome, setLookupOutcome] = useState<
    { kind: 'ok' | 'warn' | 'error'; text: string; imageUrl?: string | null } | null
  >(null);
  const dragStartRef = useRef<{ x: number; y: number; rect: Rect } | null>(null);
  const captureRef = useRef<{ el: HTMLElement; id: number } | null>(null);
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

  // Borderless correction applies to the front only — card backs are bordered.
  const layoutProfile = useMemo(
    () =>
      side === 'front'
        ? findLayoutProfile(settings.layoutProfileId, settings.customLayoutProfiles)
        : BORDERED_PROFILE,
    [side, settings.layoutProfileId, settings.customLayoutProfiles],
  );
  const correcting = isCorrectingProfile(layoutProfile);

  const corrected = useMemo(() => {
    if (!result || !correcting) return null;
    return correctSplits(result, layoutProfile);
  }, [result, correcting, layoutProfile]);

  const tfgGrade = useMemo(() => {
    if (!result) return null;
    return getTfgGrade(bordersForGrading(result, layoutProfile), side);
  }, [result, layoutProfile, side]);

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
      layout: corrected
        ? {
            profileId: layoutProfile.id,
            label: layoutProfile.label,
            tbTarget: layoutProfile.tbTarget,
            lrTarget: layoutProfile.lrTarget,
            corrected,
          }
        : undefined,
    };
  }, [imageSrc, outer, inner, result, tfgGrade, cardName, cardFormat.id, corrected, layoutProfile]);

  /** Ask tfg-card-lookup which layout this card uses, and select it. */
  async function runLookup() {
    if (!settings.cardLookupUrl || !lookupNumber.trim() || lookupBusy) return;
    setLookupBusy(true);
    setLookupOutcome(null);
    try {
      const answer: LookupResult = await resolveCentering(settings.cardLookupUrl, {
        game: settings.lookupGame,
        set: lookupSet,
        number: lookupNumber,
      });
      if (answer.status !== 'resolved') {
        const names = answer.candidates.slice(0, 4).map((c) => `${c.name} (${c.set.toUpperCase()} ${c.number})`);
        setLookupOutcome({
          kind: 'warn',
          text:
            answer.status === 'candidates'
              ? `Several cards match: ${names.join(', ')}. Add the set and number.`
              : 'No card found. Check the game, set and number.',
        });
        return;
      }

      const cardLabel = `${answer.card.name} (${answer.card.set.toUpperCase()} ${answer.card.number})`;
      if (answer.needsLayout) {
        onSettingsChange({ layoutProfileId: BORDERED_PROFILE.id });
        setLookupOutcome({
          kind: 'warn',
          text: `${cardLabel} is borderless and has no layout yet. Load the official image, place the yellow box on its reference points and tap Set target.`,
          imageUrl: answer.measuring.imageUrl,
        });
        return;
      }

      const { profileId, addProfile } = profileForLookup(answer.layout, settings.customLayoutProfiles);
      onSettingsChange({
        layoutProfileId: profileId,
        ...(addProfile ? { customLayoutProfiles: [...settings.customLayoutProfiles, addProfile] } : {}),
      });
      setLookupOutcome({
        kind: 'ok',
        text: answer.matched
          ? `${cardLabel} → ${answer.layout.label}${addProfile ? ' (added to your layouts)' : ''}.`
          : `${cardLabel} → bordered (50/50).`,
      });
    } catch (error) {
      setLookupOutcome({
        kind: 'error',
        text: error instanceof LookupError ? error.message : 'Card lookup failed.',
      });
    } finally {
      setLookupBusy(false);
    }
  }

  /** Save the current raw yellow-box split as a new borderless target (e.g. from a Scryfall image). */
  function saveCurrentAsLayout() {
    if (!result || newLayoutName === null) return;
    const label = newLayoutName.trim();
    if (!label) return;
    const profile = {
      id: newCustomProfileId(),
      label,
      tbTarget: Math.round(result.topBottom.top * 10) / 10,
      lrTarget: Math.round(result.leftRight.left * 10) / 10,
      source: `Set from ${cardName.trim() || 'reference image'} on ${new Date().toLocaleDateString()}`,
    };
    onSettingsChange({
      customLayoutProfiles: [...settings.customLayoutProfiles, profile],
      layoutProfileId: profile.id,
    });
    setNewLayoutName(null);
  }

  function resetLines() {
    if (!imageSize) return;
    const o = defaultOuterRect(imageSize.width, imageSize.height);
    setOuter(o);
    setInner(defaultInnerRect(o));
  }

  async function handleSave() {
    const snap = buildSnapshot();
    if (!snap) return;
    await onSave(snap);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }

  function handleSideSwitch(target: CardSide) {
    onSideChange(target);
  }

  const releaseCapture = useCallback(() => {
    const cap = captureRef.current;
    captureRef.current = null;
    if (!cap) return;
    try {
      if (cap.el.hasPointerCapture(cap.id)) cap.el.releasePointerCapture(cap.id);
    } catch {
      /* already released */
    }
  }, []);

  // Safety net: iPad Safari can leave a drag's pointer capture stuck (and it
  // reuses touch ids), which routes every later tap's click to the old handle,
  // so all buttons go dead. Any new touch first clears a leftover capture.
  useEffect(() => {
    const onAnyPointerDown = () => {
      if (captureRef.current) {
        releaseCapture();
        dragStartRef.current = null;
        setDragTarget(null);
      }
    };
    document.addEventListener('pointerdown', onAnyPointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', onAnyPointerDown, true);
      releaseCapture();
    };
  }, [releaseCapture]);

  const handlePointerDown = useCallback(
    (target: DragTarget, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Capture on the handle itself (currentTarget), never on the inner
      // SVG/text that was touched (e.target).
      const el = e.currentTarget as HTMLElement;
      releaseCapture();
      el.setPointerCapture(e.pointerId);
      captureRef.current = { el, id: e.pointerId };

      const currentRect = target?.rect === 'outer' ? outer : inner;
      if (!currentRect) return;

      // Once the user starts adjusting the inner box by hand, whatever was
      // estimated vs measured no longer applies — they're setting it now.
      if (target?.rect === 'inner') setInnerSideConfidence(null);

      dragStartRef.current = { x: e.clientX, y: e.clientY, rect: { ...currentRect } };
      setDragTarget(target);
    },
    [outer, inner, releaseCapture],
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
      let nextOther: Rect | null = null;

      const isOuter = dragTarget.rect === 'outer';
      const outerRect = isOuter ? r : (outer || defaultOuterRect(imageSize.width, imageSize.height));
      const innerRect = isOuter ? (inner || defaultInnerRect(outerRect)) : r;

      const outerMinX = outerRect.x;
      const outerMaxX = outerRect.x + outerRect.width;
      const outerMinY = outerRect.y;
      const outerMaxY = outerRect.y + outerRect.height;
      const innerMinX = innerRect.x;
      const innerMaxX = innerRect.x + innerRect.width;
      const innerMinY = innerRect.y;
      const innerMaxY = innerRect.y + innerRect.height;

      if ('edge' in dragTarget) {
        switch (dragTarget.edge) {
          case 'left':
            if (isOuter) {
              const wantX = r.x + dx;
              if (wantX > innerMinX) {
                // Moving right (inward) - push inner along
                next.x = wantX;
                next.width = r.width - (next.x - r.x);
                nextOther = { ...innerRect };
                nextOther.x = wantX;
                nextOther.width = innerRect.width - (wantX - innerMinX);
              } else {
                // Moving left (outward) - normal clamp
                next.x = clamp(wantX, 0, innerMinX);
                next.width = r.width - (next.x - r.x);
              }
            } else {
              const wantX = r.x + dx;
              if (wantX < outerMinX) {
                // Moving left (outward) - push outer along
                next.x = wantX;
                next.width = r.width - (next.x - r.x);
                nextOther = { ...outerRect };
                nextOther.x = wantX;
                nextOther.width = outerRect.width - (wantX - outerMinX);
              } else {
                // Moving right (inward) - normal clamp
                next.x = clamp(wantX, outerMinX, r.x + r.width - 20);
                next.width = r.width - (next.x - r.x);
              }
            }
            break;
          case 'right':
            if (isOuter) {
              const wantRight = r.x + r.width + dx;
              if (wantRight < innerMaxX) {
                // Moving left (inward) - push inner along
                next.width = wantRight - r.x;
                nextOther = { ...innerRect };
                nextOther.width = wantRight - innerRect.x;
              } else {
                // Moving right (outward) - normal clamp
                next.width = clamp(wantRight - r.x, 20, imageSize.width - r.x);
              }
            } else {
              const wantRight = r.x + r.width + dx;
              if (wantRight > outerMaxX) {
                // Moving right (outward) - push outer along
                next.width = wantRight - r.x;
                nextOther = { ...outerRect };
                nextOther.width = wantRight - outerRect.x;
              } else {
                // Moving left (inward) - normal clamp
                next.width = clamp(wantRight - r.x, 20, outerMaxX - r.x);
              }
            }
            break;
          case 'top':
            if (isOuter) {
              const wantY = r.y + dy;
              if (wantY > innerMinY) {
                // Moving down (inward) - push inner along
                next.y = wantY;
                next.height = r.height - (next.y - r.y);
                nextOther = { ...innerRect };
                nextOther.y = wantY;
                nextOther.height = innerRect.height - (wantY - innerMinY);
              } else {
                // Moving up (outward) - normal clamp
                next.y = clamp(wantY, 0, innerMinY);
                next.height = r.height - (next.y - r.y);
              }
            } else {
              const wantY = r.y + dy;
              if (wantY < outerMinY) {
                // Moving up (outward) - push outer along
                next.y = wantY;
                next.height = r.height - (next.y - r.y);
                nextOther = { ...outerRect };
                nextOther.y = wantY;
                nextOther.height = outerRect.height - (wantY - outerMinY);
              } else {
                // Moving down (inward) - normal clamp
                next.y = clamp(wantY, outerMinY, r.y + r.height - 20);
                next.height = r.height - (next.y - r.y);
              }
            }
            break;
          case 'bottom':
            if (isOuter) {
              const wantBottom = r.y + r.height + dy;
              if (wantBottom < innerMaxY) {
                // Moving up (inward) - push inner along
                next.height = wantBottom - r.y;
                nextOther = { ...innerRect };
                nextOther.height = wantBottom - innerRect.y;
              } else {
                // Moving down (outward) - normal clamp
                next.height = clamp(wantBottom - r.y, 20, imageSize.height - r.y);
              }
            } else {
              const wantBottom = r.y + r.height + dy;
              if (wantBottom > outerMaxY) {
                // Moving down (outward) - push outer along
                next.height = wantBottom - r.y;
                nextOther = { ...outerRect };
                nextOther.height = wantBottom - outerRect.y;
              } else {
                // Moving up (inward) - normal clamp
                next.height = clamp(wantBottom - r.y, 20, outerMaxY - r.y);
              }
            }
            break;
        }
      }

      if (dragTarget.rect === 'outer') {
        setOuter(next);
        if (nextOther) setInner(nextOther);
      } else {
        setInner(next);
        if (nextOther) setOuter(nextOther);
      }
    },
    [dragTarget, displayScale, imageSize, outer, inner],
  );

  const handlePointerUp = useCallback(() => {
    releaseCapture();
    dragStartRef.current = null;
    setDragTarget(null);
  }, [releaseCapture]);

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
          slot={rectType}
          onPointerDown={(e) => handlePointerDown({ rect: rectType, edge }, e)}
        />
      </div>
    ));
  }

  const mmReadings = (
    [
      { key: 'top', label: 'Top', value: result.bordersMm.top },
      { key: 'bottom', label: 'Bottom', value: result.bordersMm.bottom },
      { key: 'left', label: 'Left', value: result.bordersMm.left },
      { key: 'right', label: 'Right', value: result.bordersMm.right },
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

      {submissionFolder && (
        <div className="submission-banner">
          <span>
            {submissionFolder.type === 'api' ? '📁' : '📦'} {submissionFolder.name}
            <span className="submission-mode-badge">
              {submissionFolder.type === 'api' ? 'Cloud' : 'ZIP'}
            </span>
            · Card {submissionFolder.nextCardNumber}
          </span>
          {onEndSubmission && (
            <button type="button" className="btn btn-secondary btn-small" onClick={onEndSubmission}>
              End
            </button>
          )}
        </div>
      )}

      {autoCropInfo && (
        <div className="autocrop-note">
          <span>
            Unsure if level. Worth a check via{' '}
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
            <span className="metric-label">T | B{corrected && ' (adj)'}</span>
            <span className="metric-value">
              {formatPct((corrected ?? result).topBottom.top)} | {formatPct((corrected ?? result).topBottom.bottom)}
            </span>
          </div>
          <div className="metric">
            <span className="metric-label">L | R{corrected && ' (adj)'}</span>
            <span className="metric-value">
              {formatPct((corrected ?? result).leftRight.left)} | {formatPct((corrected ?? result).leftRight.right)}
            </span>
          </div>
        </div>
        <div className="grade-banner-score">{formatGrade(tfgGrade.grade)}</div>
      </div>

      {side === 'front' && (
        <div className={`layout-bar ${correcting ? 'layout-bar-active' : ''}`}>
          <div className="layout-bar-row">
            <label className="layout-bar-label" htmlFor="layout-profile-select">
              Layout
            </label>
            <select
              id="layout-profile-select"
              className="layout-bar-select"
              value={layoutProfile.id}
              onChange={(e) => onSettingsChange({ layoutProfileId: e.target.value })}
            >
              {allLayoutProfiles(settings.customLayoutProfiles).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            {newLayoutName === null && (
              <button
                type="button"
                className="btn btn-secondary btn-small"
                title="Use this image's yellow-box split as a borderless target"
                onClick={() => setNewLayoutName(cardName.trim())}
              >
                Set target
              </button>
            )}
          </div>
          {settings.cardLookupUrl && newLayoutName === null && (
            <form
              className="layout-bar-row"
              onSubmit={(e) => {
                e.preventDefault();
                void runLookup();
              }}
            >
              <select
                className="layout-bar-select layout-lookup-game"
                aria-label="Game"
                value={settings.lookupGame}
                onChange={(e) => onSettingsChange({ lookupGame: e.target.value })}
              >
                {LOOKUP_GAMES.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.label}
                  </option>
                ))}
              </select>
              <input
                className="layout-bar-input layout-lookup-set"
                type="text"
                placeholder="Set"
                aria-label="Set"
                value={lookupSet}
                onChange={(e) => setLookupSet(e.target.value)}
              />
              <input
                className="layout-bar-input layout-lookup-number"
                type="text"
                placeholder={LOOKUP_GAMES.find((g) => g.code === settings.lookupGame)?.numberHint ?? 'Number'}
                aria-label="Card number"
                value={lookupNumber}
                onChange={(e) => setLookupNumber(e.target.value)}
              />
              <button type="submit" className="btn btn-secondary btn-small" disabled={lookupBusy || !lookupNumber.trim()}>
                {lookupBusy ? '…' : 'Look up'}
              </button>
            </form>
          )}
          {lookupOutcome && (
            <p className={`layout-bar-note layout-lookup-${lookupOutcome.kind}`}>
              {lookupOutcome.text}
              {lookupOutcome.imageUrl && (
                <>
                  {' '}
                  <a href={lookupOutcome.imageUrl} target="_blank" rel="noopener noreferrer">
                    Official image
                  </a>
                </>
              )}
            </p>
          )}
          {newLayoutName !== null && (
            <div className="layout-bar-row">
              <input
                className="layout-bar-input"
                type="text"
                placeholder="Layout name, e.g. MTG MSH Classic Comic"
                value={newLayoutName}
                autoFocus
                onChange={(e) => setNewLayoutName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveCurrentAsLayout();
                  if (e.key === 'Escape') setNewLayoutName(null);
                }}
              />
              <button
                type="button"
                className="btn btn-primary btn-small"
                disabled={!newLayoutName.trim()}
                onClick={saveCurrentAsLayout}
              >
                Save {formatPct(result.topBottom.top)} / {formatPct(result.leftRight.left)}
              </button>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setNewLayoutName(null)}>
                Cancel
              </button>
            </div>
          )}
          {correcting && (
            <p className="layout-bar-note">
              Borderless: graded against target T {layoutProfile.tbTarget.toFixed(1)}% · L{' '}
              {layoutProfile.lrTarget.toFixed(1)}%. Raw T|B {formatPct(result.topBottom.top)} | L|R{' '}
              {formatPct(result.leftRight.left)}.
              {layoutProfile.hint && <span className="layout-bar-hint"> {layoutProfile.hint}</span>}
            </p>
          )}
          {newLayoutName !== null && (
            <p className="layout-bar-note">
              Place the yellow box on the layout's reference points on a perfectly cut copy (or the
              Scryfall image), then save. The current raw split becomes the target.
            </p>
          )}
        </div>
      )}

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
            style={{ pointerEvents: 'none' }}
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
            <rect x={inner.x} y={inner.y} width={inner.width} height={inner.height} fill="none" stroke={settings.innerEdgeColor} strokeWidth={2} />
          </svg>
        </div>

        {/* Draggable edge overlays */}
        <div className="edge-overlay" style={{ left: `${outer.x * displayScale}px`, top: `${outer.y * displayScale}px`, width: `4px`, height: `${outer.height * displayScale}px`, cursor: 'col-resize' }} onPointerDown={(e) => handlePointerDown({ rect: 'outer', edge: 'left' }, e)} />
        <div className="edge-overlay" style={{ left: `${(outer.x + outer.width - 2) * displayScale}px`, top: `${outer.y * displayScale}px`, width: `4px`, height: `${outer.height * displayScale}px`, cursor: 'col-resize' }} onPointerDown={(e) => handlePointerDown({ rect: 'outer', edge: 'right' }, e)} />
        <div className="edge-overlay" style={{ left: `${outer.x * displayScale}px`, top: `${outer.y * displayScale}px`, width: `${outer.width * displayScale}px`, height: `4px`, cursor: 'row-resize' }} onPointerDown={(e) => handlePointerDown({ rect: 'outer', edge: 'top' }, e)} />
        <div className="edge-overlay" style={{ left: `${outer.x * displayScale}px`, top: `${(outer.y + outer.height - 2) * displayScale}px`, width: `${outer.width * displayScale}px`, height: `4px`, cursor: 'row-resize' }} onPointerDown={(e) => handlePointerDown({ rect: 'outer', edge: 'bottom' }, e)} />

        <div className="edge-overlay" style={{ left: `${inner.x * displayScale}px`, top: `${inner.y * displayScale}px`, width: `4px`, height: `${inner.height * displayScale}px`, cursor: 'col-resize' }} onPointerDown={(e) => handlePointerDown({ rect: 'inner', edge: 'left' }, e)} />
        <div className="edge-overlay" style={{ left: `${(inner.x + inner.width - 2) * displayScale}px`, top: `${inner.y * displayScale}px`, width: `4px`, height: `${inner.height * displayScale}px`, cursor: 'col-resize' }} onPointerDown={(e) => handlePointerDown({ rect: 'inner', edge: 'right' }, e)} />
        <div className="edge-overlay" style={{ left: `${inner.x * displayScale}px`, top: `${inner.y * displayScale}px`, width: `${inner.width * displayScale}px`, height: `4px`, cursor: 'row-resize' }} onPointerDown={(e) => handlePointerDown({ rect: 'inner', edge: 'top' }, e)} />
        <div className="edge-overlay" style={{ left: `${inner.x * displayScale}px`, top: `${(inner.y + inner.height - 2) * displayScale}px`, width: `${inner.width * displayScale}px`, height: `4px`, cursor: 'row-resize' }} onPointerDown={(e) => handlePointerDown({ rect: 'inner', edge: 'bottom' }, e)} />

        <div className="handles-layer">
          {renderEdgeHandles(outer, 'outer', settings.handleColor)}
          {renderEdgeHandles(inner, 'inner', settings.innerEdgeColor)}
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
        {!otherSaved ? (
          <>
            <button type="button" className="btn btn-secondary" onClick={async () => { onRetake ? await onRetake(side) : onCaptureSide(side); }}>
              Retake
            </button>
            <button type="button" className="btn btn-secondary" onClick={async () => { await handleSave(); onCaptureSide(otherSide); }}>
              Capture {otherSide}
            </button>
          </>
        ) : (
          <>
            <button type="button" className={`btn btn-primary ${savedFlash ? 'btn-saved' : ''}`} onClick={handleSave}>
              {savedFlash ? 'Saved ✓' : 'Save Card'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onNextCard}>
              Next Card
            </button>
            <button type="button" className="btn btn-secondary" onClick={onCompare} disabled={!sessionHasAny(session)}>
              Compare
            </button>
          </>
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
        onRetake={
          submissionFolder
            ? () => {
                onRetakeSubmission?.();
                setShowMenu(false);
              }
            : undefined
        }
        submissionName={submissionFolder?.name}
        submissionId={submissionFolder?.type === 'api' ? submissionFolder.submissionId : undefined}
        onViewCards={onViewCards}
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
