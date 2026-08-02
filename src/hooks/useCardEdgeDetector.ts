import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
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
}

export function useCardEdgeDetector(
  active: boolean,
  videoRef: RefObject<HTMLVideoElement | null>,
  { scanDistanceCm, obstructionBottom }: CardEdgeDetectorOptions,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const smoothRef = useRef<DetectedCard | null>(null);
  const rotationRef = useRef(0);
  const missFramesRef = useRef(0);

  const template = useMemo(() => guideTemplateForDistance(scanDistanceCm), [scanDistanceCm]);

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
    evaluateCardAlignment(null, 0, guideBox),
  );

  useEffect(() => {
    smoothRef.current = null;
    rotationRef.current = 0;
    missFramesRef.current = 0;
    const guide = positionGuideBox(template, guideAnchor.x, guideAnchor.y, { obstructionBottom });
    setGuideBox(guide);
    setDetectedBox(null);
    setAlignment(evaluateCardAlignment(null, 0, guide));
  }, [scanDistanceCm, obstructionBottom, template, guideAnchor]);

  useEffect(() => {
    if (!active) {
      smoothRef.current = null;
      rotationRef.current = 0;
      missFramesRef.current = 0;
      const guide = positionGuideBox(template, guideAnchor.x, guideAnchor.y, { obstructionBottom });
      setGuideBox(guide);
      setDetectedBox(null);
      setAlignment(evaluateCardAlignment(null, 0, guide));
      return;
    }

    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    let frame = 0;
    let raf = 0;

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2) {
        if (frame % 3 === 0) {
          const guide = positionGuideBox(template, guideAnchor.x, guideAnchor.y, { obstructionBottom });
          const search = {
            cx: guideAnchor.x,
            cy: guideAnchor.y,
            expectedWidth: template.width,
            expectedHeight: template.height,
          };
          const found = detectCardFrame(video, canvas, search);

          if (found) {
            const candidate = found.box;
            if (shouldAcceptDetection(smoothRef.current, candidate)) {
              missFramesRef.current = 0;
              smoothRef.current = smoothBox(smoothRef.current, candidate);
              rotationRef.current = rotationRef.current * 0.7 + found.rotationDeg * 0.3;
            } else {
              missFramesRef.current = 0;
            }
            const box = smoothRef.current;
            if (box) {
              const next = evaluateCardAlignment(box, rotationRef.current, guide);
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
  }, [active, videoRef, template, guideAnchor, obstructionBottom]);

  return {
    guideBox,
    detectedBox,
    alignment,
    detected: detectedBox !== null,
  };
}
