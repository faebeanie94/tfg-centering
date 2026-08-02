const STORAGE_KEY = 'tfg-permissions';

export interface StoredPermissions {
  camera: PermissionState | 'unknown';
  motion: PermissionState | 'unknown';
  updatedAt: number;
}

function defaultStored(): StoredPermissions {
  return { camera: 'unknown', motion: 'unknown', updatedAt: 0 };
}

export function loadStoredPermissions(): StoredPermissions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultStored();
    return { ...defaultStored(), ...JSON.parse(raw) };
  } catch {
    return defaultStored();
  }
}

export function saveStoredPermissions(patch: Partial<StoredPermissions>) {
  const current = loadStoredPermissions();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...current, ...patch, updatedAt: Date.now() }),
  );
}

export async function queryCameraPermission(): Promise<PermissionState> {
  if (!navigator.permissions?.query) {
    return loadStoredPermissions().camera === 'granted' ? 'granted' : 'prompt';
  }
  try {
    const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
    saveStoredPermissions({ camera: result.state });
    result.onchange = () => saveStoredPermissions({ camera: result.state });
    return result.state;
  } catch {
    return loadStoredPermissions().camera === 'granted' ? 'granted' : 'prompt';
  }
}

/** Returns true if orientation events are already flowing (no prompt needed this session). */
export function probeMotionActive(timeoutMs = 300): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;

    function finish(active: boolean) {
      if (settled) return;
      settled = true;
      window.removeEventListener('deviceorientation', onOrientation, true);
      resolve(active);
    }

    function onOrientation(e: DeviceOrientationEvent) {
      if (e.beta != null || e.gamma != null) finish(true);
    }

    window.addEventListener('deviceorientation', onOrientation, true);
    setTimeout(() => finish(false), timeoutMs);
  });
}

/**
 * Request motion/orientation access. Must run from a user gesture on iOS.
 * Always shows the system prompt when needed — never skips based on stored state.
 */
export async function ensureMotionPermission(): Promise<boolean> {
  if (await probeMotionActive()) {
    saveStoredPermissions({ motion: 'granted' });
    return true;
  }

  const DOE = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
    requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
  };

  if (typeof DOE.requestPermission !== 'function') {
    const active = await probeMotionActive(500);
    if (active) saveStoredPermissions({ motion: 'granted' });
    return active;
  }

  try {
    const orientation = await DOE.requestPermission();
    if (orientation !== 'granted') {
      if (orientation === 'denied') saveStoredPermissions({ motion: 'denied' });
      return false;
    }
  } catch {
    return false;
  }

  const DME = DeviceMotionEvent as typeof DeviceMotionEvent & {
    requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
  };

  if (typeof DME.requestPermission === 'function') {
    try {
      const motion = await DME.requestPermission();
      if (motion !== 'granted') {
        if (motion === 'denied') saveStoredPermissions({ motion: 'denied' });
        return false;
      }
    } catch {
      return false;
    }
  }

  const active = await probeMotionActive(400);
  if (active) saveStoredPermissions({ motion: 'granted' });
  return active;
}

export function motionSensorsAvailable(): boolean {
  return 'DeviceMotionEvent' in window || 'DeviceOrientationEvent' in window;
}

export function permissionsPreviouslyGranted(): boolean {
  const stored = loadStoredPermissions();
  return stored.camera === 'granted';
}
