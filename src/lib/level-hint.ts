import type { LevelState } from '../hooks/useDeviceLevel';
import type { CardAlignmentState } from './card-alignment';
import { SIZE_MAX, SIZE_MIN } from './card-alignment';

export const LEVEL_TOLERANCE_DEG = 5;

export function getLevelHint(state: LevelState): string {
  const { isLevel, beta, gamma, permissionGranted, supported } = state;

  if (!supported) return 'Align phone parallel to the card';
  if (!permissionGranted) return 'Tap "Enable Motion" below to allow levelling';
  if (isLevel) return 'Hold steady…';
  if (beta == null || gamma == null) return 'Hold phone parallel to the card';

  if (Math.abs(gamma) > LEVEL_TOLERANCE_DEG) {
    return gamma > 0 ? 'Rotate phone clockwise ↻' : 'Rotate phone counter-clockwise ↺';
  }

  const pitch = beta > 180 ? beta - 360 : beta;

  if (pitch > LEVEL_TOLERANCE_DEG && pitch < 50) {
    return 'Tilt phone forward ↓ — hold over the card';
  }

  if (pitch > 100) {
    return 'Tilt phone back ↑ — lay parallel to the card';
  }

  if (pitch < 50 - LEVEL_TOLERANCE_DEG) {
    return 'Raise phone slightly — camera over the card';
  }

  return 'Hold phone parallel to the card';
}

function intersectionRatio(
  a: { left: number; top: number; width: number; height: number },
  b: { left: number; top: number; width: number; height: number },
): { ofA: number; ofB: number } {
  const x0 = Math.max(a.left, b.left);
  const y0 = Math.max(a.top, b.top);
  const x1 = Math.min(a.left + a.width, b.left + b.width);
  const y1 = Math.min(a.top + a.height, b.top + b.height);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const aArea = Math.max(1e-6, a.width * a.height);
  const bArea = Math.max(1e-6, b.width * b.height);
  return { ofA: inter / aArea, ofB: inter / bArea };
}

export function getCardAlignmentHint(alignment: CardAlignmentState): string {
  const { detected, isCardLevel, fitsGuide, offsetX, offsetY, sizeRatio, rotationDeg } = alignment;

  if (!detected) {
    return 'Line the card up with the dashed frame';
  }

  if (!isCardLevel) {
    return rotationDeg > 0
      ? 'Rotate card counter-clockwise ↺'
      : 'Rotate card clockwise ↻';
  }

  if (fitsGuide) return 'Card aligned — hold steady…';

  const { guide } = alignment;
  const overlap = intersectionRatio(detected, guide);
  const extraBottom = detected.top + detected.height - (guide.top + guide.height);

  // Orange locked onto the stand/table below the dashes — not "move the card up".
  if (overlap.ofA < 0.42 || (extraBottom > 0.1 && overlap.ofA < 0.7)) {
    return 'Keep the card inside the dashed frame';
  }

  // Card already sits in the dashes; a slightly large/small guide should not nag.
  if (overlap.ofA > 0.72 && overlap.ofB > 0.38) {
    if (offsetX > 0.08) return 'Centre card in guide — move left ←';
    if (offsetX < -0.08) return 'Centre card in guide — move right →';
    if (offsetY > 0.08) return 'Centre card in guide — move up ↑';
    if (offsetY < -0.08) return 'Centre card in guide — move down ↓';
    return 'Card is in the frame — hold steady…';
  }

  if (sizeRatio < SIZE_MIN) return 'Move closer — fill the dashed frame with the card';
  if (sizeRatio > SIZE_MAX) return 'Move back — the card should sit inside the dashed frame';

  if (offsetX > 0.055) return 'Centre card in guide — move left ←';
  if (offsetX < -0.055) return 'Centre card in guide — move right →';
  if (offsetY > 0.055) return 'Centre card in guide — move up ↑';
  if (offsetY < -0.055) return 'Centre card in guide — move down ↓';

  if (detected.left < guide.left - 0.025) return 'Move card right →';
  if (detected.top < guide.top - 0.025) return 'Move card down ↓';
  if (detected.left + detected.width > guide.left + guide.width + 0.025) return 'Move card left ←';
  if (detected.top + detected.height > guide.top + guide.height + 0.025) return 'Move card up ↑';

  return 'Fit the card inside the dashed frame';
}

export function getScannerHint(phone: LevelState, alignment: CardAlignmentState, showLevel: boolean): string {
  if (!showLevel) return 'Line the card up with the dashed frame, then tap capture';
  if (!phone.supported) return 'Align phone parallel to the card';
  if (!phone.permissionGranted) return 'Tap "Enable Motion" below to allow levelling';
  if (!phone.isLevel) return getLevelHint(phone);
  return getCardAlignmentHint(alignment);
}
