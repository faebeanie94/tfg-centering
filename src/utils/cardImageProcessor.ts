export interface Point {
  x: number;
  y: number;
}

export interface CardImageResult {
  imageBytes: Blob;
  qualityScore: number;
  isGoodQuality: boolean;
  message: string;
}

export class CardImageProcessor {
  static readonly minimumQuality = 0.72;
  static readonly minimumCardWidth = 250;
  static readonly minimumCardHeight = 150;
  static readonly minimumBrightness = 25;
  static readonly maximumBrightness = 245;
  static readonly minimumSharpness = 12;

  static async validateAndCorrect(
    imageBytes: Blob | ArrayBuffer | Uint8Array,
    corners: Point[],
  ): Promise<CardImageResult> {
    if (corners.length !== 4) {
      return {
        imageBytes: await this.toBlob(imageBytes),
        qualityScore: 0,
        isGoodQuality: false,
        message: 'Card not detected',
      };
    }

    const image = await this.loadImage(imageBytes);
    if (!image) {
      return {
        imageBytes: await this.toBlob(imageBytes),
        qualityScore: 0,
        isGoodQuality: false,
        message: 'Unable to read image',
      };
    }

    if (!this.cornersInsideImage(corners, image.width, image.height)) {
      return {
        imageBytes: await this.toBlob(imageBytes),
        qualityScore: 0.2,
        isGoodQuality: false,
        message: 'Move the card fully into frame',
      };
    }

    const widthTop = this.distance(corners[0], corners[1]);
    const widthBottom = this.distance(corners[3], corners[2]);
    const heightLeft = this.distance(corners[0], corners[3]);
    const heightRight = this.distance(corners[1], corners[2]);
    const cardWidth = (widthTop + widthBottom) / 2;
    const cardHeight = (heightLeft + heightRight) / 2;

    const sizeScore = this.calculateSizeScore(cardWidth, cardHeight, image.width, image.height);
    const ratio = cardWidth / Math.max(cardHeight, 1);
    const ratioScore = this.calculateAspectRatioScore(ratio);
    const brightness = this.calculateBrightness(image);
    const brightnessScore = this.calculateBrightnessScore(brightness);
    const sharpness = this.calculateSharpness(image);
    const sharpnessScore = this.calculateSharpnessScore(sharpness);
    const perspectiveScore = this.calculatePerspectiveScore(corners);

    const quality =
      sizeScore * 0.25 +
      ratioScore * 0.15 +
      brightnessScore * 0.2 +
      sharpnessScore * 0.2 +
      perspectiveScore * 0.2;

    let message = 'Good scan';
    if (sizeScore < 0.5) {
      message = 'Move closer to the card';
    } else if (brightnessScore < 0.5) {
      message = brightness < this.minimumBrightness ? 'Image is too dark' : 'Image is too bright';
    } else if (sharpnessScore < 0.5) {
      message = 'Hold still — image is blurry';
    } else if (ratioScore < 0.5) {
      message = 'Adjust the card position';
    } else if (perspectiveScore < 0.5) {
      message = 'Hold the card more directly';
    }

    const good =
      quality >= this.minimumQuality &&
      sizeScore >= 0.5 &&
      brightnessScore >= 0.5 &&
      sharpnessScore >= 0.5 &&
      ratioScore >= 0.5;

    if (!good) {
      return {
        imageBytes: await this.toBlob(imageBytes),
        qualityScore: this.clamp01(quality),
        isGoodQuality: false,
        message,
      };
    }

    const corrected = await this.perspectiveCorrect(image, corners);
    const output = await this.canvasToBlob(corrected, 'image/jpeg', 0.95);

    return {
      imageBytes: output,
      qualityScore: this.clamp01(quality),
      isGoodQuality: true,
      message: 'Good scan',
    };
  }

  private static async loadImage(
    source: Blob | ArrayBuffer | Uint8Array,
  ): Promise<HTMLImageElement | null> {
    const blob = await this.toBlob(source);
    const url = URL.createObjectURL(blob);

    try {
      const image = new Image();
      image.src = url;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Unable to load image'));
      });
      return image;
    } catch {
      return null;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private static async toBlob(source: Blob | ArrayBuffer | Uint8Array): Promise<Blob> {
    if (source instanceof Blob) return source;
    if (source instanceof ArrayBuffer) return new Blob([source]);
    const copy = new Uint8Array(source.byteLength);
    copy.set(source);
    return new Blob([copy]);
  }

  private static imageToCanvas(image: HTMLImageElement): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Unable to create canvas context');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  private static calculateSizeScore(
    width: number,
    height: number,
    imageWidth: number,
    imageHeight: number,
  ): number {
    if (width < this.minimumCardWidth || height < this.minimumCardHeight) {
      return 0;
    }

    const areaRatio = (width / imageWidth) * (height / imageHeight);
    if (areaRatio >= 0.45) return 1;
    if (areaRatio <= 0.05) return 0;
    return this.clamp01((areaRatio - 0.05) / 0.4);
  }

  private static calculateAspectRatioScore(ratio: number): number {
    const target = 1.586;
    const difference = Math.abs(ratio - target);
    if (difference <= 0.12) return 1;
    if (difference >= 0.65) return 0;
    return this.clamp01(1 - (difference - 0.12) / 0.53);
  }

  private static calculateBrightness(image: HTMLImageElement): number {
    const canvas = document.createElement('canvas');
    const width = 100;
    const height = Math.max(1, Math.round((image.naturalHeight / image.naturalWidth) * width));
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return 0;

    ctx.drawImage(image, 0, 0, width, height);
    const data = ctx.getImageData(0, 0, width, height).data;
    let total = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      count++;
    }
    return count === 0 ? 0 : total / count;
  }

  private static calculateBrightnessScore(brightness: number): number {
    if (brightness < this.minimumBrightness || brightness > this.maximumBrightness) {
      return 0;
    }
    if (brightness >= 70 && brightness <= 210) return 1;
    if (brightness < 70) return this.clamp01((brightness - 25) / 45);
    return this.clamp01((245 - brightness) / 35);
  }

  private static calculateSharpness(image: HTMLImageElement): number {
    const canvas = document.createElement('canvas');
    const width = 250;
    const height = Math.max(3, Math.round((image.naturalHeight / image.naturalWidth) * width));
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return 0;

    ctx.drawImage(image, 0, 0, width, height);
    const data = ctx.getImageData(0, 0, width, height).data;
    const gray = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        gray[y * width + x] = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
      }
    }

    let sum = 0;
    let sumSquared = 0;
    let count = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const center = gray[y * width + x];
        const laplacian =
          gray[y * width + x - 1] +
          gray[y * width + x + 1] +
          gray[(y - 1) * width + x] +
          gray[(y + 1) * width + x] -
          4 * center;
        sum += laplacian;
        sumSquared += laplacian * laplacian;
        count++;
      }
    }
    if (count === 0) return 0;
    const mean = sum / count;
    return sumSquared / count - mean * mean;
  }

  private static calculateSharpnessScore(sharpness: number): number {
    if (sharpness >= 80) return 1;
    if (sharpness <= this.minimumSharpness) return 0;
    return this.clamp01((sharpness - 12) / (80 - 12));
  }

  private static calculatePerspectiveScore(corners: Point[]): number {
    const top = this.distance(corners[0], corners[1]);
    const bottom = this.distance(corners[3], corners[2]);
    const left = this.distance(corners[0], corners[3]);
    const right = this.distance(corners[1], corners[2]);
    const widthDifference = Math.abs(top - bottom) / Math.max((top + bottom) / 2, 1);
    const heightDifference = Math.abs(left - right) / Math.max((left + right) / 2, 1);
    const distortion = (widthDifference + heightDifference) / 2;
    if (distortion <= 0.15) return 1;
    if (distortion >= 0.75) return 0;
    return this.clamp01(1 - (distortion - 0.15) / 0.6);
  }

  private static cornersInsideImage(corners: Point[], width: number, height: number): boolean {
    const margin = 3;
    for (const point of corners) {
      if (point.x < margin || point.y < margin || point.x > width - margin || point.y > height - margin) {
        return false;
      }
    }
    return true;
  }

  private static async perspectiveCorrect(
    image: HTMLImageElement,
    corners: Point[],
  ): Promise<HTMLCanvasElement> {
    const topLeft = corners[0];
    const topRight = corners[1];
    const bottomRight = corners[2];
    const bottomLeft = corners[3];

    const outputWidth = Math.min(
      2400,
      Math.max(300, Math.round(Math.max(this.distance(topLeft, topRight), this.distance(bottomLeft, bottomRight)))),
    );
    const outputHeight = Math.min(
      1600,
      Math.max(180, Math.round(Math.max(this.distance(topLeft, bottomLeft), this.distance(topRight, bottomRight)))),
    );

    const destinationCorners: Point[] = [
      { x: 0, y: 0 },
      { x: outputWidth - 1, y: 0 },
      { x: outputWidth - 1, y: outputHeight - 1 },
      { x: 0, y: outputHeight - 1 },
    ];

    const homography = this.calculateHomography(
      [topLeft, topRight, bottomRight, bottomLeft],
      destinationCorners,
    );
    const inverse = this.invert3x3(homography);

    const sourceCanvas = this.imageToCanvas(image);
    const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!sourceContext) throw new Error('Unable to create source canvas');
    const sourceData = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = outputWidth;
    outputCanvas.height = outputHeight;
    const outputContext = outputCanvas.getContext('2d', { willReadFrequently: true });
    if (!outputContext) throw new Error('Unable to create output canvas');
    const outputData = outputContext.createImageData(outputWidth, outputHeight);

    const src = sourceData.data;
    const dst = outputData.data;

    for (let y = 0; y < outputHeight; y++) {
      for (let x = 0; x < outputWidth; x++) {
        const denominator = inverse[6] * x + inverse[7] * y + inverse[8];
        if (Math.abs(denominator) < 1e-6) continue;

        const sourceX = (inverse[0] * x + inverse[1] * y + inverse[2]) / denominator;
        const sourceY = (inverse[3] * x + inverse[4] * y + inverse[5]) / denominator;
        if (
          sourceX < 0 ||
          sourceY < 0 ||
          sourceX >= sourceCanvas.width - 1 ||
          sourceY >= sourceCanvas.height - 1
        ) {
          continue;
        }

        const pixel = this.bilinearSample(src, sourceCanvas.width, sourceCanvas.height, sourceX, sourceY);
        const outputIndex = (y * outputWidth + x) * 4;
        dst[outputIndex] = pixel[0];
        dst[outputIndex + 1] = pixel[1];
        dst[outputIndex + 2] = pixel[2];
        dst[outputIndex + 3] = 255;
      }
    }

    outputContext.putImageData(outputData, 0, 0);
    return outputCanvas;
  }

  private static calculateHomography(source: Point[], destination: Point[]): number[] {
    const matrix: number[][] = Array.from({ length: 8 }, () => Array(9).fill(0));
    for (let i = 0; i < 4; i++) {
      const x = source[i].x;
      const y = source[i].y;
      const u = destination[i].x;
      const v = destination[i].y;
      const row = i * 2;
      matrix[row][0] = x;
      matrix[row][1] = y;
      matrix[row][2] = 1;
      matrix[row][6] = -u * x;
      matrix[row][7] = -u * y;
      matrix[row][8] = u;
      matrix[row + 1][3] = x;
      matrix[row + 1][4] = y;
      matrix[row + 1][5] = 1;
      matrix[row + 1][6] = -v * x;
      matrix[row + 1][7] = -v * y;
      matrix[row + 1][8] = v;
    }
    return this.solveHomography(matrix);
  }

  private static solveHomography(matrix: number[][]): number[] {
    const a = matrix.map((row) => [...row]);
    for (let column = 0; column < 8; column++) {
      let pivot = column;
      for (let row = column + 1; row < 8; row++) {
        if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row;
      }
      [a[column], a[pivot]] = [a[pivot], a[column]];
      const divisor = a[column][column];
      if (Math.abs(divisor) < 1e-7) {
        return [1, 0, 0, 0, 1, 0, 0, 0, 1];
      }
      for (let j = column; j < 9; j++) a[column][j] /= divisor;
      for (let row = 0; row < 8; row++) {
        if (row === column) continue;
        const factor = a[row][column];
        for (let j = column; j < 9; j++) a[row][j] -= factor * a[column][j];
      }
    }
    return [a[0][8], a[1][8], a[2][8], a[3][8], a[4][8], a[5][8], a[6][8], a[7][8], 1];
  }

  private static invert3x3(m: number[]): number[] {
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
    if (Math.abs(determinant) < 1e-7) {
      return [1, 0, 0, 0, 1, 0, 0, 0, 1];
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

  private static bilinearSample(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    x: number,
    y: number,
  ): [number, number, number] {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, width - 1);
    const y1 = Math.min(y0 + 1, height - 1);
    const dx = x - x0;
    const dy = y - y0;
    const index00 = (y0 * width + x0) * 4;
    const index10 = (y0 * width + x1) * 4;
    const index01 = (y1 * width + x0) * 4;
    const index11 = (y1 * width + x1) * 4;
    return [
      Math.round(this.interpolate(data[index00], data[index10], data[index01], data[index11], dx, dy)),
      Math.round(
        this.interpolate(data[index00 + 1], data[index10 + 1], data[index01 + 1], data[index11 + 1], dx, dy),
      ),
      Math.round(
        this.interpolate(data[index00 + 2], data[index10 + 2], data[index01 + 2], data[index11 + 2], dx, dy),
      ),
    ];
  }

  private static interpolate(
    p00: number,
    p10: number,
    p01: number,
    p11: number,
    dx: number,
    dy: number,
  ): number {
    const top = p00 + (p10 - p00) * dx;
    const bottom = p01 + (p11 - p01) * dx;
    return top + (bottom - top) * dy;
  }

  private static canvasToBlob(
    canvas: HTMLCanvasElement,
    type: string,
    quality: number,
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Unable to create image'));
          return;
        }
        resolve(blob);
      }, type, quality);
    });
  }

  private static distance(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private static clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
  }
}

/** Map overlay 0–1000 corners into the captured image's pixel space. */
export function overlayCornersToImagePixels(
  corners: Point[],
  imageWidth: number,
  imageHeight: number,
): Point[] {
  return corners.map((point) => ({
    x: (point.x / 1000) * imageWidth,
    y: (point.y / 1000) * imageHeight,
  }));
}
