import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  CARD_ASPECT,
  DEFAULT_CARD_HEIGHT_MM,
  defaultGuideAnchorY,
  detectCardFrame,
  guideTemplateForDistance,
  positionGuideBox,
  shouldAcceptDetection,
  smoothBox,
  type DetectedCard,
  type ScanDistanceCm,
} from '../lib/card-edge-detect';
import { evaluateCardAlignment, type CardAlignmentState } from '../lib/card-alignment';

interface CardEdgeDetectorOptions {
  scanDistanceCm: ScanDistanceCm;
  obstructionBottom: number;
  /** Portrait width/height for the selected card format. */
  cardAspect?: number;
  /** Physical card height (mm) for distance-based guide sizing. */
  cardHeightMm?: number;
}

export function useCardEdgeDetector(
  active: boolean,
  videoRef: RefObject<HTMLVideoElement | null>,
  {
    scanDistanceCm,
    obstructionBottom,
    cardAspect = CARD_ASPECT,
    cardHeightMm = DEFAULT_CARD_HEIGHT_MM,
  }: CardEdgeDetectorOptions,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const smoothRef = useRef<DetectedCard | null>(null);
  const rotationRef = useRef(0);
  const missFramesRef = useRef(0);

  const [frameAspect, setFrameAspect] = useState(3 / 4);

  const template = useMemo(
    () =>
      guideTemplateForDistance(
        scanDistanceCm,
        cardAspect,
        cardHeightMm,
        frameAspect,
        obstructionBottom,
      ),
    [scanDistanceCm, cardAspect, cardHeightMm, frameAspect, obstructionBottom],
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

  useEffect(() => {
    smoothRef.current = null;
    rotationRef.current = 0;
    missFramesRef.current = 0;
    const guide = positionGuideBox(template, guideAnchor.x, guideAnchor.y, { obstructionBottom });
    setGuideBox(guide);
    setDetectedBox(null);
    setAlignment(evaluateCardAlignment(null, 0, guide, cardAspect));
  }, [scanDistanceCm, obstructionBottom, template, guideAnchor, cardAspect]);

  useEffect(() => {
    if (!active) {
      smoothRef.current = null;
      rotationRef.current = 0;
      missFramesRef.current = 0;
      const guide = positionGuideBox(template, guideAnchor.x, guideAnchor.y, { obstructionBottom });
      setGuideBox(guide);
      setDetectedBox(null);
      setAlignment(evaluateCardAlignment(null, 0, guide, cardAspect));
      return;
    }

    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    let frame = 0;
    let raf = 0;

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2) {
        if (video.videoWidth > 0) {
          const fa = video.videoWidth / video.videoHeight;
          if (Math.abs(fa - frameAspect) > 0.02) setFrameAspect(fa);
        }
        if (frame % 3 === 0) {
          const guide = positionGuideBox(template, guideAnchor.x, guideAnchor.y, { obstructionBottom });
          const search = {
            cx: guideAnchor.x,
            cy: guideAnchor.y,
            expectedWidth: template.width,
            expectedHeight: template.height,
            cardAspect,
            maxBottom: 1 - obstructionBottom,
          };
          const found = detectCardFrame(video, canvas, search);

          if (found) {
            const candidate = found.box;
            if (shouldAcceptDetection(smoothRef.current, candidate)) {
              missFramesRef.current = 0;
              smoothRef.current = smoothBox(smoothRef.current, candidate, 0.2, cardAspect, frameAspect);
              rotationRef.current = rotationRef.current * 0.7 + found.rotationDeg * 0.3;
            } else {
              missFramesRef.current = 0;
            }
            const box = smoothRef.current;
            if (box) {
              const next = evaluateCardAlignment(box, rotationRef.current, guide, cardAspect, frameAspect);
              setGuideBox(guide);
              setDetectedBox({ ...box });
              setAlignment(next);
            }
          } else {
            missFramesRef.current++;
            setGuideBox(guide);
            if (missFramesRef.current > 15) {
              smoothRef.current = null;
              setDetectedBox(null);
              setAlignment(evaluateCardAlignment(null, 0, guide, cardAspect));
            }
          }
        }
        frame++;
      }
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, videoRef, template, guideAnchor, obstructionBottom, cardAspect, frameAspect]);

  return {
    guideBox,
    detectedBox,
    alignment,
    detected: detectedBox !== null,
  };
}
