import { useEffect, useState } from 'react';
import { motionSensorsAvailable } from '../lib/motion-permission';
import { LEVEL_TOLERANCE_DEG } from '../lib/level-hint';

export interface LevelState {
  isLevel: boolean;
  beta: number | null;
  gamma: number | null;
  supported: boolean;
  permissionGranted: boolean;
}

/** Phone flat on a surface (back parallel to card/table). */
function isFlatParallel(beta: number, gamma: number): boolean {
  const pitch = beta > 180 ? beta - 360 : beta;
  return Math.abs(pitch) <= LEVEL_TOLERANCE_DEG && Math.abs(gamma) <= LEVEL_TOLERANCE_DEG;
}

/** Phone held in portrait above a flat card (typical scan pose). */
function isPortraitScan(beta: number, gamma: number): boolean {
  return (
    Math.abs(gamma) <= LEVEL_TOLERANCE_DEG &&
    beta >= 50 - LEVEL_TOLERANCE_DEG &&
    beta <= 100 + LEVEL_TOLERANCE_DEG
  );
}

function checkLevel(beta: number | null, gamma: number | null): boolean {
  if (beta === null || gamma === null) return false;
  return isFlatParallel(beta, gamma) || isPortraitScan(beta, gamma);
}

export function useDeviceLevel(active: boolean, permissionGranted: boolean): LevelState {
  const [beta, setBeta] = useState<number | null>(null);
  const [gamma, setGamma] = useState<number | null>(null);
  const supported = motionSensorsAvailable();

  useEffect(() => {
    if (!active || !permissionGranted) {
      setBeta(null);
      setGamma(null);
      return;
    }

    let mounted = true;

    function onOrientation(e: DeviceOrientationEvent) {
      if (!mounted) return;
      if (e.beta != null) setBeta(e.beta);
      if (e.gamma != null) setGamma(e.gamma);
    }

    window.addEventListener('deviceorientation', onOrientation, true);

    return () => {
      mounted = false;
      window.removeEventListener('deviceorientation', onOrientation, true);
    };
  }, [active, permissionGranted]);

  const isLevel = checkLevel(beta, gamma);

  return { isLevel, beta, gamma, supported, permissionGranted };
}
