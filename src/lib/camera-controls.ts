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

export function buildVideoConstraints(macroMode: boolean): MediaTrackConstraints {
  const constraints: MediaTrackConstraints = {
    facingMode: 'environment',
    width: { ideal: 4032, min: 1920 },
    height: { ideal: 3024, min: 1080 },
    focusMode: { ideal: 'continuous' },
  } as MediaTrackConstraints;

  if (macroMode) {
    return {
      ...constraints,
      zoom: { ideal: 1.05 },
    } as MediaTrackConstraints;
  }

  return constraints;
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
      patch.zoom = enabled
        ? Math.min(caps.zoom.max, Math.max(caps.zoom.min, caps.zoom.min + (caps.zoom.max - caps.zoom.min) * 0.08))
        : caps.zoom.min;
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
        const zoom = enabled ? Math.min(caps.zoom.max, caps.zoom.min + 0.15) : caps.zoom.min;
        await track.applyConstraints({ zoom } as ExtendedConstraintSet);
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }
}
