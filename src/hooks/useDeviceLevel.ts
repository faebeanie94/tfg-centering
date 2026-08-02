import { useEffect, useState } from 'react';
import { motionSensorsAvailable } from '../lib/motion-permission';
import { LEVEL_TOLERANCE_DEG } from '../lib/level-hint';

export interface LevelState {
  isLevel: boolean;
  tiltFromFlat: number | null;
  roll: number | null;
  beta: number | null;
  gamma: number | null;
  supported: boolean;
  permissionGranted: boolean;
}

function checkLevel(tiltFromFlat: number | null, roll: number | null): boolean {
  if (tiltFromFlat === null || roll === null) return false;
  return tiltFromFlat <= LEVEL_TOLERANCE_DEG && Math.abs(roll) <= LEVEL_TOLERANCE_DEG;
}

export function useDeviceLevel(active: boolean, permissionGranted: boolean): LevelState {
  const [tiltFromFlat, setTiltFromFlat] = useState<number | null>(null);
  const [roll, setRoll] = useState<number | null>(null);
  const [beta, setBeta] = useState<number | null>(null);
  const [gamma, setGamma] = useState<number | null>(null);
  const supported = motionSensorsAvailable();

  useEffect(() => {
    if (!active || !permissionGranted) {
      setTiltFromFlat(null);
      setRoll(null);
      setBeta(null);
      setGamma(null);
      return;
    }

    let mounted = true;

    function onMotion(e: DeviceMotionEvent) {
      if (!mounted) return;
      const g = e.accelerationIncludingGravity;
      if (!g || g.x == null || g.y == null || g.z == null) return;

      const mag = Math.hypot(g.x, g.y, g.z);
      if (mag < 5) return;

      const ny = g.y / mag;
      const nz = g.z / mag;

      const tilt = Math.acos(Math.min(1, Math.abs(nz))) * (180 / Math.PI);
      const rollDeg = Math.atan2(ny, nz) * (180 / Math.PI);

      setTiltFromFlat(tilt);
      setRoll(rollDeg);
    }

    function onOrientation(e: DeviceOrientationEvent) {
      if (!mounted) return;
      if (e.beta != null) setBeta(e.beta);
      if (e.gamma != null) setGamma(e.gamma);
    }

    window.addEventListener('devicemotion', onMotion);
    window.addEventListener('deviceorientation', onOrientation);

    return () => {
      mounted = false;
      window.removeEventListener('devicemotion', onMotion);
      window.removeEventListener('deviceorientation', onOrientation);
    };
  }, [active, permissionGranted]);

  const isLevel = checkLevel(tiltFromFlat, roll);

  return { isLevel, tiltFromFlat, roll, beta, gamma, supported, permissionGranted };
}
