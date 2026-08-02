type ExtendedCapabilities = MediaTrackCapabilities & {
  torch?: boolean;
  zoom?: { min: number; max: number; step?: number };
  focusDistance?: { min: number; max: number; step?: number };
};

type ExtendedConstraintSet = MediaTrackConstraintSet & {
  torch?: boolean;
  zoom?: number;
  focusDistance?: number;
  focusMode?: string;
};

export interface CameraCapabilities {
  torch: boolean;
  macro: boolean;
}

export function getCameraCapabilities(track: MediaStreamTrack): CameraCapabilities {
  const caps = track.getCapabilities?.() as ExtendedCapabilities | undefined;
  return {
    torch: caps?.torch === true,
    macro: caps?.zoom != null || caps?.focusDistance != null,
  };
}

export function buildVideoConstraints(macroMode: boolean): MediaTrackConstraints {
  const constraints: MediaTrackConstraints = {
    facingMode: 'environment',
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  };

  if (macroMode) {
    return {
      ...constraints,
      zoom: { ideal: 1.05 },
    } as MediaTrackConstraints;
  }

  return constraints;
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
