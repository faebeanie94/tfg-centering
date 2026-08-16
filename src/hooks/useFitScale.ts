import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

interface ImageSize {
  width: number;
  height: number;
}

/** Scale image to fit inside a container while preserving aspect ratio. */
export function useFitScale(
  containerRef: RefObject<HTMLElement | null>,
  imageSize: ImageSize | null,
): number {
  const [scale, setScale] = useState(0);

  // Layout effect so we measure after the viewport is in the DOM. A plain
  // useEffect can run while the parent still shows a loading stub (ref null),
  // leaving scale stuck at the initial value and the image hugely "zoomed".
  useLayoutEffect(() => {
    if (!imageSize) {
      setScale(0);
      return;
    }

    let raf = 0;
    let attempts = 0;
    const ro = new ResizeObserver(() => {
      measure();
    });

    function measure() {
      const el = containerRef.current;
      if (!el || !imageSize) return false;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w === 0 || h === 0) return false;
      setScale(Math.min(w / imageSize.width, h / imageSize.height));
      return true;
    }

    function tryMeasure() {
      if (measure()) {
        if (containerRef.current) ro.observe(containerRef.current);
        return;
      }
      // Viewport may mount one frame after imageSize is set (async loaders).
      if (attempts++ < 30) {
        raf = requestAnimationFrame(tryMeasure);
      }
    }

    tryMeasure();
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [containerRef, imageSize]);

  return scale;
}

export function useAppShellMode(className: string, active: boolean) {
  useEffect(() => {
    document.body.classList.toggle(className, active);
    document.documentElement.classList.toggle(className, active);
    return () => {
      document.body.classList.remove(className);
      document.documentElement.classList.remove(className);
    };
  }, [className, active]);
}
