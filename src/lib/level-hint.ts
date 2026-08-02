import type { LevelState } from '../hooks/useDeviceLevel';

export const LEVEL_TOLERANCE_DEG = 3;

export function getLevelHint(state: LevelState): string {
  const { isLevel, tiltFromFlat, roll, beta, gamma, permissionGranted, supported } = state;

  if (!supported) return 'Align phone parallel to the card';
  if (!permissionGranted) return 'Allow motion access when prompted';
  if (isLevel) return 'Hold steady…';
  if (tiltFromFlat == null || roll == null) return 'Hold phone parallel to the card';

  const rollVal = gamma ?? roll;
  const rollErr = Math.abs(rollVal) - LEVEL_TOLERANCE_DEG;
  const tiltErr = tiltFromFlat - LEVEL_TOLERANCE_DEG;

  if (rollErr > tiltErr && rollErr > 0) {
    return rollVal > 0 ? 'Rotate clockwise ↻' : 'Rotate counter-clockwise ↺';
  }

  if (tiltErr > 0) {
    if (beta != null && beta > 25) return 'Tilt back ↑';
    return 'Tilt forward ↓';
  }

  return 'Hold phone parallel to the card';
}
