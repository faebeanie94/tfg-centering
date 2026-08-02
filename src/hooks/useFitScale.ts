import { useEffect, useState, type RefObject } from 'react';

interface ImageSize {
  width: number;
  height: number;
}

/** Scale image to fit inside a container while preserving aspect ratio. */
export function useFitScale(
  containerRef: RefObject<HTMLElement | null>,
  imageSize: ImageSize | null,
): number {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!imageSize) return;

    function update() {
      const el = containerRef.current;
      if (!el || !imageSize) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w === 0 || h === 0) return;
      setScale(Math.min(w / imageSize.width, h / imageSize.height));
    }

    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
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
