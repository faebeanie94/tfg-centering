import { CARD_ASPECT } from '../lib/card-edge-detect';
import type { Point } from './LiveCardQuality';

function solveHomography(source: Point[], destination: Point[]): number[] {
  const matrix: number[][] = [];

  for (let i = 0; i < 4; i++) {
    const x = source[i].x;
    const y = source[i].y;
    const u = destination[i].x;
    const v = destination[i].y;
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }

  for (let column = 0; column < 8; column++) {
    let pivot = column;
    for (let row = column + 1; row < 8; row++) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    }
    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];

    const divisor = matrix[column][column];
    if (Math.abs(divisor) < 1e-10) {
      throw new Error('Unable to calculate perspective transform');
    }

    for (let j = column; j < 9; j++) matrix[column][j] /= divisor;

    for (let row = 0; row < 8; row++) {
      if (row === column) continue;
      const factor = matrix[row][column];
      for (let j = column; j < 9; j++) {
        matrix[row][j] -= factor * matrix[column][j];
      }
    }
  }

  return [
    matrix[0][8],
    matrix[1][8],
    matrix[2][8],
    matrix[3][8],
    matrix[4][8],
    matrix[5][8],
    matrix[6][8],
    matrix[7][8],
    1,
  ];
}

function invert3x3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = c * h - b * i;
  const C = b * f - c * e;
  const D = f * g - d * i;
  const E = a * i - c * g;
  const F = c * d - a * f;
  const G = d * h - e * g;
  const H = b * g - a * h;
  const I = a * e - b * d;
  const determinant = a * A + b * D + c * G;
  if (Math.abs(determinant) < 1e-10) {
    throw new Error('Invalid perspective matrix');
  }
  return [
    A / determinant,
    B / determinant,
    C / determinant,
    D / determinant,
    E / determinant,
    F / determinant,
    G / determinant,
    H / determinant,
    I / determinant,
  ];
}

function sampleBilinear(source: ImageData, x: number, y: number): [number, number, number, number] {
  const width = source.width;
  const height = source.height;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const dx = x - x0;
  const dy = y - y0;

  const pixel = (px: number, py: number) => {
    const offset = (py * width + px) * 4;
    return [source.data[offset], source.data[offset + 1], source.data[offset + 2], source.data[offset + 3]];
  };

  const p00 = pixel(x0, y0);
  const p10 = pixel(x1, y0);
  const p01 = pixel(x0, y1);
  const p11 = pixel(x1, y1);
  const result: number[] = [];
  for (let channel = 0; channel < 4; channel++) {
    const top = p00[channel] + (p10[channel] - p00[channel]) * dx;
    const bottom = p01[channel] + (p11[channel] - p01[channel]) * dx;
    result[channel] = top + (bottom - top) * dy;
  }
  return [Math.round(result[0]), Math.round(result[1]), Math.round(result[2]), Math.round(result[3])];
}

export type RectifyOptions = {
  outputWidth?: number;
  /** Width / height of the physical card (poker ≈ 2.5/3.5). */
  aspectRatio?: number;
};

/**
 * Warp a detected trading card to a straight rectangle.
 * `corners` and `source` must share the camera frame's pixel space.
 * Corner order: TL, TR, BR, BL.
 */
export function rectifyCard(
  source: ImageData,
  corners: Point[],
  outputWidthOrOptions: number | RectifyOptions = 750,
): HTMLCanvasElement {
  if (corners.length !== 4) {
    throw new Error('Exactly four corners are required');
  }

  const options =
    typeof outputWidthOrOptions === 'number'
      ? { outputWidth: outputWidthOrOptions }
      : outputWidthOrOptions;
  const outputWidth = options.outputWidth ?? 750;
  const aspectRatio = options.aspectRatio ?? CARD_ASPECT;
  const outputHeight = Math.round(outputWidth / aspectRatio);

  const destination: Point[] = [
    { x: 0, y: 0 },
    { x: outputWidth - 1, y: 0 },
    { x: outputWidth - 1, y: outputHeight - 1 },
    { x: 0, y: outputHeight - 1 },
  ];

  const homography = solveHomography(corners, destination);
  const inverse = invert3x3(homography);
  const output = new ImageData(outputWidth, outputHeight);

  for (let y = 0; y < outputHeight; y++) {
    for (let x = 0; x < outputWidth; x++) {
      const denominator = inverse[6] * x + inverse[7] * y + inverse[8];
      if (Math.abs(denominator) < 1e-10) continue;

      const sourceX = (inverse[0] * x + inverse[1] * y + inverse[2]) / denominator;
      const sourceY = (inverse[3] * x + inverse[4] * y + inverse[5]) / denominator;
      if (sourceX < 0 || sourceY < 0 || sourceX >= source.width - 1 || sourceY >= source.height - 1) {
        continue;
      }

      const [r, g, b, a] = sampleBilinear(source, sourceX, sourceY);
      const offset = (y * outputWidth + x) * 4;
      output.data[offset] = r;
      output.data[offset + 1] = g;
      output.data[offset + 2] = b;
      output.data[offset + 3] = a;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to create canvas');
  ctx.putImageData(output, 0, 0);
  return canvas;
}
