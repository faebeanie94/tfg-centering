import { CARD_ASPECT } from './card-edge-detect';

export interface Point {
  x: number;
  y: number;
}

export type CornerKey = 'tl' | 'tr' | 'br' | 'bl';

export interface QuadCorners {
  tl: Point;
  tr: Point;
  br: Point;
  bl: Point;
}

/**
 * Margin around the card in the cropped image, as a fraction of the *source
 * photo's* dimensions — not the selected box. Scaling against the box itself
 * breaks down the moment the box is already most of the photo (the common
 * case after a decent crop or a modest manual trim): the padding can then
 * exceed the box's own remaining margin and push the crop back out toward
 * the full, uncropped image, silently undoing whatever was just trimmed.
 * Scaling against the fixed photo size instead gives a small, predictable
 * margin that can never swallow an intentional edit.
 */
export const OUTPUT_PADDING_RATIO = 0.08;

/**
 * Margin used after manually adjusting corners in Perspective Fix. A bit more
 * generous than the auto-crop default — the point is to keep some visible
 * background around the card rather than crop right up to the edge — but
 * still scaled against the source photo, not the selection, for the same
 * reason as OUTPUT_PADDING_RATIO.
 */
export const MANUAL_CROP_PADDING_RATIO = 0.1;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function defaultCorners(imgWidth: number, imgHeight: number): QuadCorners {
  const mx = imgWidth * 0.12;
  const my = imgHeight * 0.12;
  return {
    tl: { x: mx, y: my },
    tr: { x: imgWidth - mx, y: my },
    br: { x: imgWidth - mx, y: imgHeight - my },
    bl: { x: mx, y: imgHeight - my },
  };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function quadHeight(corners: QuadCorners): number {
  return (dist(corners.tl, corners.bl) + dist(corners.tr, corners.br)) / 2;
}

function computeOutputSize(
  corners: QuadCorners,
  cardAspectRatio: number = CARD_ASPECT,
  paddingRatio: number = MANUAL_CROP_PADDING_RATIO,
): {
  width: number;
  height: number;
  padX: number;
  padY: number;
} {
  const cardHeight = Math.max(Math.round(quadHeight(corners)), 400);
  const cardWidth = Math.round(cardHeight * cardAspectRatio);
  const padX = Math.round(cardWidth * paddingRatio);
  const padY = Math.round(cardHeight * paddingRatio);
  return {
    width: cardWidth + padX * 2,
    height: cardHeight + padY * 2,
    padX,
    padY,
  };
}

/** Solve 3×3 homography mapping dst → src (8 dof, h22 = 1). */
function solveHomography(dst: Point[], src: Point[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const { x: xp, y: yp } = dst[i];
    const { x, y } = src[i];
    A.push([xp, yp, 1, 0, 0, 0, -x * xp, -x * yp]);
    b.push(x);
    A.push([0, 0, 0, xp, yp, 1, -y * xp, -y * yp]);
    b.push(y);
  }

  const h = gaussianElimination(A, b);
  return [...h, 1];
}

function gaussianElimination(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row;
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];

    const div = M[col][col] || 1e-10;
    for (let j = col; j <= n; j++) M[col][j] /= div;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = M[row][col];
      for (let j = col; j <= n; j++) M[row][j] -= factor * M[col][j];
    }
  }

  return M.map((row) => row[n]);
}

function mapPoint(h: number[], x: number, y: number): Point {
  const w = h[6] * x + h[7] * y + h[8];
  return {
    x: (h[0] * x + h[1] * y + h[2]) / w,
    y: (h[3] * x + h[4] * y + h[5]) / w,
  };
}

function sampleBilinear(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const fx = x - x0;
  const fy = y - y0;

  function px(px: number, py: number) {
    const i = (py * width + px) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]] as const;
  }

  if (x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) return [0, 0, 0, 255];

  const p00 = px(x0, y0);
  const p10 = px(x1, y0);
  const p01 = px(x0, y1);
  const p11 = px(x1, y1);

  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    out[c] = Math.round(
      p00[c] * (1 - fx) * (1 - fy) +
        p10[c] * fx * (1 - fy) +
        p01[c] * (1 - fx) * fy +
        p11[c] * fx * fy,
    );
  }
  return out;
}

/**
 * Warp the quad to a rectangle — straightens a tilted/keystoned photo.
 * Used only by the manual Perspective Fix screen: automatic capture uses
 * cropToQuadBounds instead (see there for why straightening isn't applied
 * automatically). Here, the user has explicitly placed all 4 corners by
 * hand specifically to correct perspective, so warping to match is the
 * point of the screen.
 */
export async function perspectiveCorrect(
  imageSrc: string,
  corners: QuadCorners,
  cardAspectRatio: number = CARD_ASPECT,
  paddingRatio: number = MANUAL_CROP_PADDING_RATIO,
): Promise<string> {
  const img = await loadImage(imageSrc);
  const { width: outWidth, height: outHeight, padX, padY } = computeOutputSize(corners, cardAspectRatio, paddingRatio);

  const src = [corners.tl, corners.tr, corners.br, corners.bl];
  const dst: Point[] = [
    { x: padX, y: padY },
    { x: outWidth - padX, y: padY },
    { x: outWidth - padX, y: outHeight - padY },
    { x: padX, y: outHeight - padY },
  ];

  const h = solveHomography(dst, src);

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = img.naturalWidth;
  srcCanvas.height = img.naturalHeight;
  const srcCtx = srcCanvas.getContext('2d')!;
  srcCtx.drawImage(img, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outWidth;
  outCanvas.height = outHeight;
  const outCtx = outCanvas.getContext('2d')!;
  const outData = outCtx.createImageData(outWidth, outHeight);

  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      const srcPt = mapPoint(h, x, y);
      const [r, g, b, a] = sampleBilinear(
        srcData.data,
        srcCanvas.width,
        srcCanvas.height,
        srcPt.x,
        srcPt.y,
      );
      const i = (y * outWidth + x) * 4;
      outData.data[i] = r;
      outData.data[i + 1] = g;
      outData.data[i + 2] = b;
      outData.data[i + 3] = a;
    }
  }

  outCtx.putImageData(outData, 0, 0);
  return outCanvas.toDataURL('image/jpeg', 0.95);
}

/**
 * Crop to the quad's axis-aligned bounding box — no perspective/rotation
 * correction, so a tilted photo stays tilted. Simpler and more predictable
 * than warping: no pixel stretching, and a slightly-off quad just shifts the
 * crop boundary instead of distorting the image. Confidence-scaled padding
 * (passed in by the caller) still applies, so an uncertain detection is less
 * likely to clip real card content.
 */
export async function cropToQuadBounds(
  imageSrc: string,
  corners: QuadCorners,
  paddingRatio: number = OUTPUT_PADDING_RATIO,
): Promise<string> {
  const img = await loadImage(imageSrc);
  const xs = [corners.tl.x, corners.tr.x, corners.br.x, corners.bl.x];
  const ys = [corners.tl.y, corners.tr.y, corners.br.y, corners.bl.y];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padXTarget = img.naturalWidth * paddingRatio;
  const padYTarget = img.naturalHeight * paddingRatio;

  // Cap padding at half of whatever margin the selection already left
  // outside itself on that side. Otherwise a modest, deliberate trim (little
  // margin left outside the box) gets padding that reaches past where it
  // started, silently pushing the crop back out toward the untrimmed photo.
  const padLeft = Math.min(padXTarget, minX / 2);
  const padRight = Math.min(padXTarget, (img.naturalWidth - maxX) / 2);
  const padTop = Math.min(padYTarget, minY / 2);
  const padBottom = Math.min(padYTarget, (img.naturalHeight - maxY) / 2);

  const cropX = Math.max(0, minX - padLeft);
  const cropY = Math.max(0, minY - padTop);
  const cropRight = Math.min(img.naturalWidth, maxX + padRight);
  const cropBottom = Math.min(img.naturalHeight, maxY + padBottom);
  const cropWidth = Math.max(1, cropRight - cropX);
  const cropHeight = Math.max(1, cropBottom - cropY);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(cropWidth);
  canvas.height = Math.round(cropHeight);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.95);
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
