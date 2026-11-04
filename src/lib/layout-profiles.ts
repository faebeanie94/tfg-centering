/**
 * Layout profiles for borderless / full-art cards.
 *
 * A bordered card is designed to be 50/50, so raw splits are graded as-is.
 * A borderless card has no even frame: the yellow box sits on fixed printed
 * reference points (title lettering, collector line, …) that are NOT
 * symmetrical by design. Each profile stores where those points sit on a
 * perfectly cut copy (the "target"), and the measured split is corrected
 * against it before the normal TFG thresholds are applied:
 *
 *   corrected = 50 + (measured − target)
 *
 * Thresholds themselves never change.
 */

import type { CenteringResult } from './centering';

export interface LayoutProfile {
  id: string;
  label: string;
  /** Top share (%) of top+bottom on a perfectly cut copy. 50 for bordered cards. */
  tbTarget: number;
  /** Left share (%) of left+right on a perfectly cut copy. 50 for bordered cards. */
  lrTarget: number;
  /** Where to place the yellow box for this layout. */
  hint?: string;
  /** Where the target came from, e.g. "Scryfall 672×936" or "avg of 12 copies". */
  source?: string;
  builtIn?: boolean;
}

export const BORDERED_PROFILE_ID = 'bordered';

export const BORDERED_PROFILE: LayoutProfile = {
  id: BORDERED_PROFILE_ID,
  label: 'Bordered (50/50)',
  tbTarget: 50,
  lrTarget: 50,
  builtIn: true,
};

export const BUILT_IN_PROFILES: LayoutProfile[] = [
  BORDERED_PROFILE,
  {
    id: 'mtg-msh-classic-comic',
    label: 'MTG Marvel Super Heroes – Classic Comic',
    tbTarget: 33.3,
    lrTarget: 48.7,
    hint:
      'Yellow box: top of “MARVEL SUPER-HEROES!” lettering · bottom of “MSH★EN” line · left of “M 0394” · right of “© MARVEL”',
    source: 'Scryfall 672×936 (Doctor Doom #0394)',
    builtIn: true,
  },
];

export interface CorrectedSplits {
  topBottom: { top: number; bottom: number };
  leftRight: { left: number; right: number };
}

export interface SnapshotLayout {
  profileId: string;
  label: string;
  tbTarget: number;
  lrTarget: number;
  corrected: CorrectedSplits;
}

const MIN_PCT = 0.1;
const MAX_PCT = 99.9;

function clampPct(n: number): number {
  return Math.min(MAX_PCT, Math.max(MIN_PCT, n));
}

export function isValidTarget(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 && n < 100;
}

/** True when the profile actually changes the grade (i.e. not 50/50). */
export function isCorrectingProfile(profile: LayoutProfile): boolean {
  return profile.tbTarget !== 50 || profile.lrTarget !== 50;
}

export function allLayoutProfiles(custom: LayoutProfile[]): LayoutProfile[] {
  return [...BUILT_IN_PROFILES, ...custom];
}

export function findLayoutProfile(id: string, custom: LayoutProfile[]): LayoutProfile {
  return allLayoutProfiles(custom).find((p) => p.id === id) ?? BORDERED_PROFILE;
}

export function correctSplits(result: CenteringResult, profile: LayoutProfile): CorrectedSplits {
  const top = clampPct(50 + (result.topBottom.top - profile.tbTarget));
  const left = clampPct(50 + (result.leftRight.left - profile.lrTarget));
  return {
    topBottom: { top, bottom: 100 - top },
    leftRight: { left, right: 100 - left },
  };
}

/**
 * Border values to feed getTfgGrade(). The qualify ratio (larger ÷ smaller)
 * is scale-free, so corrected percentages can stand in for pixel borders.
 */
export function bordersForGrading(
  result: CenteringResult,
  profile: LayoutProfile,
): { left: number; right: number; top: number; bottom: number } {
  if (!isCorrectingProfile(profile)) return result.bordersPx;
  const c = correctSplits(result, profile);
  return {
    left: c.leftRight.left,
    right: c.leftRight.right,
    top: c.topBottom.top,
    bottom: c.topBottom.bottom,
  };
}

export function newCustomProfileId(): string {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Drop anything malformed loaded from localStorage. */
export function sanitizeCustomProfiles(raw: unknown): LayoutProfile[] {
  if (!Array.isArray(raw)) return [];
  const builtInIds = new Set(BUILT_IN_PROFILES.map((p) => p.id));
  return raw
    .filter(
      (p): p is LayoutProfile =>
        !!p &&
        typeof p === 'object' &&
        typeof (p as LayoutProfile).id === 'string' &&
        !builtInIds.has((p as LayoutProfile).id) &&
        typeof (p as LayoutProfile).label === 'string' &&
        isValidTarget((p as LayoutProfile).tbTarget) &&
        isValidTarget((p as LayoutProfile).lrTarget),
    )
    .map((p) => ({
      id: p.id,
      label: p.label,
      tbTarget: p.tbTarget,
      lrTarget: p.lrTarget,
      hint: typeof p.hint === 'string' ? p.hint : undefined,
      source: typeof p.source === 'string' ? p.source : undefined,
    }));
}
