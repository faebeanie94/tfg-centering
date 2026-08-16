import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  CARD_ASPECT,
  DEFAULT_CARD_HEIGHT_MM,
  defaultGuideAnchorY,
  detectCardFrame,
  guideTemplateForDistance,
  positionGuideBox,
  type DetectedCard,
  type ScanDistanceCm,
} from '../lib/card-edge-detect';
import { evaluateCardAlignment, type CardAlignmentState } from '../lib/card-alignment';
import { boxToCorners } from '../lib/auto-crop';
import {
  CardTracker,
  cornersToNormalizedBox,
  emptyTrackerSnapshot,
  type CardTrackerSnapshot,
} from '../lib/card-tracker';

interface CardEdgeDetectorOptions {
  scanDistanceCm: ScanDistanceCm;
  obstructionBottom: number;
  cardAspect?: number;
  cardHeightMm?: number;
  onAutoCapture?: () => void;
  autoCaptureEnabled?: boolean;
  /** Return false to skip this auto-capture (e.g. phone not level) and try again. */
  canAutoCapture?: () => boolean;
}

export function useCardEdgeDetector(
  active: boolean,
  videoRef: RefObject<HTMLVideoElement | null>,
  {
    scanDistanceCm,
    obstructionBottom,
    cardAspect = CARD_ASPECT,
    cardHeightMm = DEFAULT_CARD_HEIGHT_MM,
    onAutoCapture,
    autoCaptureEnabled = false,
    canAutoCapture,
  }: CardEdgeDetectorOptions,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onAutoCaptureRef = useRef(onAutoCapture);
  onAutoCaptureRef.current = onAutoCapture;
  const autoEnabledRef = useRef(autoCaptureEnabled);
  autoEnabledRef.current = autoCaptureEnabled;
  const canAutoCaptureRef = useRef(canAutoCapture);
  canAutoCaptureRef.current = canAutoCapture;

  const trackerRef = useRef<CardTracker | null>(null);
  if (!trackerRef.current) {
    trackerRef.current = new CardTracker({
      minimumConfidence: 0.88,
      requiredStableFrames: 8,
      maximumCornerMovement: 18,
      smoothingFactor: 0.3,
      onAutoCapture: () => {
        if (!autoEnabledRef.current || canAutoCaptureRef.current?.() === false) {
          trackerRef.current?.allowNextCapture();
          return;
        }
        onAutoCaptureRef.current?.();
      },
    });
  }

  const template = useMemo(
    () => guideTemplateForDistance(scanDistanceCm, cardAspect, cardHeightMm),
    [scanDistanceCm, cardAspect, cardHeightMm],
  );

  const guideAnchor = useMemo(
    () => ({
      x: 0.5,
      y: defaultGuideAnchorY(template.height, obstructionBottom),
    }),
    [template.height, obstructionBottom],
  );

  const [guideBox, setGuideBox] = useState<DetectedCard>(() =>
    positionGuideBox(template, guideAnchor.x, guideAnchor.y, { obstructionBottom }),
  );
  const [detectedBox, setDetectedBox] = useState<DetectedCard | null>(null);
  const [alignment, setAlignment] = useState<CardAlignmentState>(() =>
    evaluateCardAlignment(null, 0, guideBox, cardAspect),
  );
  const [tracker, setTracker] = useState<CardTrackerSnapshot>(() => emptyTrackerSnapshot());
  const [analysisSize, setAnalysisSize] = useState({ width: 240, height: 426 });

  useEffect(() => {
    trackerRef.current?.reset();
    const guide = positionGuideBox(template, guideAnchor.x, guideAnchor.y, { obstructionBottom });
    setGuideBox(guide);
    setDetectedBox(null);
    setAlignment(evaluateCardAlignment(null, 0, guide, cardAspect));
    setTracker(emptyTrackerSnapshot());
  }, [scanDistanceCm, obstructionBottom, template, guideAnchor, cardAspect]);

  useEffect(() => {
    if (!active) {
      trackerRef.current?.reset();
      const guide = positionGuideBox(template, guideAnchor.x, guideAnchor.y, { obstructionBottom });
      setGuideBox(guide);
      setDetectedBox(null);
      setAlignment(evaluateCardAlignment(null, 0, guide, cardAspect));
      setTracker(emptyTrackerSnapshot());
      return;
    }

    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    let frame = 0;
    let raf = 0;

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const cardTracker = trackerRef.current;
      if (video && canvas && cardTracker && video.readyState >= 2) {
        if (frame % 3 === 0) {
          const guide = positionGuideBox(template, guideAnchor.x, guideAnchor.y, { obstructionBottom });
          const search = {
            cx: guideAnchor.x,
            cy: guideAnchor.y,
            expectedWidth: template.width,
            expectedHeight: template.height,
            cardAspect,
          };
          const found = detectCardFrame(video, canvas, search);
          const frameWidth = canvas.width || 240;
          const frameHeight = canvas.height || Math.round(frameWidth * 1.77);
          setAnalysisSize({ width: frameWidth, height: frameHeight });

          if (found) {
            const quad = boxToCorners(found.box, frameWidth, frameHeight, found.rotationDeg);
            const preview = evaluateCardAlignment(found.box, found.rotationDeg, guide, cardAspect);
            const confidence = preview.fitsGuide
              ? Math.max(found.score ?? 0.5, 0.9)
              : (found.score ?? 0.4);

            cardTracker.setDetection({
              corners: [quad.tl, quad.tr, quad.br, quad.bl],
              confidence,
              frameWidth,
              frameHeight,
            });
          } else {
            cardTracker.setDetection({
              corners: [],
              confidence: 0,
              frameWidth,
              frameHeight,
            });
          }

          const snap = cardTracker.snapshot();
          const trackedBox = cornersToNormalizedBox(snap.corners, frameWidth, frameHeight);
          const box = trackedBox ?? (found ? found.box : null);
          const rotation = found?.rotationDeg ?? 0;

          setGuideBox(guide);
          setDetectedBox(box);
          setAlignment(evaluateCardAlignment(box, rotation, guide, cardAspect));
          setTracker(snap);
        }
        frame++;
      }
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, videoRef, template, guideAnchor, obstructionBottom, cardAspect]);

  return {
    guideBox,
    detectedBox,
    alignment,
    detected: detectedBox !== null,
    tracker,
    analysisSize,
  };
}
