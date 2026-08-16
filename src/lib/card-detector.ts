export interface EdgeMap {
  width: number;
  height: number;
  magnitude: Float32Array;
}

export function buildEdgeMap(
  luma: Float32Array,
  width: number,
  height: number,
): EdgeMap {
  const magnitude = new Float32Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x;

      const gx =
        -luma[p - width - 1] +
        luma[p - width + 1] +
        -2 * luma[p - 1] +
        2 * luma[p + 1] +
        -luma[p + width - 1] +
        luma[p + width + 1];

      const gy =
        -luma[p - width - 1] +
        -2 * luma[p - width] +
        -luma[p - width + 1] +
        luma[p + width - 1] +
        2 * luma[p + width] +
        luma[p + width + 1];

      magnitude[p] = Math.hypot(gx, gy);
    }
  }

  return { width, height, magnitude };
}
