/** Trading card width / height in portrait orientation. */
export const CARD_ASPECT = 63.5 / 88.9;

export interface DetectedCard {
  left: number;
  top: number;
  width: number;
  height: number;
}

function lum(data: Uint8ClampedArray, px: number): number {
  const i = px * 4;
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

function sampleRay(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  ref: number,
  thresh: number,
): number {
  const steps = Math.max(w, h);
  let lastInside = 0;
  for (let s = 1; s < steps; s++) {
    const x = Math.round(x0 + dx * s);
    const y = Math.round(y0 + dy * s);
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) break;
    const l = lum(data, y * w + x);
    if (Math.abs(l - ref) > thresh) {
      return s - 1;
    }
    lastInside = s;
  }
  return lastInside;
}

/** Force axis-aligned rectangle with trading-card aspect ratio. */
export function enforceCardRect(box: DetectedCard): DetectedCard {
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;

  let width = box.width;
  let height = box.height;
  const ratio = width / height;

  if (ratio > CARD_ASPECT) {
    width = height * CARD_ASPECT;
  } else {
    height = width / CARD_ASPECT;
  }

  let left = cx - width / 2;
  let top = cy - height / 2;

  if (left < 0) left = 0;
  if (top < 0) top = 0;
  if (left + width > 1) left = 1 - width;
  if (top + height > 1) top = 1 - height;

  return { left, top, width, height };
}

export function detectCardBox(video: HTMLVideoElement, canvas: HTMLCanvasElement): DetectedCard | null {
  if (video.videoWidth === 0 || video.videoHeight === 0) return null;

  const w = 240;
  const h = Math.round(w * (video.videoHeight / video.videoWidth));
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const ref = lum(data, cy * w + cx);
  const thresh = 22;

  const leftDist = sampleRay(data, w, h, cx, cy, -1, 0, ref, thresh);
  const rightDist = sampleRay(data, w, h, cx, cy, 1, 0, ref, thresh);
  const upDist = sampleRay(data, w, h, cx, cy, 0, -1, ref, thresh);
  const downDist = sampleRay(data, w, h, cx, cy, 0, 1, ref, thresh);

  if (leftDist < 8 || rightDist < 8 || upDist < 8 || downDist < 8) return null;

  const halfW = (leftDist + rightDist) / 2;
  const halfH = (upDist + downDist) / 2;

  const raw: DetectedCard = {
    left: (cx - halfW) / w,
    top: (cy - halfH) / h,
    width: (halfW * 2) / w,
    height: (halfH * 2) / h,
  };

  if (raw.width < 0.12 || raw.height < 0.12) return null;

  return enforceCardRect(raw);
}

export function defaultGuideBox(): DetectedCard {
  const height = 0.62;
  const width = height * CARD_ASPECT;
  return {
    left: (1 - width) / 2,
    top: (1 - height) / 2,
    width,
    height,
  };
}

export function smoothBox(prev: DetectedCard | null, next: DetectedCard, alpha = 0.35): DetectedCard {
  const blended = !prev
    ? next
    : {
        left: prev.left + (next.left - prev.left) * alpha,
        top: prev.top + (next.top - prev.top) * alpha,
        width: prev.width + (next.width - prev.width) * alpha,
        height: prev.height + (next.height - prev.height) * alpha,
      };
  return enforceCardRect(blended);
}
