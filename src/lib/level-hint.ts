import type { LevelState } from '../hooks/useDeviceLevel';

export const LEVEL_TOLERANCE_DEG = 5;

export function getLevelHint(state: LevelState): string {
  const { isLevel, beta, gamma, permissionGranted, supported } = state;

  if (!supported) return 'Align phone parallel to the card';
  if (!permissionGranted) return 'Allow motion access when prompted';
  if (isLevel) return 'Hold steady…';
  if (beta == null || gamma == null) return 'Hold phone parallel to the card';

  if (Math.abs(gamma) > LEVEL_TOLERANCE_DEG) {
    return gamma > 0 ? 'Rotate clockwise ↻' : 'Rotate counter-clockwise ↺';
  }

  const pitch = beta > 180 ? beta - 360 : beta;

  if (pitch > LEVEL_TOLERANCE_DEG && pitch < 50) {
    return 'Tilt forward ↓ — hold phone over the card';
  }

  if (pitch > 100) {
    return 'Tilt back ↑ — lay phone parallel to the card';
  }

  if (pitch < 50 - LEVEL_TOLERANCE_DEG) {
    return 'Raise phone slightly — camera over the card';
  }

  return 'Hold phone parallel to the card';
}
