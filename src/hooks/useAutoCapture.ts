import { useEffect, useRef, useState } from 'react';

interface UseAutoCaptureOptions {
  enabled: boolean;
  isLevel: boolean;
  delayMs: number;
  onCapture: () => void;
}

export function useAutoCapture({ enabled, isLevel, delayMs, onCapture }: UseAutoCaptureOptions) {
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const onCaptureRef = useRef(onCapture);
  onCaptureRef.current = onCapture;

  useEffect(() => {
    if (!enabled || !isLevel) {
      startRef.current = null;
      setProgress(0);
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
      return;
    }

    startRef.current = performance.now();

    function tick(now: number) {
      if (!startRef.current) return;
      const elapsed = now - startRef.current;
      const p = Math.min(elapsed / delayMs, 1);
      setProgress(p);
      if (p >= 1) {
        onCaptureRef.current();
        startRef.current = null;
        setProgress(0);
        return;
      }
      timerRef.current = requestAnimationFrame(tick);
    }

    timerRef.current = requestAnimationFrame(tick);
    return () => {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
    };
  }, [enabled, isLevel, delayMs]);

  return { progress, isCountingDown: enabled && isLevel && progress > 0 };
}
