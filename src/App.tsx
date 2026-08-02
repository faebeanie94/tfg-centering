import { useCallback, useState } from 'react';
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
import { useSavedCards } from './hooks/useSavedCards';
import type { SavedCardRecord } from './lib/saved-cards';

type Phase = 'capture' | 'perspective' | 'crop' | 'editor' | 'compare' | 'library';

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
  }, []);

  const handleCapture = useCallback((dataUrl: string) => {
    setRawImage(dataUrl);
    setEditorRects({});
    setReturnPhaseAfterEdit('editor');
    setPhase('perspective');
  }, []);

  const handlePerspectiveComplete = useCallback((corrected: string) => {
    setWorkingImage(corrected);
    setEditorRects({});
    setPhase(returnPhaseAfterEdit === 'crop' ? 'crop' : 'editor');
  }, [returnPhaseAfterEdit]);

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
    setPhase('capture');
  }, []);

  const handleDeleteSide = useCallback((side: CardSide) => {
    setSession((prev) => ({ ...prev, [side]: null }));
    setCardNames((prev) => ({ ...prev, [side]: '' }));
    setCurrentSide(side);
    setRawImage(null);
    setWorkingImage(null);
    setEditorRects({});
    setPhase('capture');
  }, []);

  const handlePerspectiveFix = useCallback(() => {
    if (!workingImage) return;
    setRawImage(workingImage);
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

  if (phase === 'perspective' && rawImage) {
    return (
      <PerspectiveCorrector
        imageSrc={rawImage}
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
