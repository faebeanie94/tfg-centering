import { CARD_ASPECT, type DetectedCard } from './card-edge-detect';
import type { PixelBuffer } from './inner-artwork';
import type { Rect } from './centering';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lumAt(image: PixelBuffer, x: number, y: number): number {
  const xi = clamp(Math.round(x), 0, image.width - 1);
  const yi = clamp(Math.round(y), 0, image.height - 1);
  const i = (yi * image.width + xi) * 4;
  return 0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2];
}

export function downscalePixelBuffer(
  image: PixelBuffer,
  maxWidth = 480,
): { buffer: PixelBuffer; scale: number } {
  const scale = Math.min(1, maxWidth / Math.max(1, image.width));
  if (scale >= 0.999) return { buffer: image, scale: 1 };
  const width = Math.max(32, Math.round(image.width * scale));
  const height = Math.max(32, Math.round(image.height * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(image.height - 1, Math.floor(y / scale));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(image.width - 1, Math.floor(x / scale));
      const si = (sy * image.width + sx) * 4;
      const di = (y * width + x) * 4;
      data[di] = image.data[si];
      data[di + 1] = image.data[si + 1];
      data[di + 2] = image.data[si + 2];
      data[di + 3] = 255;
    }
  }
  return { buffer: { width, height, data }, scale };
}

export function scaleRect(rect: Rect, factor: number): Rect {
  return {
    x: rect.x * factor,
    y: rect.y * factor,
    width: rect.width * factor,
    height: rect.height * factor,
  };
}

export function rectLooksLikeCard(
  rect: Rect,
  imgW: number,
  imgH: number,
  cardAspect: number,
): boolean {
  if (rect.width < 8 || rect.height < 8) return false;
  const area = (rect.width * rect.height) / (imgW * imgH);
  if (area < 0.04 || area > 0.94) return false;
  const pix = rect.width / rect.height;
  const err = Math.min(Math.abs(pix - cardAspect), Math.abs(pix - 1 / cardAspect));
  return err <= 0.18;
}

/** Inside vs outside luminance jump along the four sides. */
export function outerSeparationScore(image: PixelBuffer, rect: Rect): number {
  const inset = Math.max(3, Math.round(Math.min(rect.width, rect.height) * 0.04));
  const outset = inset;
  const sides = [
    Math.abs(
      meanBand(image, rect.x + inset, rect.y + 6, rect.x + inset + 3, rect.y + rect.height - 6) -
        meanBand(image, rect.x - outset - 3, rect.y + 6, rect.x - outset, rect.y + rect.height - 6),
    ),
    Math.abs(
      meanBand(
        image,
        rect.x + rect.width - inset - 3,
        rect.y + 6,
        rect.x + rect.width - inset,
        rect.y + rect.height - 6,
      ) -
        meanBand(
          image,
          rect.x + rect.width + outset,
          rect.y + 6,
          rect.x + rect.width + outset + 3,
          rect.y + rect.height - 6,
        ),
    ),
    Math.abs(
      meanBand(image, rect.x + 6, rect.y + inset, rect.x + rect.width - 6, rect.y + inset + 3) -
        meanBand(image, rect.x + 6, rect.y - outset - 3, rect.x + rect.width - 6, rect.y - outset),
    ),
    Math.abs(
      meanBand(
        image,
        rect.x + 6,
        rect.y + rect.height - inset - 3,
        rect.x + rect.width - 6,
        rect.y + rect.height - inset,
      ) -
        meanBand(
          image,
          rect.x + 6,
          rect.y + rect.height + outset,
          rect.x + rect.width - 6,
          rect.y + rect.height + outset + 3,
        ),
    ),
  ];
  return clamp(sides.reduce((s, v) => s + v, 0) / sides.length / 36, 0, 1);
}

function meanBand(image: PixelBuffer, x0: number, y0: number, x1: number, y1: number): number {
  const xa = clamp(Math.min(x0, x1), 0, image.width - 1);
  const xb = clamp(Math.max(x0, x1), 0, image.width - 1);
  const ya = clamp(Math.min(y0, y1), 0, image.height - 1);
  const yb = clamp(Math.max(y0, y1), 0, image.height - 1);
  let sum = 0;
  let n = 0;
  const step = 2;
  for (let y = ya; y <= yb; y += step) {
    for (let x = xa; x <= xb; x += step) {
      sum += lumAt(image, x, y);
      n++;
    }
  }
  return n ? sum / n : 0;
}

/**
 * Find the card as an axis-aligned box on a still photo.
 * Uses whole-image edge lines (not the live scanner guide) plus a background-blob fallback.
 */
export function detectOuterRectWholeImage(
  image: PixelBuffer,
  cardAspect: number = CARD_ASPECT,
): Rect | null {
  const { buffer, scale } = downscalePixelBuffer(image, 420);
  const fromLines = detectByEdgeLines(buffer, cardAspect);
  const fromBlob = detectByForegroundBlob(buffer, cardAspect);
  const picked = pickBetter(buffer, fromLines, fromBlob, cardAspect);
  if (!picked) return null;
  return scale === 1 ? picked : scaleRect(picked, 1 / scale);
}

function pickBetter(
  image: PixelBuffer,
  a: Rect | null,
  b: Rect | null,
  cardAspect: number,
): Rect | null {
  const score = (r: Rect | null) => {
    if (!r || !rectLooksLikeCard(r, image.width, image.height, cardAspect)) return -1;
    const pix = r.width / r.height;
    const aspect = 1 - Math.min(Math.abs(pix - cardAspect), Math.abs(pix - 1 / cardAspect)) / 0.18;
    return outerSeparationScore(image, r) * 0.7 + aspect * 0.3;
  };
  const sa = score(a);
  const sb = score(b);
  if (sa < 0.12 && sb < 0.12) return sa >= sb ? a : b;
  return sa >= sb ? a : b;
}

function detectByEdgeLines(image: PixelBuffer, cardAspect: number): Rect | null {
  const { width: w, height: h } = image;
  const mag = sobelMag(image);
  const verticals = peakPositions(columnEdge(mag, w, h), 8, 12);
  const horizontals = peakPositions(rowEdge(mag, w, h), 8, 12);
  let best: Rect | null = null;
  let bestScore = -1;

  for (let i = 0; i < verticals.length; i++) {
    for (let j = i + 1; j < verticals.length; j++) {
      const left = Math.min(verticals[i], verticals[j]);
      const right = Math.max(verticals[i], verticals[j]);
      const pixelW = right - left;
      if (pixelW < w * 0.1 || pixelW > w * 0.95) continue;
      for (let k = 0; k < horizontals.length; k++) {
        for (let m = k + 1; m < horizontals.length; m++) {
          const top = Math.min(horizontals[k], horizontals[m]);
          const bottom = Math.max(horizontals[k], horizontals[m]);
          const pixelH = bottom - top;
          if (pixelH < h * 0.1 || pixelH > h * 0.95) continue;
          const rect: Rect = { x: left, y: top, width: pixelW, height: pixelH };
          if (!rectLooksLikeCard(rect, w, h, cardAspect)) continue;
          const sep = outerSeparationScore(image, rect);
          if (sep < 0.14) continue;
          const pix = pixelW / pixelH;
          const aspect = 1 - Math.min(Math.abs(pix - cardAspect), Math.abs(pix - 1 / cardAspect)) / 0.18;
          const score = sep * 0.7 + aspect * 0.3;
          if (score > bestScore) {
            bestScore = score;
            best = rect;
          }
        }
      }
    }
  }
  return best;
}

function detectByForegroundBlob(image: PixelBuffer, cardAspect: number): Rect | null {
  const { width: w, height: h, data } = image;
  const bgSamples: number[] = [];
  const border = Math.max(2, Math.round(Math.min(w, h) * 0.04));
  const push = (x: number, y: number) => bgSamples.push(lumAt(image, x, y));
  for (let i = 0; i < 12; i++) {
    const t = (i + 0.5) / 12;
    push(t * w, border);
    push(t * w, h - 1 - border);
    push(border, t * h);
    push(w - 1 - border, t * h);
  }
  bgSamples.sort((a, b) => a - b);
  const bg = bgSamples[Math.floor(bgSamples.length / 2)] ?? 40;
  const thresh = 22;

  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  let count = 0;
  const step = 3;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const chroma = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
      if (Math.abs(l - bg) < thresh && chroma < 28) continue;
      count++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (count < 40 || maxX <= minX || maxY <= minY) return null;
  const rect: Rect = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  return rectLooksLikeCard(rect, w, h, cardAspect) ? rect : fitAspect(rect, cardAspect, w, h);
}

function fitAspect(rect: Rect, cardAspect: number, imgW: number, imgH: number): Rect | null {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  let width = rect.width;
  let height = rect.height;
  const pix = width / height;
  if (Math.abs(pix - cardAspect) <= Math.abs(pix - 1 / cardAspect)) {
    if (pix > cardAspect) width = height * cardAspect;
    else height = width / cardAspect;
  } else {
    if (pix > 1 / cardAspect) width = height / cardAspect;
    else height = width * cardAspect;
  }
  const fitted: Rect = {
    x: cx - width / 2,
    y: cy - height / 2,
    width,
    height,
  };
  fitted.x = clamp(fitted.x, 0, imgW - 4);
  fitted.y = clamp(fitted.y, 0, imgH - 4);
  fitted.width = clamp(fitted.width, 4, imgW - fitted.x);
  fitted.height = clamp(fitted.height, 4, imgH - fitted.y);
  return rectLooksLikeCard(fitted, imgW, imgH, cardAspect) ? fitted : null;
}

function sobelMag(image: PixelBuffer): Float32Array {
  const { width: w, height: h } = image;
  const luma = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    luma[i] = 0.299 * image.data[o] + 0.587 * image.data[o + 1] + 0.114 * image.data[o + 2];
  }
  const mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const gx =
        -luma[p - w - 1] +
        luma[p - w + 1] +
        -2 * luma[p - 1] +
        2 * luma[p + 1] +
        -luma[p + w - 1] +
        luma[p + w + 1];
      const gy =
        -luma[p - w - 1] -
        2 * luma[p - w] -
        luma[p - w + 1] +
        luma[p + w - 1] +
        2 * luma[p + w] +
        luma[p + w + 1];
      mag[p] = Math.hypot(gx, gy);
    }
  }
  return mag;
}

function columnEdge(mag: Float32Array, w: number, h: number): number[] {
  const top = Math.floor(h * 0.1);
  const bot = Math.ceil(h * 0.9);
  const scores: number[] = [];
  for (let x = 0; x < w; x++) {
    let sum = 0;
    let n = 0;
    for (let y = top; y < bot; y += 2) {
      sum += mag[y * w + x];
      n++;
    }
    scores.push(n ? sum / n : 0);
  }
  return scores;
}

function rowEdge(mag: Float32Array, w: number, h: number): number[] {
  const left = Math.floor(w * 0.1);
  const right = Math.ceil(w * 0.9);
  const scores: number[] = [];
  for (let y = 0; y < h; y++) {
    let sum = 0;
    let n = 0;
    for (let x = left; x < right; x += 2) {
      sum += mag[y * w + x];
      n++;
    }
    scores.push(n ? sum / n : 0);
  }
  return scores;
}

function peakPositions(scores: number[], minSep: number, maxKeep: number): number[] {
  const ranked = scores
    .map((strength, position) => ({ position, strength }))
    .sort((a, b) => b.strength - a.strength);
  const median = ranked[Math.floor(ranked.length / 2)]?.strength ?? 0;
  const kept: number[] = [];
  for (const c of ranked) {
    if (c.strength < Math.max(12, median * 1.35)) continue;
    if (kept.some((p) => Math.abs(p - c.position) < minSep)) continue;
    kept.push(c.position);
    if (kept.length >= maxKeep) break;
  }
  return kept;
}

export function boxToRect(box: DetectedCard, imgW: number, imgH: number): Rect {
  return {
    x: box.left * imgW,
    y: box.top * imgH,
    width: box.width * imgW,
    height: box.height * imgH,
  };
}
