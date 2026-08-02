import { useEffect, useState } from 'react';

export interface LevelState {
  isLevel: boolean;
  gamma: number | null;
  beta: number | null;
  supported: boolean;
  permissionGranted: boolean;
}

const GAMMA_TOLERANCE = 4;
const BETA_TOLERANCE = 6;

function checkLevel(beta: number | null, gamma: number | null): boolean {
  if (beta === null || gamma === null) return false;
  const betaDeviation = Math.abs(Math.abs(beta) - 90);
  return betaDeviation <= BETA_TOLERANCE && Math.abs(gamma) <= GAMMA_TOLERANCE;
}

export function useDeviceLevel(active: boolean): LevelState {
  const [gamma, setGamma] = useState<number | null>(null);
  const [beta, setBeta] = useState<number | null>(null);
  const [supported, setSupported] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);

  useEffect(() => {
    if (!active) {
      setGamma(null);
      setBeta(null);
      return;
    }

    const hasOrientation = 'DeviceOrientationEvent' in window;
    setSupported(hasOrientation);
    if (!hasOrientation) return;

    let mounted = true;

    function onOrientation(e: DeviceOrientationEvent) {
      if (!mounted) return;
      if (e.beta !== null) setBeta(e.beta);
      if (e.gamma !== null) setGamma(e.gamma);
    }

    async function setup() {
      const DOE = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
        requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
      };

      if (typeof DOE.requestPermission === 'function') {
        try {
          const result = await DOE.requestPermission();
          if (!mounted) return;
          setPermissionGranted(result === 'granted');
          if (result !== 'granted') return;
        } catch {
          if (mounted) setPermissionGranted(false);
          return;
        }
      } else {
        setPermissionGranted(true);
      }

      window.addEventListener('deviceorientation', onOrientation);
    }

    setup();

    return () => {
      mounted = false;
      window.removeEventListener('deviceorientation', onOrientation);
    };
  }, [active]);

  const isLevel = checkLevel(beta, gamma);

  return { isLevel, gamma, beta, supported, permissionGranted };
}
