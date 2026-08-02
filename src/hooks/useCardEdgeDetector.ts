import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  defaultGuideAnchorY,
  detectCardFrame,
  guideTemplateForDistance,
  positionGuideBox,
  smoothBox,
  type DetectedCard,
  type ScanDistanceCm,
} from '../lib/card-edge-detect';
import { evaluateCardAlignment, type CardAlignmentState } from '../lib/card-alignment';

interface CardEdgeDetectorOptions {
  scanDistanceCm: ScanDistanceCm;
  /** Bottom fraction of the frame blocked by a phone stand (0–0.5). */
  obstructionBottom: number;
}

export function useCardEdgeDetector(
  active: boolean,
  videoRef: RefObject<HTMLVideoElement | null>,
  { scanDistanceCm, obstructionBottom }: CardEdgeDetectorOptions,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const smoothRef = useRef<DetectedCard | null>(null);
  const rotationRef = useRef(0);
  const anchorRef = useRef<{ x: number; y: number } | null>(null);

  const template = useMemo(() => guideTemplateForDistance(scanDistanceCm), [scanDistanceCm]);

  const defaultAnchor = useMemo(
    () => ({
      x: 0.5,
      y: defaultGuideAnchorY(template.height, obstructionBottom),
    }),
    [template.height, obstructionBottom],
  );

  const [guideBox, setGuideBox] = useState<DetectedCard>(() =>
    positionGuideBox(template, defaultAnchor.x, defaultAnchor.y, { obstructionBottom }),
  );
  const [detectedBox, setDetectedBox] = useState<DetectedCard | null>(null);
  const [alignment, setAlignment] = useState<CardAlignmentState>(() =>
    evaluateCardAlignment(null, 0, guideBox),
  );

  useEffect(() => {
    smoothRef.current = null;
    rotationRef.current = 0;
    anchorRef.current = defaultAnchor;
    const guide = positionGuideBox(template, defaultAnchor.x, defaultAnchor.y, { obstructionBottom });
    setGuideBox(guide);
    setDetectedBox(null);
    setAlignment(evaluateCardAlignment(null, 0, guide));
  }, [scanDistanceCm, obstructionBottom, template, defaultAnchor]);

  useEffect(() => {
    if (!active) {
      smoothRef.current = null;
      rotationRef.current = 0;
      anchorRef.current = defaultAnchor;
      const guide = positionGuideBox(template, defaultAnchor.x, defaultAnchor.y, { obstructionBottom });
      setGuideBox(guide);
      setDetectedBox(null);
      setAlignment(evaluateCardAlignment(null, 0, guide));
      return;
    }

    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    let frame = 0;
    let raf = 0;

    function updateGuideAnchor(detected: DetectedCard) {
      const cardCx = detected.left + detected.width / 2;
      const cardCy = detected.top + detected.height / 2;
      const prev = anchorRef.current ?? defaultAnchor;
      const blended = {
        x: prev.x * 0.55 + cardCx * 0.45,
        y: prev.y * 0.55 + cardCy * 0.45,
      };
      anchorRef.current = blended;
      return positionGuideBox(template, blended.x, blended.y, { obstructionBottom });
    }

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2) {
        if (frame % 4 === 0) {
          const found = detectCardFrame(video, canvas);
          if (found) {
            smoothRef.current = smoothBox(smoothRef.current, found.box);
            rotationRef.current = rotationRef.current * 0.65 + found.rotationDeg * 0.35;
            const guide = updateGuideAnchor(smoothRef.current);
            const next = evaluateCardAlignment(smoothRef.current, rotationRef.current, guide);
            setGuideBox(guide);
            setDetectedBox(smoothRef.current);
            setAlignment(next);
          } else {
            const anchor = anchorRef.current ?? defaultAnchor;
            const guide = positionGuideBox(template, anchor.x, anchor.y, { obstructionBottom });
            setGuideBox(guide);
            if (!smoothRef.current) {
              setDetectedBox(null);
              setAlignment(evaluateCardAlignment(null, 0, guide));
            }
          }
        }
        frame++;
      }
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, videoRef, template, defaultAnchor, obstructionBottom]);

  return {
    guideBox,
    detectedBox,
    alignment,
    detected: detectedBox !== null,
  };
}
