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
  CardDetector,
  cornersToOverlaySpace,
  overlayCornersToBox,
  type CardCorners,
} from '../components/CardDetector';
import { calculateBlurScore, OVERLAY_SPACE } from '../lib/cardCapture';

function clearLiveLock(detector: CardDetector | null) {
  detector?.resetAutoCapture();
  if (detector) {
    detector.detectedCorners = null;
    detector.confidence = 0;
  }
}

interface CardEdgeDetectorOptions {
  scanDistanceCm: ScanDistanceCm;
  obstructionBottom: number;
  cardAspect?: number;
  cardHeightMm?: number;
  onAutoCapture?: () => void;
  autoCaptureEnabled?: boolean;
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

  const detectorRef = useRef<CardDetector | null>(null);
  if (!detectorRef.current) {
    detectorRef.current = new CardDetector({
      onAutoCapture: () => {
        if (!autoEnabledRef.current || canAutoCaptureRef.current?.() === false) {
          detectorRef.current?.resetAutoCapture();
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
  const [detectorTick, setDetectorTick] = useState(0);

  useEffect(() => {
    clearLiveLock(detectorRef.current);
    const guide = positionGuideBox(template, guideAnchor.x, guideAnchor.y, { obstructionBottom });
    setGuideBox(guide);
    setDetectedBox(null);
    setAlignment(evaluateCardAlignment(null, 0, guide, cardAspect));
    setDetectorTick((n) => n + 1);
  }, [scanDistanceCm, obstructionBottom, template, guideAnchor, cardAspect]);

  useEffect(() => {
    if (!active) {
      clearLiveLock(detectorRef.current);
      const guide = positionGuideBox(template, guideAnchor.x, guideAnchor.y, { obstructionBottom });
      setGuideBox(guide);
      setDetectedBox(null);
      setAlignment(evaluateCardAlignment(null, 0, guide, cardAspect));
      setDetectorTick((n) => n + 1);
      return;
    }

    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    let frame = 0;
    let raf = 0;

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const detector = detectorRef.current;
      if (video && canvas && detector && video.readyState >= 2) {
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

          if (found) {
            const quad = boxToCorners(found.box, frameWidth, frameHeight, found.rotationDeg);
            const preview = evaluateCardAlignment(found.box, found.rotationDeg, guide, cardAspect);
            const confidence = preview.fitsGuide
              ? Math.max(found.score ?? 0.5, 0.9)
              : (found.score ?? 0.4);

            detector.updateDetection({
              corners: cornersToOverlaySpace(
                [quad.tl, quad.tr, quad.br, quad.bl],
                frameWidth,
                frameHeight,
              ),
              confidence,
              blur: calculateBlurScore(canvas),
              imageSize: { width: OVERLAY_SPACE, height: OVERLAY_SPACE },
            });
          } else {
            detector.updateDetection({
              corners: [] as unknown as CardCorners,
              confidence: 0,
            });
          }

          const tracked = detector.detectedCorners
            ? overlayCornersToBox(detector.detectedCorners)
            : null;
          const box = tracked ?? (found ? found.box : null);
          const rotation = found?.rotationDeg ?? 0;

          setGuideBox(guide);
          setDetectedBox(box);
          setAlignment(evaluateCardAlignment(box, rotation, guide, cardAspect));
          setDetectorTick((n) => n + 1);
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
    detector: detectorRef.current,
    detectorTick,
  };
}
