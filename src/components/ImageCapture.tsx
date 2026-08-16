import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useDeviceLevel } from '../hooks/useDeviceLevel';
import { useCardEdgeDetector } from '../hooks/useCardEdgeDetector';
import type { AppSettings } from '../hooks/useAppSettings';
import type { CardSide } from '../lib/tfg-standards';
import {
  openCameraStream,
  applyMaxCaptureResolution,
  cardCenterFromBox,
  focusOnCard,
  getCameraCapabilities,
  setMacroMode,
  setTorch,
  type CameraCapabilities,
} from '../lib/camera-controls';
import { requestMotionPermission } from '../lib/motion-permission';
import {
  queryCameraPermission,
  saveStoredPermissions,
} from '../lib/permissions';
import { getScannerHint } from '../lib/level-hint';
import { ScannerOverlay } from './ScannerOverlay';
import { CardDebugOverlay } from './CardDetector';
import { CardImageProcessor, overlayCornersToImagePixels } from '../utils/cardImageProcessor';
import type { CaptureDetectHint } from '../lib/auto-crop';
import {
  cardAspect,
  fallbackCardFormatForDetection,
  resolveCardFormat,
} from '../lib/card-sizes';

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Unable to read image'));
    };
    reader.onerror = () => reject(new Error('Unable to read image'));
    reader.readAsDataURL(blob);
  });
}

interface ImageCaptureProps {
  side: CardSide;
  settings: AppSettings;
  onCapture: (dataUrl: string, hint?: CaptureDetectHint) => void;
  onSettings: () => void;
  onCompare?: () => void;
  onLibrary?: () => void;
  savedCount?: number;
  hasSavedSides?: boolean;
}

export function ImageCapture({
  side,
  settings,
  onCapture,
  onSettings,
  onCompare,
  onLibrary,
  savedCount = 0,
  hasSavedSides,
}: ImageCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [motionGranted, setMotionGranted] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [macroOn, setMacroOn] = useState(false);
  const [cameraCaps, setCameraCaps] = useState<CameraCapabilities>({ torch: false, macro: false, focus: false });
  const [focusReady, setFocusReady] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [qualityMessage, setQualityMessage] = useState<string | null>(null);
  const scanReadyRef = useRef(false);

  const showLevel = settings.levelIndicators;
  const level = useDeviceLevel(cameraActive && showLevel, motionGranted);
  const scanFormat = useMemo(() => {
    if (settings.cardFormat === 'ask') {
      return fallbackCardFormatForDetection(settings.customWidthMm, settings.customHeightMm);
    }
    return resolveCardFormat({
      cardFormat: settings.cardFormat,
      customWidthMm: settings.customWidthMm,
      customHeightMm: settings.customHeightMm,
    });
  }, [settings.cardFormat, settings.customWidthMm, settings.customHeightMm]);
  const takePhotoRef = useRef<() => void>(() => {});

  const { guideBox, detectedBox, alignment, detector, detectorTick } = useCardEdgeDetector(
    cameraActive,
    videoRef,
    {
      scanDistanceCm: settings.scanDistanceCm,
      obstructionBottom: settings.scanObstructionBottom,
      cardAspect: cardAspect(scanFormat),
      cardHeightMm: scanFormat.heightMm,
      autoCaptureEnabled: settings.autoCapture,
      canAutoCapture: () => {
        if (showLevel && motionGranted && level.supported && !level.isLevel) return false;
        return true;
      },
      onAutoCapture: () => takePhotoRef.current(),
    },
  );
  const detectedBoxRef = useRef(detectedBox);
  const guideBoxRef = useRef(guideBox);
  const alignmentRef = useRef(alignment);
  detectedBoxRef.current = detectedBox;
  guideBoxRef.current = guideBox;
  alignmentRef.current = alignment;

  useEffect(() => {
    void queryCameraPermission();
  }, []);

  useEffect(() => {
    document.body.classList.toggle('scanner-mode', cameraActive);
    return () => document.body.classList.remove('scanner-mode');
  }, [cameraActive]);

  const takePhoto = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || capturing) return;

    setCapturing(true);
    setQualityMessage(null);
    try {
      const track = streamRef.current?.getVideoTracks()[0];
      const box = detectedBoxRef.current ?? guideBoxRef.current;
      const focusPoint = cardCenterFromBox(box);
      if (track) await focusOnCard(track, focusPoint);

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        detector.resetAutoCapture();
        setQualityMessage('Unable to process image');
        return;
      }
      ctx.drawImage(video, 0, 0);

      const imageBytes = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.95);
      });
      if (!imageBytes) {
        detector.resetAutoCapture();
        setQualityMessage('Unable to process image');
        return;
      }

      const overlayCorners = detector.detectedCorners;
      if (overlayCorners) {
        const corners = overlayCornersToImagePixels(overlayCorners, canvas.width, canvas.height);
        const result = await CardImageProcessor.validateAndCorrect(imageBytes, corners);
        setQualityMessage(result.message);
        if (!result.isGoodQuality) {
          detector.resetAutoCapture();
          return;
        }

        const correctedSrc = await blobToDataUrl(result.imageBytes);
        onCapture(correctedSrc, {
          box: detectedBoxRef.current,
          rotationDeg: alignmentRef.current.rotationDeg,
          liveReady: true,
          preCorrected: true,
        });
      } else {
        onCapture(canvas.toDataURL('image/jpeg', 0.95), {
          box: detectedBoxRef.current,
          rotationDeg: alignmentRef.current.rotationDeg,
          liveReady: alignmentRef.current.fitsGuide,
        });
      }

      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCameraActive(false);
      setTorchOn(false);
      setMacroOn(false);
      detector.resetAutoCapture();
    } catch {
      detector.resetAutoCapture();
      setQualityMessage('Unable to process image');
    } finally {
      setCapturing(false);
    }
  }, [onCapture, capturing, detector]);
  takePhotoRef.current = takePhoto;

  const scanReady =
    !showLevel ||
    !level.supported ||
    !motionGranted ||
    (level.isLevel && alignment.fitsGuide);

  // Manual shutter stays available once the phone is level, even if edge detection
  // misses (e.g. holographic glare on white paper). Auto-capture still needs a fit.
  const manualScanReady =
    !showLevel ||
    !level.supported ||
    !motionGranted ||
    level.isLevel;

  const manualCaptureReady = manualScanReady && !capturing && (focusReady || !scanReady);

  useEffect(() => {
    if (!cameraActive || !scanReady) {
      scanReadyRef.current = scanReady;
      if (!scanReady) setFocusReady(true);
      return;
    }

    const justReady = scanReady && !scanReadyRef.current;
    scanReadyRef.current = scanReady;
    if (!justReady) return;

    let cancelled = false;
    setFocusReady(false);

    const fallbackTimer = window.setTimeout(() => {
      if (!cancelled) setFocusReady(true);
    }, 900);

    void (async () => {
      const track = streamRef.current?.getVideoTracks()[0];
      const box = detectedBoxRef.current ?? guideBoxRef.current;
      if (track) await focusOnCard(track, cardCenterFromBox(box));
      if (!cancelled) setFocusReady(true);
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
    };
  }, [cameraActive, scanReady]);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!cameraActive || !video || !stream) return;

    video.srcObject = stream;
    void video.play().catch(() => {
      setError('Could not start camera preview. Please upload a photo instead.');
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCameraActive(false);
    });
  }, [cameraActive]);

  async function applyCameraOptions(track: MediaStreamTrack, torch: boolean, macro: boolean) {
    const caps = getCameraCapabilities(track);
    setCameraCaps(caps);

    if (torch && caps.torch) {
      const ok = await setTorch(track, true);
      setTorchOn(ok);
    } else {
      setTorchOn(false);
    }

    if (macro) {
      const ok = await setMacroMode(track, true);
      setMacroOn(ok);
    } else {
      setMacroOn(false);
    }
  }

  async function enableMotion() {
    const granted = await requestMotionPermission();
    setMotionGranted(granted);
    if (!granted) {
      setError('Motion access was not granted. Tap Enable Motion to try again, or disable levelling in Settings.');
    } else {
      setError(null);
    }
  }

  async function startCamera() {
    setError(null);
    setTorchOn(false);
    setMacroOn(false);

    const cameraState = await queryCameraPermission();
    if (cameraState === 'denied') {
      setError(
        'Camera access is blocked for this site. Open your browser settings → TFG Grader → allow Camera, then try again.',
      );
      return;
    }

    if (showLevel) {
      const granted = await requestMotionPermission();
      setMotionGranted(granted);
    } else {
      setMotionGranted(false);
    }

    try {
      const stream = await openCameraStream();
      saveStoredPermissions({ camera: 'granted' });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      try {
        await applyMaxCaptureResolution(track);
      } catch {
        // keep default stream resolution
      }
      await applyCameraOptions(track, settings.torchEnabled, settings.macroMode);
      setCameraActive(true);
    } catch (err) {
      const denied = err instanceof DOMException && err.name === 'NotAllowedError';
      if (denied) saveStoredPermissions({ camera: 'denied' });
      setError(
        denied
          ? 'Camera access denied. Tap Take Photo again to allow, or enable Camera for this site in your browser settings.'
          : 'Camera unavailable. Please upload a photo instead.',
      );
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setTorchOn(false);
    setMacroOn(false);
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !cameraCaps.torch) return;
    const next = !torchOn;
    const ok = await setTorch(track, next);
    if (ok) setTorchOn(next);
  }

  async function toggleMacro() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !cameraCaps.macro) return;
    const next = !macroOn;
    const ok = await setMacroMode(track, next);
    if (ok) setMacroOn(next);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Allow selecting the same photo again later
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/') && !/\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name)) {
      setError('Please choose an image from your photo library.');
      return;
    }

    setError(null);
    const reader = new FileReader();
    reader.onerror = () => {
      setError('Could not read that image. Try another photo or export as JPEG.');
    };
    reader.onload = () => {
      if (typeof reader.result === 'string') onCapture(reader.result);
    };
    reader.readAsDataURL(file);
  }

  const canManualCapture = manualCaptureReady;

  const statusHint = capturing
    ? 'Focusing…'
    : qualityMessage && qualityMessage !== 'Good scan'
      ? qualityMessage
      : scanReady && !focusReady
        ? 'Focusing on card…'
        : detector.isReadyToCapture
          ? 'CAPTURING...'
          : detector.detectedCorners && detector.confidence >= 0.9 && settings.autoCapture
            ? `HOLD STEADY  ${Math.ceil((1 - detector.captureProgress) * detector.requiredFrames)}`
            : getScannerHint(level, alignment, showLevel);

  if (cameraActive) {
    return (
      <div className="scanner">
        <header className="scanner-header">
          <button type="button" className="scanner-icon-btn" onClick={stopCamera} aria-label="Close">
            ×
          </button>
          <h1 className="scanner-title">Scanner</h1>
          <div className="scanner-header-actions">
            {onLibrary && (
              <button type="button" className="scanner-icon-btn" onClick={onLibrary} aria-label="Saved cards">
                📁{savedCount > 0 ? ` ${savedCount}` : ''}
              </button>
            )}
            {hasSavedSides && onCompare && (
              <button type="button" className="scanner-icon-btn" onClick={onCompare} aria-label="Compare">
                ⇄
              </button>
            )}
            <button type="button" className="scanner-icon-btn" onClick={onSettings} aria-label="Settings">
              ⚙
            </button>
          </div>
        </header>

        <div className="scanner-viewport">
          <div className="scanner-media">
            <video ref={videoRef} playsInline muted className="scanner-video" />
            <ScannerOverlay
              level={level}
              guideBox={guideBox}
              detectedBox={detectedBox}
              alignment={alignment}
              showLevel={showLevel}
            />
            <CardDebugOverlay key={detectorTick} detector={detector} />
          </div>
          <canvas ref={canvasRef} hidden />
        </div>

        <div className="scanner-status">
          <p className="scanner-status-title">{side === 'front' ? 'Front' : 'Back'} · TFG</p>
          <p className="scanner-status-hint">{statusHint}</p>
          {showLevel && !motionGranted && (
            <button type="button" className="btn btn-primary scanner-motion-btn" onClick={enableMotion}>
              Enable Motion
            </button>
          )}
        </div>

        <div className="scanner-controls">
          <button
            type="button"
            className={`scanner-aux-btn ${torchOn ? 'active' : ''}`}
            onClick={toggleTorch}
            disabled={!cameraCaps.torch}
            aria-pressed={torchOn}
          >
            <span className="scanner-aux-icon">🔦</span>
            <span>LED</span>
          </button>

          <button
            type="button"
            className={`scanner-shutter ${canManualCapture ? '' : 'disabled'}`}
            onClick={takePhoto}
            disabled={!canManualCapture}
            aria-label="Capture"
          />

          <button
            type="button"
            className={`scanner-aux-btn ${macroOn ? 'active' : ''}`}
            onClick={toggleMacro}
            disabled={!cameraCaps.macro}
            aria-pressed={macroOn}
          >
            <span className="scanner-aux-icon">✿</span>
            <span>Macro</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="capture capture-idle">
      <div className="capture-top-bar">
        <span className="capture-side-badge">{side === 'front' ? 'Front' : 'Back'} side</span>
        <div className="capture-top-actions">
          {onLibrary && (
            <button type="button" className="btn btn-secondary btn-small" onClick={onLibrary}>
              Library{savedCount > 0 ? ` (${savedCount})` : ''}
            </button>
          )}
          {hasSavedSides && onCompare && (
            <button type="button" className="btn btn-secondary btn-small" onClick={onCompare}>
              Compare
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-small" onClick={onSettings}>
            Settings
          </button>
        </div>
      </div>

      <div className="capture-hero capture-hero-compact">
        <div className="capture-logo">TFG</div>
        <h1>Tree Frog Grading</h1>
        <p>Capture the {side} of your card</p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="capture-actions">
        <button type="button" className="btn btn-primary btn-large" onClick={startCamera}>
          Take Photo
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-large"
          onClick={() => fileInputRef.current?.click()}
        >
          Choose from Photos
        </button>
        {/* No capture attribute — that forces the camera on iOS and blocks the photo library. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.heic,.heif"
          hidden
          onChange={handleFile}
        />
      </div>
    </div>
  );
}
