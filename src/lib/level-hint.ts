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

export function getCardAlignmentHint(alignment: CardAlignmentState): string {
  const { detected, isCardLevel, fitsGuide, offsetX, offsetY, sizeRatio, rotationDeg } = alignment;

  if (!detected) return 'Place card in the upper scan area';

  if (!isCardLevel) {
    return rotationDeg > 0
      ? 'Rotate card counter-clockwise ↺'
      : 'Rotate card clockwise ↻';
  }

  if (fitsGuide) return 'Card aligned — hold steady…';

  if (sizeRatio < SIZE_MIN) return 'Hold phone closer ↓ — fill the guide';
  if (sizeRatio > SIZE_MAX) return 'Hold phone higher ↑ — card too large in frame';

  if (offsetX > 0.055) return 'Centre card in guide — move left ←';
  if (offsetX < -0.055) return 'Centre card in guide — move right →';
  if (offsetY > 0.055) return 'Centre card in guide — move up ↑';
  if (offsetY < -0.055) return 'Centre card in guide — move down ↓';

  const { guide } = alignment;
  if (detected.left < guide.left - 0.025) return 'Move card right →';
  if (detected.top < guide.top - 0.025) return 'Move card down ↓';
  if (detected.left + detected.width > guide.left + guide.width + 0.025) return 'Move card left ←';
  if (detected.top + detected.height > guide.top + guide.height + 0.025) return 'Move card up ↑';

  return 'Adjust card to fit inside the guide';
}

export function getScannerHint(phone: LevelState, alignment: CardAlignmentState, showLevel: boolean): string {
  if (!showLevel) return 'Fill the frame with your card and tap capture';
  if (!phone.supported) return 'Align phone parallel to the card';
  if (!phone.permissionGranted) return 'Tap "Enable Motion" below to allow levelling';
  if (!phone.isLevel) return getLevelHint(phone);
  return getCardAlignmentHint(alignment);
}
