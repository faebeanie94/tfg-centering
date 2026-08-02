export {
  ensureMotionPermission,
  motionSensorsAvailable,
  probeMotionActive,
} from './permissions';

/** @deprecated Use ensureMotionPermission */
export { ensureMotionPermission as requestMotionPermission } from './permissions';
