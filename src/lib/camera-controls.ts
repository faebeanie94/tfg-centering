type ExtendedCapabilities = MediaTrackCapabilities & {
  torch?: boolean;
  zoom?: { min: number; max: number; step?: number };
  focusDistance?: { min: number; max: number; step?: number };
  focusMode?: string[];
  pointsOfInterest?: boolean;
};

type ExtendedConstraintSet = MediaTrackConstraintSet & {
  torch?: boolean;
  zoom?: number;
  focusDistance?: number;
  focusMode?: string;
  pointsOfInterest?: Array<{ x: number; y: number }>;
};

export interface CameraCapabilities {
  torch: boolean;
  macro: boolean;
  focus: boolean;
}

export const FOCUS_SETTLE_MS = 550;
export const FOCUS_MAX_MS = 1200;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    sleep(ms).then(() => fallback),
  ]);
}

export function getCameraCapabilities(track: MediaStreamTrack): CameraCapabilities {
  const caps = track.getCapabilities?.() as ExtendedCapabilities | undefined;
  return {
    torch: caps?.torch === true,
    macro: caps?.zoom != null || caps?.focusDistance != null,
    focus: caps?.focusMode != null || caps?.focusDistance != null || caps?.pointsOfInterest === true,
  };
}

export function buildVideoConstraints(
  macroMode: boolean,
  tier: 'max' | 'high' = 'max',
): MediaTrackConstraints {
  const resolution =
    tier === 'max'
      ? {
          width: { ideal: 8064, max: 8064, min: 1920 },
          height: { ideal: 6048, max: 6048, min: 1080 },
        }
      : {
          width: { ideal: 4032, min: 1920 },
          height: { ideal: 3024, min: 1080 },
        };

  const constraints = {
    facingMode: { ideal: 'environment' },
    ...resolution,
    aspectRatio: { ideal: 4 / 3 },
    focusMode: { ideal: 'continuous' },
    resizeMode: { ideal: 'none' },
  } as unknown as MediaTrackConstraints;

  if (macroMode) {
    return {
      ...constraints,
      zoom: { ideal: 1.25, min: 1 },
    } as MediaTrackConstraints;
  }

  return constraints;
}

/** Push the video track to the device maximum (e.g. 48MP iPhone main camera). */
export async function applyMaxCaptureResolution(
  track: MediaStreamTrack,
): Promise<{ width: number; height: number } | null> {
  const caps = track.getCapabilities?.();
  if (!caps?.width || !caps?.height) return null;

  const widthMax = typeof caps.width === 'object' ? caps.width.max : undefined;
  const heightMax = typeof caps.height === 'object' ? caps.height.max : undefined;
  if (!widthMax || !heightMax) return null;

  const attempts: MediaTrackConstraints[] = [
    { width: { ideal: widthMax, max: widthMax }, height: { ideal: heightMax, max: heightMax } },
    { width: { ideal: widthMax }, height: { ideal: heightMax } },
    { advanced: [{ width: widthMax, height: heightMax }] as ExtendedConstraintSet[] },
  ];

  for (const attempt of attempts) {
    try {
      await track.applyConstraints(attempt);
      const settings = track.getSettings();
      if (settings.width && settings.height) {
        return { width: settings.width, height: settings.height };
      }
    } catch {
      // try next strategy
    }
  }

  return null;
}

function macroZoomTarget(caps: ExtendedCapabilities): number | undefined {
  if (!caps.zoom) return undefined;
  const { min, max } = caps.zoom;
  const span = max - min;
  if (span <= 0) return min;
  return Math.min(max, min + span * 0.38);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Trigger autofocus at a normalized point (0–1) on the card before capture. */
export async function focusOnCard(
  track: MediaStreamTrack,
  point: { x: number; y: number },
): Promise<boolean> {
  return withTimeout(focusOnCardInner(track, point), FOCUS_MAX_MS, false);
}

async function focusOnCardInner(
  track: MediaStreamTrack,
  point: { x: number; y: number },
): Promise<boolean> {
  const caps = track.getCapabilities?.() as ExtendedCapabilities | undefined;
  const x = Math.max(0.05, Math.min(0.95, point.x));
  const y = Math.max(0.05, Math.min(0.95, point.y));

  const attempts: MediaTrackConstraints[] = [
    { pointsOfInterest: [{ x, y }], focusMode: 'single-shot' } as MediaTrackConstraints,
    { advanced: [{ pointsOfInterest: [{ x, y }], focusMode: 'single-shot' } as ExtendedConstraintSet] },
    { focusMode: 'single-shot' } as MediaTrackConstraints,
    { advanced: [{ focusMode: 'single-shot' } as ExtendedConstraintSet] },
    { focusMode: 'continuous' } as MediaTrackConstraints,
  ];

  if (caps?.focusDistance) {
    attempts.unshift({
      focusMode: 'manual',
      focusDistance: caps.focusDistance.min + (caps.focusDistance.max - caps.focusDistance.min) * 0.35,
    } as MediaTrackConstraints);
  }

  for (const attempt of attempts) {
    try {
      await track.applyConstraints(attempt);
      await sleep(FOCUS_SETTLE_MS);
      return true;
    } catch {
      // try next strategy
    }
  }

  await sleep(300);
  return false;
}

export function cardCenterFromBox(box: { left: number; top: number; width: number; height: number }) {
  return {
    x: box.left + box.width / 2,
    y: box.top + box.height / 2,
  };
}

export async function setTorch(track: MediaStreamTrack, enabled: boolean): Promise<boolean> {
  const caps = track.getCapabilities?.() as ExtendedCapabilities | undefined;
  if (!caps?.torch) return false;

  try {
    await track.applyConstraints({ advanced: [{ torch: enabled } as ExtendedConstraintSet] });
    return true;
  } catch {
    try {
      await track.applyConstraints({ torch: enabled } as ExtendedConstraintSet);
      return true;
    } catch {
      return false;
    }
  }
}

export async function setMacroMode(track: MediaStreamTrack, enabled: boolean): Promise<boolean> {
  const caps = track.getCapabilities?.() as ExtendedCapabilities | undefined;
  if (!caps) return false;

  try {
    const patch: ExtendedConstraintSet = { focusMode: 'continuous' };

    if (caps.zoom) {
      const target = macroZoomTarget(caps);
      patch.zoom = enabled ? target ?? caps.zoom.min : caps.zoom.min;
    }

    if (enabled && caps.focusDistance) {
      patch.focusMode = 'manual';
      patch.focusDistance = caps.focusDistance.min;
    }

    await track.applyConstraints({ advanced: [patch] });
    return true;
  } catch {
    try {
      if (caps.zoom) {
        const target = macroZoomTarget(caps);
        const zoom = enabled ? target ?? caps.zoom.min + 0.35 : caps.zoom.min;
        await track.applyConstraints({ zoom } as ExtendedConstraintSet);
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }
}
