import type { Point } from './LiveCardQuality';
import { rectifyCard, type RectifyOptions } from './perspectiveRectify';

/**
 * Grab the live camera's intrinsic pixels (`videoWidth` × `videoHeight`)
 * and warp the detected quad to a poker-ratio JPEG.
 */
export async function captureAndRectifyCardAsync(
  video: HTMLVideoElement,
  corners: Point[],
  options: RectifyOptions = {},
): Promise<Blob> {
  if (video.videoWidth === 0 || video.videoHeight === 0) {
    throw new Error('Camera video is not ready');
  }
  if (corners.length !== 4) {
    throw new Error('Exactly four corners are required');
  }

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Unable to create capture canvas');

  ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
  const frame = ctx.getImageData(0, 0, video.videoWidth, video.videoHeight);
  const corrected = rectifyCard(frame, corners, { outputWidth: options.outputWidth ?? 750, aspectRatio: options.aspectRatio });

  return new Promise((resolve, reject) => {
    corrected.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode card image'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      0.95,
    );
  });
}
