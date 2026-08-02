import type { Rect } from './centering';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function cropImage(imageSrc: string, rect: Rect): Promise<string> {
  const img = await loadImage(imageSrc);
  const x = Math.round(Math.max(0, rect.x));
  const y = Math.round(Math.max(0, rect.y));
  const w = Math.round(Math.min(rect.width, img.naturalWidth - x));
  const h = Math.round(Math.min(rect.height, img.naturalHeight - y));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.92);
}

export function defaultCropRect(imgWidth: number, imgHeight: number): Rect {
  const margin = Math.min(imgWidth, imgHeight) * 0.03;
  return {
    x: margin,
    y: margin,
    width: imgWidth - margin * 2,
    height: imgHeight - margin * 2,
  };
}
