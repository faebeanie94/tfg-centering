import { useCallback, useMemo, useState } from 'react';
import type { CardSide } from './lib/tfg-standards';
import { useAppSettings } from './hooks/useAppSettings';
import { emptySession, sessionHasAny, snapshotFromRects, type GradingSession, type SideSnapshot } from './lib/session';
import { ImageCapture } from './components/ImageCapture';
import CardGradeResult, { type CardGradeResultData } from './components/CardGradeResult';
import { PerspectiveCorrector } from './components/PerspectiveCorrector';
import { CropEditor } from './components/CropEditor';
import { BorderEditor } from './components/BorderEditor';
import { CompareView } from './components/CompareView';
import { SavedCardsView } from './components/SavedCardsView';
import { SettingsPanel } from './components/SettingsPanel';
import { CardSizePickerScreen, selectionFromSettings } from './components/CardSizeFields';
import { useSavedCards } from './hooks/useSavedCards';
import type { SavedCardRecord } from './lib/saved-cards';
import { estimateRectsFromImage } from './card/centering/estimateRectsFromImage';
import {
  tryAutoCrop,
  DETECT_CONFIRM_CONFIDENCE,
  type CaptureDetectHint,
} from './lib/auto-crop';
import type { QuadCorners } from './lib/perspective';
import {
  cardAspect,
  fallbackCardFormatForDetection,
  resolveCardFormat,
  type CardFormat,
  type CardSizeSelection,
} from './lib/card-sizes';

type Phase =
  | 'capture'
  | 'cardsize'
  | 'autocrop'
  | 'perspective'
  | 'crop'
  | 'editor'
  | 'result'
  | 'compare'
  | 'library';

export default function App() {
  const { settings, updateSettings } = useAppSettings();
  const { cards, loading: libraryLoading, save: saveToLibrary, remove: deleteFromLibrary } = useSavedCards();
  const [phase, setPhase] = useState<Phase>('capture');
  const [session, setSession] = useState<GradingSession>(emptySession);
  const [currentSide, setCurrentSide] = useState<CardSide>('front');
  const [rawImage, setRawImage] = useState<string | null>(null);
  const [workingImage, setWorkingImage] = useState<string | null>(null);
  const [editorRects, setEditorRects] = useState<{ outer?: SideSnapshot['outer']; inner?: SideSnapshot['inner'] }>({});
  const [cardNames, setCardNames] = useState<{ front: string; back: string }>({ front: '', back: '' });
  const [showSettings, setShowSettings] = useState(false);
  const [returnPhaseAfterEdit, setReturnPhaseAfterEdit] = useState<Phase>('editor');
  const [libraryReturnPhase, setLibraryReturnPhase] = useState<Phase>('capture');
  const [libraryMessage, setLibraryMessage] = useState<string | null>(null);
  const [perspectiveCorners, setPerspectiveCorners] = useState<QuadCorners | null>(null);
  const [detectionUncertain, setDetectionUncertain] = useState(false);
  /** Concrete size for this capture — set from Settings or post-capture picker. */
  const [sessionCardSize, setSessionCardSize] = useState<CardSizeSelection | null>(null);
  const [pendingHint, setPendingHint] = useState<CaptureDetectHint | undefined>(undefined);
  const [gradeResult, setGradeResult] = useState<CardGradeResultData | null>(null);

  const activeCardFormat = useMemo(() => {
    const fromSettings = selectionFromSettings(settings);
    if (fromSettings) return resolveCardFormat(fromSettings);
    if (sessionCardSize) return resolveCardFormat(sessionCardSize);
    return fallbackCardFormatForDetection(settings.customWidthMm, settings.customHeightMm);
  }, [settings, sessionCardSize]);

  const autoCropOptions = useMemo(
    () => ({
      cardAspect: cardAspect(activeCardFormat),
      cardHeightMm: activeCardFormat.heightMm,
    }),
    [activeCardFormat],
  );

  const openLibrary = useCallback((returnTo: Phase = phase) => {
    setLibraryReturnPhase(returnTo);
    setPhase('library');
  }, [phase]);

  const handleSaveToLibrary = useCallback(
    async (sessionToSave: GradingSession, label?: string) => {
      if (!sessionHasAny(sessionToSave)) return false;
      await saveToLibrary(sessionToSave, label);
      setLibraryMessage('Saved to library');
      window.setTimeout(() => setLibraryMessage(null), 2500);
      return true;
    },
    [saveToLibrary],
  );

  const handleOpenSavedCard = useCallback((record: SavedCardRecord) => {
    setSession(record.session);
    setCardNames({
      front: record.session.front?.name ?? '',
      back: record.session.back?.name ?? '',
    });
    const fromSettings = selectionFromSettings(settings);
    setSessionCardSize(fromSettings);
    if (record.session.front) {
      setWorkingImage(record.session.front.imageSrc);
      setEditorRects({ outer: record.session.front.outer, inner: record.session.front.inner });
      setCurrentSide('front');
    } else if (record.session.back) {
      setWorkingImage(record.session.back.imageSrc);
      setEditorRects({ outer: record.session.back.outer, inner: record.session.back.inner });
      setCurrentSide('back');
    }
    setPhase('editor');
  }, [settings]);

  const showEstimatedResult = useCallback(
    (
      imageSrc: string,
      outer: SideSnapshot['outer'],
      inner: SideSnapshot['inner'],
      side: CardSide,
      format: CardFormat,
    ) => {
      const snap = snapshotFromRects(imageSrc, outer, inner, side, format, cardNames[side]);
      setWorkingImage(imageSrc);
      setEditorRects({ outer, inner });
      setGradeResult({
        side,
        grade: snap.grade,
        measurements: snap.result,
        imageUrl: imageSrc,
      });
      setPhase('result');
    },
    [cardNames],
  );

  const finishAutoCrop = useCallback(
    async (dataUrl: string, hint: CaptureDetectHint | undefined, selection: CardSizeSelection) => {
      setSessionCardSize(selection);
      setPhase('autocrop');
      const format = resolveCardFormat(selection);
      if (hint?.preCorrected) {
        try {
          const rects = await estimateRectsFromImage(dataUrl, { padded: false });
          showEstimatedResult(dataUrl, rects.outer, rects.inner, currentSide, format);
        } catch {
          setWorkingImage(dataUrl);
          setEditorRects({});
          setPhase('editor');
        }
        return;
      }
      const { result, corners, confidence } = await tryAutoCrop(dataUrl, hint, {
        cardAspect: cardAspect(format),
        cardHeightMm: format.heightMm,
      });
      if (result) {
        showEstimatedResult(result.imageSrc, result.outer, result.inner, currentSide, format);
        return;
      }
      setPerspectiveCorners(corners);
      setDetectionUncertain(!corners || confidence < DETECT_CONFIRM_CONFIDENCE);
      setPhase('perspective');
    },
    [currentSide, showEstimatedResult],
  );

  const handleCapture = useCallback(
    async (dataUrl: string, hint?: CaptureDetectHint) => {
      setRawImage(dataUrl);
      setPendingHint(hint);
      setEditorRects({});
      setPerspectiveCorners(null);
      setDetectionUncertain(false);
      setGradeResult(null);
      setReturnPhaseAfterEdit('editor');
      setSessionCardSize(null);

      const fromSettings = selectionFromSettings(settings);
      if (!fromSettings) {
        // Settings left on “Ask after each photo” — pick size before auto-crop.
        setPhase('cardsize');
        return;
      }

      await finishAutoCrop(dataUrl, hint, fromSettings);
    },
    [settings, finishAutoCrop],
  );

  const handleCardSizeConfirm = useCallback(
    async (selection: CardSizeSelection) => {
      if (!rawImage) return;
      await finishAutoCrop(rawImage, pendingHint, selection);
    },
    [rawImage, pendingHint, finishAutoCrop],
  );

  const handlePerspectiveComplete = useCallback(async (corrected: string) => {
    setWorkingImage(corrected);
    try {
      const rects = await estimateRectsFromImage(corrected, { padded: true });
      if (returnPhaseAfterEdit === 'crop') {
        setEditorRects({ outer: rects.outer, inner: rects.inner });
        setPhase('crop');
        return;
      }
      showEstimatedResult(corrected, rects.outer, rects.inner, currentSide, activeCardFormat);
    } catch {
      setEditorRects({});
      setPhase(returnPhaseAfterEdit === 'crop' ? 'crop' : 'editor');
    }
  }, [returnPhaseAfterEdit, showEstimatedResult, currentSide, activeCardFormat]);

  const handlePerspectiveSkip = useCallback(() => {
    if (rawImage) {
      setWorkingImage(rawImage);
      setEditorRects({});
      setPhase(returnPhaseAfterEdit === 'crop' ? 'crop' : 'editor');
    }
  }, [rawImage, returnPhaseAfterEdit]);

  const handleCropComplete = useCallback((cropped: string) => {
    setWorkingImage(cropped);
    setEditorRects({});
    setPhase('editor');
  }, []);

  const handleSaveSide = useCallback(
    (snapshot: SideSnapshot) => {
      setSession((prev) => ({ ...prev, [currentSide]: snapshot }));
      if (snapshot.name) {
        setCardNames((prev) => ({ ...prev, [currentSide]: snapshot.name! }));
      }
    },
    [currentSide],
  );

  const loadSideIntoEditor = useCallback((side: CardSide) => {
    const snap = session[side];
    if (snap) {
      setWorkingImage(snap.imageSrc);
      setEditorRects({ outer: snap.outer, inner: snap.inner });
      setCardNames((prev) => ({ ...prev, [side]: snap.name ?? prev[side] }));
      setCurrentSide(side);
      setPhase('editor');
    } else {
      setCurrentSide(side);
      setRawImage(null);
      setWorkingImage(null);
      setEditorRects({});
      setPhase('capture');
    }
  }, [session]);

  const handleSideChange = useCallback(
    (side: CardSide) => {
      loadSideIntoEditor(side);
    },
    [loadSideIntoEditor],
  );

  const handleCaptureSide = useCallback((side: CardSide) => {
    setCurrentSide(side);
    setRawImage(null);
    setWorkingImage(null);
    setEditorRects({});
    setGradeResult(null);
    setSessionCardSize(null);
    setPhase('capture');
  }, []);

  const handleDeleteSide = useCallback((side: CardSide) => {
    setSession((prev) => ({ ...prev, [side]: null }));
    setCardNames((prev) => ({ ...prev, [side]: '' }));
    setCurrentSide(side);
    setRawImage(null);
    setWorkingImage(null);
    setEditorRects({});
    setSessionCardSize(null);
    setPhase('capture');
  }, []);

  const handlePerspectiveFix = useCallback(() => {
    if (!workingImage) return;
    setRawImage(workingImage);
    setPerspectiveCorners(null);
    setReturnPhaseAfterEdit('editor');
    setPhase('perspective');
  }, [workingImage]);

  const handleCrop = useCallback(() => {
    setReturnPhaseAfterEdit('editor');
    setPhase('crop');
  }, []);

  const handleReset = useCallback(() => {
    setSession(emptySession());
    setRawImage(null);
    setWorkingImage(null);
    setEditorRects({});
    setGradeResult(null);
    setCardNames({ front: '', back: '' });
    setCurrentSide('front');
    setSessionCardSize(null);
    setPendingHint(undefined);
    setPhase('capture');
  }, []);

  if (phase === 'library') {
    return (
      <>
        <SavedCardsView
          cards={cards}
          loading={libraryLoading}
          onClose={() => setPhase(libraryReturnPhase)}
          onOpen={handleOpenSavedCard}
          onDelete={deleteFromLibrary}
        />
        <SettingsPanel open={showSettings} settings={settings} onChange={updateSettings} onClose={() => setShowSettings(false)} />
      </>
    );
  }

  if (phase === 'compare') {
    return (
      <>
        <CompareView
          session={session}
          onEdit={loadSideIntoEditor}
          onSaveToLibrary={() => handleSaveToLibrary(session)}
          onLibrary={() => openLibrary('compare')}
          libraryMessage={libraryMessage}
          onClose={() => {
            if (session.front) loadSideIntoEditor('front');
            else if (session.back) loadSideIntoEditor('back');
            else setPhase('capture');
          }}
        />
        <SettingsPanel open={showSettings} settings={settings} onChange={updateSettings} onClose={() => setShowSettings(false)} />
      </>
    );
  }

  if (phase === 'cardsize' && rawImage) {
    return (
      <CardSizePickerScreen
        imageSrc={rawImage}
        initial={{
          cardFormat: 'pokemon',
          customWidthMm: settings.customWidthMm,
          customHeightMm: settings.customHeightMm,
        }}
        onConfirm={(selection) => void handleCardSizeConfirm(selection)}
        onCancel={() => {
          setRawImage(null);
          setPendingHint(undefined);
          setPhase('capture');
        }}
      />
    );
  }

  if (phase === 'autocrop') {
    return (
      <div className="loading" role="status" aria-live="polite">
        Auto-cropping card…
      </div>
    );
  }

  if (phase === 'perspective' && rawImage) {
    return (
      <PerspectiveCorrector
        imageSrc={rawImage}
        invertColors={settings.invertColors}
        initialCorners={perspectiveCorners}
        uncertainDetection={detectionUncertain}
        cardAspect={autoCropOptions.cardAspect}
        onComplete={handlePerspectiveComplete}
        onSkip={handlePerspectiveSkip}
        onCancel={() => setPhase(workingImage ? 'editor' : 'capture')}
      />
    );
  }

  if (phase === 'crop' && workingImage) {
    return (
      <CropEditor
        imageSrc={workingImage}
        invertColors={settings.invertColors}
        onComplete={handleCropComplete}
        onCancel={() => setPhase('editor')}
      />
    );
  }

  if (phase === 'result' && gradeResult) {
    return (
      <CardGradeResult
        result={gradeResult}
        onRetake={() => handleCaptureSide(currentSide)}
        onConfirm={() => {
          if (workingImage && editorRects.outer && editorRects.inner) {
            handleSaveSide(
              snapshotFromRects(
                workingImage,
                editorRects.outer,
                editorRects.inner,
                currentSide,
                activeCardFormat,
                cardNames[currentSide],
              ),
            );
          }
          setPhase('editor');
        }}
      />
    );
  }

  if (phase === 'editor' && workingImage) {
    return (
      <>
        <BorderEditor
          key={`${currentSide}-${workingImage}`}
          imageSrc={workingImage}
          side={currentSide}
          settings={settings}
          cardFormat={activeCardFormat}
          session={session}
          cardName={cardNames[currentSide]}
          initialOuter={editorRects.outer}
          initialInner={editorRects.inner}
          onNameChange={(name) => setCardNames((prev) => ({ ...prev, [currentSide]: name }))}
          onSave={handleSaveSide}
          onSideChange={handleSideChange}
          onCaptureSide={handleCaptureSide}
          onCrop={handleCrop}
          onPerspectiveFix={handlePerspectiveFix}
          onDelete={() => handleDeleteSide(currentSide)}
          onCompare={() => setPhase('compare')}
          onLibrary={() => openLibrary('editor')}
          onSaveToLibrary={handleSaveToLibrary}
          libraryMessage={libraryMessage}
          onSettings={() => setShowSettings(true)}
          onSettingsChange={updateSettings}
          onReset={handleReset}
        />
        <SettingsPanel open={showSettings} settings={settings} onChange={updateSettings} onClose={() => setShowSettings(false)} />
      </>
    );
  }

  return (
    <>
      <ImageCapture
        side={currentSide}
        settings={settings}
        onCapture={handleCapture}
        onSettings={() => setShowSettings(true)}
        onCompare={() => setPhase('compare')}
        onLibrary={() => openLibrary('capture')}
        savedCount={cards.length}
        hasSavedSides={sessionHasAny(session)}
      />
      <SettingsPanel open={showSettings} settings={settings} onChange={updateSettings} onClose={() => setShowSettings(false)} />
    </>
  );
}
