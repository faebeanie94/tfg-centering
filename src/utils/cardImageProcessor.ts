import { CARD_ASPECT } from '../lib/card-edge-detect';
import { rectifyCard } from '../lib/cardCapture';

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

    const blob = await this.toBlob(imageBytes);
    const corrected = await rectifyCard(blob, corners, 1200);
    if (!corrected) {
      return {
        imageBytes: blob,
        qualityScore: this.clamp01(quality),
        isGoodQuality: false,
        message: 'Unable to flatten the card',
      };
    }

    return {
      imageBytes: corrected,
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
    const portrait = CARD_ASPECT;
    const landscape = 1 / Math.max(portrait, 0.01);
    const difference = Math.min(Math.abs(ratio - portrait), Math.abs(ratio - landscape));
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
