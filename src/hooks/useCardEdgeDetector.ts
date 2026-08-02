import { useEffect, useRef, useState, type RefObject } from 'react';
import { defaultGuideBox, detectCardBox, smoothBox, type DetectedCard } from '../lib/card-edge-detect';

export function useCardEdgeDetector(active: boolean, videoRef: RefObject<HTMLVideoElement | null>) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const smoothRef = useRef<DetectedCard | null>(null);
  const [cardBox, setCardBox] = useState<DetectedCard>(defaultGuideBox());
  const [detected, setDetected] = useState(false);

  useEffect(() => {
    if (!active) {
      smoothRef.current = null;
      setDetected(false);
      setCardBox(defaultGuideBox());
      return;
    }

    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    let frame = 0;
    let raf = 0;

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2) {
        if (frame % 4 === 0) {
          const found = detectCardBox(video, canvas);
          if (found) {
            smoothRef.current = smoothBox(smoothRef.current, found);
            setCardBox(smoothRef.current);
            setDetected(true);
          } else if (!smoothRef.current) {
            setCardBox(defaultGuideBox());
            setDetected(false);
          }
        }
        frame++;
      }
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, videoRef]);

  return { cardBox, detected };
}
