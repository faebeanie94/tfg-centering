/** Request motion/orientation access. Must run from a user gesture on iOS. */
export async function requestMotionPermission(): Promise<boolean> {
  let granted = true;

  const DOE = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
    requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
  };
  if (typeof DOE.requestPermission === 'function') {
    try {
      granted = (await DOE.requestPermission()) === 'granted';
    } catch {
      return false;
    }
    if (!granted) return false;
  }

  const DME = DeviceMotionEvent as typeof DeviceMotionEvent & {
    requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
  };
  if (typeof DME.requestPermission === 'function') {
    try {
      granted = (await DME.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }

  return granted;
}

export function motionSensorsAvailable(): boolean {
  return 'DeviceMotionEvent' in window || 'DeviceOrientationEvent' in window;
}
