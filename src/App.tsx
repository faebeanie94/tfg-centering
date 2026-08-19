import { useCallback, useMemo, useState, useEffect } from 'react';
import type { CardSide } from './lib/tfg-standards';
import { useAppSettings } from './hooks/useAppSettings';
import { emptySession, sessionHasAny, type GradingSession, type SideSnapshot } from './lib/session';
import { ImageCapture } from './components/ImageCapture';
import { PerspectiveCorrector } from './components/PerspectiveCorrector';
import { CropEditor } from './components/CropEditor';
import { BorderEditor } from './components/BorderEditor';
import { CompareView } from './components/CompareView';
import { SavedCardsView } from './components/SavedCardsView';
import { SettingsPanel } from './components/SettingsPanel';
import { CardSizePickerScreen, selectionFromSettings } from './components/CardSizeFields';
import { useSavedCards } from './hooks/useSavedCards';
import type { SavedCardRecord } from './lib/saved-cards';
import {
  tryAutoCrop,
  seedEditorRectsFromImage,
  rectsAfterCropWithInnerSeed,
  type CaptureDetectHint,
  type AutoCropSkipReason,
  type InnerSideConfidence,
} from './lib/auto-crop';
import type { QuadCorners } from './lib/perspective';
import {
  cardAspect,
  fallbackCardFormatForDetection,
  resolveCardFormat,
  type CardSizeSelection,
  type CardFormatId,
} from './lib/card-sizes';
import { exportCleanImage } from './lib/export-image';
import { startSubmission, saveToSubmissionFolder, type SubmissionFolder } from './lib/folder-submission';
import { saveSubmissionHandle, listSubmissionHandles, restoreSubmissionHandle, deleteSubmissionHandle } from './lib/submission-persistence';

type Phase =
  | 'capture'
  | 'cardsize'
  | 'autocrop'
  | 'perspective'
  | 'crop'
  | 'editor'
  | 'compare'
  | 'library';

export default function App() {
  const { settings, updateSettings } = useAppSettings();
  const { cards, loading: libraryLoading, save: saveToLibrary, remove: deleteFromLibrary } = useSavedCards();
  const [phase, setPhase] = useState<Phase>('capture');

  // Load saved submissions on mount
  useEffect(() => {
    listSubmissionHandles().then(setSavedSubmissions).catch(console.error);
  }, []);
  const [session, setSession] = useState<GradingSession>(emptySession);
  const [currentSide, setCurrentSide] = useState<CardSide>('front');
  const [rawImage, setRawImage] = useState<string | null>(null);
  const [workingImage, setWorkingImage] = useState<string | null>(null);
  const [editorRects, setEditorRects] = useState<{
    outer?: SideSnapshot['outer'];
    inner?: SideSnapshot['inner'];
    innerSideConfidence?: InnerSideConfidence;
  }>({});
  const [cardNames, setCardNames] = useState<{ front: string; back: string }>({ front: '', back: '' });
  const [showSettings, setShowSettings] = useState(false);
  const [returnPhaseAfterEdit, setReturnPhaseAfterEdit] = useState<Phase>('editor');
  const [libraryReturnPhase, setLibraryReturnPhase] = useState<Phase>('capture');
  const [libraryMessage, setLibraryMessage] = useState<string | null>(null);
  const [perspectiveCorners, setPerspectiveCorners] = useState<QuadCorners | null>(null);
  /** Why auto-crop fell back to manual review — cleared when Perspective Fix is opened by hand. */
  const [autoCropInfo, setAutoCropInfo] = useState<{
    confidence: number;
    reason: AutoCropSkipReason;
  } | null>(null);
  /** Concrete size for this capture — set from Settings or post-capture picker. */
  const [sessionCardSize, setSessionCardSize] = useState<CardSizeSelection | null>(null);
  const [pendingHint, setPendingHint] = useState<CaptureDetectHint | undefined>(undefined);
  const [submissionFolder, setSubmissionFolder] = useState<SubmissionFolder | null>(null);
  const [savedSubmissions, setSavedSubmissions] = useState<Array<{ id: string; name: string; timestamp: number }>>([]);

  const activeCardFormat = useMemo(() => {
    const fromSettings = selectionFromSettings(settings);
    if (fromSettings) return resolveCardFormat(fromSettings);
    if (sessionCardSize) return resolveCardFormat(sessionCardSize);
    return fallbackCardFormatForDetection(settings.customWidthMm, settings.customHeightMm);
  }, [settings, sessionCardSize]);

  const autoCropOptions = useMemo(
    () => ({
      cardAspect: cardAspect(activeCardFormat),
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
    const side = record.session.front || record.session.back;
    const cardFormatId = side?.cardFormatId;
    let selection: CardSizeSelection | null = null;
    if (cardFormatId && cardFormatId !== 'ask') {
      selection = {
        cardFormat: cardFormatId as CardFormatId,
        customWidthMm: settings.customWidthMm,
        customHeightMm: settings.customHeightMm,
      };
    } else {
      selection = selectionFromSettings(settings);
    }
    setSessionCardSize(selection);
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

  const finishAutoCrop = useCallback(
    async (dataUrl: string, hint: CaptureDetectHint | undefined, selection: CardSizeSelection) => {
      setSessionCardSize(selection);
      setPhase('autocrop');
      const format = resolveCardFormat(selection);
      const { result, corners, confidence, skipReason } = await tryAutoCrop(dataUrl, hint, {
        cardAspect: cardAspect(format),
      });
      setPerspectiveCorners(corners);
      // Straight into the editor either way — Perspective Fix is opt-in
      // later (via the editor menu), never a forced stop after capture.
      if (result) {
        setWorkingImage(result.imageSrc);
        setEditorRects({ outer: result.outer, inner: result.inner, innerSideConfidence: result.innerSideConfidence });
        setAutoCropInfo(skipReason ? { confidence, reason: skipReason } : null);
        setPhase('editor');
        return;
      }
      // No usable detection at all — use the raw photo with the best-effort
      // outer/inner rects rather than blocking on a corners screen.
      setWorkingImage(dataUrl);
      setAutoCropInfo(skipReason ? { confidence, reason: skipReason } : null);
      try {
        const rects = await seedEditorRectsFromImage(dataUrl, { cardAspect: cardAspect(format) }, corners, hint);
        setEditorRects({ outer: rects.outer, inner: rects.inner, innerSideConfidence: rects.innerSideConfidence });
      } catch {
        setEditorRects({});
      }
      setPhase('editor');
    },
    [],
  );

  const handleCapture = useCallback(
    async (dataUrl: string, hint?: CaptureDetectHint) => {
      setRawImage(dataUrl);
      setPendingHint(hint);
      setEditorRects({});
      setPerspectiveCorners(null);
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
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = corrected;
      });
      const rects = rectsAfterCropWithInnerSeed(img);
      setEditorRects({ outer: rects.outer, inner: rects.inner, innerSideConfidence: rects.innerSideConfidence });
    } catch {
      setEditorRects({});
    }
    setPhase(returnPhaseAfterEdit === 'crop' ? 'crop' : 'editor');
  }, [returnPhaseAfterEdit]);

  const handlePerspectiveSkip = useCallback(async () => {
    if (!rawImage) return;
    setWorkingImage(rawImage);
    setPhase('autocrop');
    try {
      const rects = await seedEditorRectsFromImage(
        rawImage,
        autoCropOptions,
        perspectiveCorners,
        pendingHint,
      );
      setEditorRects({ outer: rects.outer, inner: rects.inner, innerSideConfidence: rects.innerSideConfidence });
    } catch {
      setEditorRects({});
    }
    setPhase(returnPhaseAfterEdit === 'crop' ? 'crop' : 'editor');
  }, [rawImage, returnPhaseAfterEdit, autoCropOptions, perspectiveCorners, pendingHint]);

  const handleCropComplete = useCallback(async (cropped: string) => {
    setWorkingImage(cropped);
    try {
      const rects = await seedEditorRectsFromImage(cropped, autoCropOptions);
      setEditorRects({ outer: rects.outer, inner: rects.inner, innerSideConfidence: rects.innerSideConfidence });
    } catch {
      setEditorRects({});
    }
    setPhase('editor');
  }, [autoCropOptions]);

  const handleSaveSide = useCallback(
    async (snapshot: SideSnapshot) => {
      setSession((prev) => ({ ...prev, [currentSide]: snapshot }));
      if (snapshot.name) {
        setCardNames((prev) => ({ ...prev, [currentSide]: snapshot.name! }));
      }

      // Check if editing a library entry from a submission and sync back
      const cardNameMatch = cardNames[currentSide]?.match(/^([^/]+)\/(\d+)$/);
      const isSubmissionCard = cardNameMatch && submissionFolder && cardNameMatch[1] === submissionFolder.name;

      // Auto-save clean image to submission folder if active
      if (submissionFolder && snapshot.imageSrc) {
        try {
          const cleanDataUrl = await exportCleanImage(snapshot.imageSrc);

          if (isSubmissionCard) {
            // Editing an existing submission card - update it in place
            const cardNum = parseInt(cardNameMatch![2], 10);
            submissionFolder.currentEdit = { cardNumber: cardNum, side: currentSide };
          }

          await saveToSubmissionFolder(submissionFolder, cleanDataUrl, currentSide);
          setSubmissionFolder((prev) => prev ? { ...prev } : null);

          // Auto-save to library when BOTH sides are complete, using submission name + card number
          const updatedSession = { ...session, [currentSide]: snapshot };
          if (updatedSession.front && updatedSession.back) {
            try {
              // Determine which card number was just completed
              const cardNum = submissionFolder.lastSideSaved === 'back'
                ? submissionFolder.nextCardNumber - 1
                : submissionFolder.nextCardNumber;
              const libraryLabel = `${submissionFolder.name}/${cardNum}`;
              await saveToLibrary(updatedSession, libraryLabel);
            } catch (err) {
              console.error('Failed to auto-save to library:', err);
            }
          }
        } catch (err) {
          console.error('Failed to save to submission folder:', err);
        }
      }
    },
    [currentSide, submissionFolder, session, cardNames, saveToLibrary],
  );

  const loadSideIntoEditor = useCallback((side: CardSide) => {
    const snap = session[side];
    setAutoCropInfo(null);
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
    setSessionCardSize(null);
    setAutoCropInfo(null);
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
    setAutoCropInfo(null);
    setPhase('capture');
  }, []);

  const handlePerspectiveFix = useCallback(() => {
    if (!workingImage) return;
    setRawImage(workingImage);
    setPerspectiveCorners(null);
    setAutoCropInfo(null);
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
    setCardNames({ front: '', back: '' });
    setCurrentSide('front');
    setSessionCardSize(null);
    setPendingHint(undefined);
    setAutoCropInfo(null);
    setPhase('capture');
  }, []);

  const handleStartSubmission = useCallback(async () => {
    try {
      const folder = await startSubmission();
      setSubmissionFolder(folder);
      // Save handle for later restoration (only for filesystem submissions)
      if (folder.type === 'filesystem') {
        await saveSubmissionHandle((folder as any).handle, folder.name);
      }
      // Refresh saved submissions list
      const saved = await listSubmissionHandles();
      setSavedSubmissions(saved);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Failed to start submission:', err);
      }
    }
  }, []);

  const handleRestoreSubmission = useCallback(async (id: string) => {
    try {
      const handle = await restoreSubmissionHandle(id);
      if (!handle) {
        // Handle is invalid, remove from list
        setSavedSubmissions((prev) => prev.filter((s) => s.id !== id));
        return;
      }

      const submission = savedSubmissions.find((s) => s.id === id);
      if (submission && handle) {
        const fsSubmission = {
          type: 'filesystem' as const,
          handle,
          name: submission.name,
          nextCardNumber: 1,
          currentEdit: null as any,
          lastSideSaved: null as any,
        };
        setSubmissionFolder(fsSubmission);
      }
    } catch (err) {
      console.error('Failed to restore submission:', err);
    }
  }, [savedSubmissions]);

  const handleDeleteSubmission = useCallback(async (id: string) => {
    try {
      await deleteSubmissionHandle(id);
      setSavedSubmissions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error('Failed to delete submission:', err);
    }
  }, []);

  const handleEndSubmission = useCallback(() => {
    setSubmissionFolder(null);
  }, []);

  const handleRetakeSubmission = useCallback(() => {
    if (submissionFolder) {
      submissionFolder.lastSideSaved = null;
    }
    handleCaptureSide(currentSide);
  }, [submissionFolder, currentSide, handleCaptureSide]);

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
          innerSideConfidence={editorRects.innerSideConfidence}
          autoCropInfo={autoCropInfo}
          onDismissAutoCropInfo={() => setAutoCropInfo(null)}
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
          submissionFolder={submissionFolder}
          onEndSubmission={handleEndSubmission}
          onRetakeSubmission={handleRetakeSubmission}
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
        submissionFolder={submissionFolder}
        onStartSubmission={handleStartSubmission}
        onEndSubmission={handleEndSubmission}
        savedSubmissions={savedSubmissions}
        onRestoreSubmission={handleRestoreSubmission}
        onDeleteSubmission={handleDeleteSubmission}
      />
      <SettingsPanel open={showSettings} settings={settings} onChange={updateSettings} onClose={() => setShowSettings(false)} />
    </>
  );
}
