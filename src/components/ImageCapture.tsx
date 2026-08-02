import { useRef, useState, useCallback } from 'react';
import { useDeviceLevel } from '../hooks/useDeviceLevel';
import { useAutoCapture } from '../hooks/useAutoCapture';
import type { AppSettings } from '../hooks/useAppSettings';
import type { CardSide } from '../lib/tfg-standards';
import { LevelCrosshair } from './LevelCrosshair';

interface ImageCaptureProps {
  side: CardSide;
  settings: AppSettings;
  onCapture: (dataUrl: string) => void;
  onSettings: () => void;
  onCompare?: () => void;
  hasSavedSides?: boolean;
}

export function ImageCapture({
  side,
  settings,
  onCapture,
  onSettings,
  onCompare,
  hasSavedSides,
}: ImageCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const level = useDeviceLevel(cameraActive && settings.levelIndicators);

  const takePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);
    onCapture(canvas.toDataURL('image/jpeg', 0.92));
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  }, [onCapture]);

  const { progress, isCountingDown } = useAutoCapture({
    enabled: cameraActive && settings.autoCapture && settings.levelIndicators,
    isLevel: level.isLevel,
    delayMs: settings.autoCaptureDelayMs,
    onCapture: takePhoto,
  });

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      setError('Camera access denied or unavailable. Please upload a photo instead.');
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') onCapture(reader.result);
    };
    reader.readAsDataURL(file);
  }

  const canManualCapture =
    !settings.levelIndicators ||
    !level.supported ||
    level.isLevel;

  return (
    <div className="capture">
      <div className="capture-top-bar">
        <span className="capture-side-badge">{side === 'front' ? 'Front' : 'Back'} side</span>
        <div className="capture-top-actions">
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

      <div className="capture-hero">
        <div className="capture-logo">TFG</div>
        <h1>Tree Frog Grading</h1>
        <p>Capture the {side} of your card. Hold level for auto-capture, or tap manually.</p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {cameraActive ? (
        <div className="camera-view">
          <div className="camera-frame">
            <video ref={videoRef} playsInline muted className="camera-video" />
            {settings.levelIndicators && <LevelCrosshair level={level} progress={isCountingDown ? progress : 0} />}
          </div>
          <canvas ref={canvasRef} hidden />

          {settings.autoCapture && settings.levelIndicators && (
            <div className="auto-capture-hint">
              {isCountingDown
                ? `Auto-capturing in ${((1 - progress) * settings.autoCaptureDelayMs / 1000).toFixed(1)}s…`
                : level.isLevel
                  ? 'Hold steady…'
                  : 'Align device parallel to card'}
            </div>
          )}

          <div className="camera-actions">
            <button type="button" className="btn btn-secondary" onClick={stopCamera}>
              Cancel
            </button>
            <button
              type="button"
              className={`btn btn-primary btn-large ${canManualCapture ? '' : 'btn-disabled'}`}
              onClick={takePhoto}
              disabled={!canManualCapture}
            >
              {canManualCapture ? 'Capture' : 'Hold level to capture'}
            </button>
          </div>
        </div>
      ) : (
        <div className="capture-actions">
          <button type="button" className="btn btn-primary btn-large" onClick={startCamera}>
            Take Photo
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-large"
            onClick={() => fileInputRef.current?.click()}
          >
            Upload Image
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={handleFile}
          />
        </div>
      )}

      <div className="capture-tips">
        <h3>Scanner tips</h3>
        <ul>
          <li>Hold your device parallel to the card — crosshairs turn green when level</li>
          <li>Auto-capture fires after 1.5s of steady alignment</li>
          <li>Use a solid, high-contrast background</li>
          <li>Remove sleeves to avoid reflection and edge detection issues</li>
        </ul>
      </div>
    </div>
  );
}
