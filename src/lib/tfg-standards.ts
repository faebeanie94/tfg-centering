/** TFG centering grade thresholds from the official centering tool spreadsheet. */

export type CardSide = 'front' | 'back';

export interface GradeThreshold {
  grade: number;
  label: string;
  minQualify: number;
  maxQualify: number;
  ratioLabel: string;
}

/** Qualify ratio = larger border ÷ smaller border on an axis. */
export function qualifyRatio(a: number, b: number): number {
  if (a <= 0 && b <= 0) return 1;
  const larger = Math.max(a, b);
  const smaller = Math.min(a, b);
  return smaller > 0 ? larger / smaller : 999;
}

/**
 * Spreadsheet thresholds are published to 2 decimal places with 0.01 gaps
 * between bands (e.g. 1.15 then 1.16). Round before lookup so continuous
 * ratios like 3.72/3.22 ≈ 1.155 map into a band instead of falling through
 * to the grade-1 fallback.
 */
export function roundQualify(n: number): number {
  return Number(n.toFixed(2));
}

export const TFG_FRONT_THRESHOLDS: GradeThreshold[] = [
  { grade: 10, label: 'TFG 10', minQualify: 1, maxQualify: 1.06, ratioLabel: '50/50' },
  { grade: 9.5, label: 'TFG 9.5', minQualify: 1.07, maxQualify: 1.15, ratioLabel: '53/47' },
  { grade: 9, label: 'TFG 9', minQualify: 1.16, maxQualify: 1.31, ratioLabel: '55/45' },
  { grade: 8, label: 'TFG 8', minQualify: 1.32, maxQualify: 1.5, ratioLabel: '60/40' },
  { grade: 7, label: 'TFG 7', minQualify: 1.51, maxQualify: 1.86, ratioLabel: '65/35' },
  { grade: 6, label: 'TFG 6', minQualify: 1.87, maxQualify: 2.33, ratioLabel: '70/30' },
  { grade: 5, label: 'TFG 5', minQualify: 2.34, maxQualify: 3, ratioLabel: '75/25' },
  { grade: 4, label: 'TFG 4', minQualify: 3.01, maxQualify: 4, ratioLabel: '80/20' },
  { grade: 3, label: 'TFG 3', minQualify: 4.01, maxQualify: 5.67, ratioLabel: '85/15' },
  { grade: 2, label: 'TFG 2', minQualify: 5.68, maxQualify: 7, ratioLabel: '90/10' },
  { grade: 1, label: 'TFG 1', minQualify: 7.01, maxQualify: Infinity, ratioLabel: 'Any' },
];

export const TFG_BACK_THRESHOLDS: GradeThreshold[] = [
  { grade: 10, label: 'TFG 10', minQualify: 1, maxQualify: 1.25, ratioLabel: '60/40' },
  { grade: 9.5, label: 'TFG 9.5', minQualify: 1.26, maxQualify: 1.5, ratioLabel: '60/40' },
  { grade: 9, label: 'TFG 9', minQualify: 1.51, maxQualify: 2.33, ratioLabel: '70/30' },
  { grade: 8, label: 'TFG 8', minQualify: 2.34, maxQualify: 4, ratioLabel: '80/20' },
  { grade: 7, label: 'TFG 7', minQualify: 4.01, maxQualify: 9, ratioLabel: '90/10' },
  { grade: 6, label: 'TFG 6', minQualify: 4.01, maxQualify: 9, ratioLabel: '90/10' },
  { grade: 5, label: 'TFG 5', minQualify: 4.01, maxQualify: 19, ratioLabel: '95/5' },
  { grade: 4, label: 'TFG 4', minQualify: 19.01, maxQualify: Infinity, ratioLabel: 'Any' },
  { grade: 3, label: 'TFG 3', minQualify: 19.01, maxQualify: Infinity, ratioLabel: 'Any' },
  { grade: 2, label: 'TFG 2', minQualify: 19.01, maxQualify: Infinity, ratioLabel: 'Any' },
  { grade: 1, label: 'TFG 1', minQualify: 19.01, maxQualify: Infinity, ratioLabel: 'Any' },
];

export interface TfgCenteringGrade {
  grade: number;
  label: string;
  ratioLabel: string;
  lrQualify: number;
  tbQualify: number;
  worstQualify: number;
  worstAxis: 'left-right' | 'top-bottom';
  ocEligible: boolean;
}

export function getTfgGrade(
  borders: { left: number; right: number; top: number; bottom: number },
  side: CardSide,
): TfgCenteringGrade {
  const lrQualify = roundQualify(qualifyRatio(borders.left, borders.right));
  const tbQualify = roundQualify(qualifyRatio(borders.top, borders.bottom));
  const worstQualify = Math.max(lrQualify, tbQualify);
  const worstAxis = lrQualify >= tbQualify ? 'left-right' : 'top-bottom';

  const thresholds = side === 'front' ? TFG_FRONT_THRESHOLDS : TFG_BACK_THRESHOLDS;

  const match =
    thresholds.find((t) => worstQualify >= t.minQualify && worstQualify <= t.maxQualify) ??
    // Safety net if a value somehow still misses a band: pick the tightest
    // maxQualify that still covers it, instead of defaulting to TFG 1.
    thresholds.find((t) => worstQualify <= t.maxQualify) ??
    thresholds[thresholds.length - 1];

  return {
    grade: match.grade,
    label: match.label,
    ratioLabel: match.ratioLabel,
    lrQualify,
    tbQualify,
    worstQualify,
    worstAxis,
    ocEligible: match.grade <= 5,
  };
}

export const TFG_STANDARDS_TEXT = [
  { grade: '10', front: '50/50', back: '60/40' },
  { grade: '9.5', front: '53/47', back: '60/40' },
  { grade: '9', front: '55/45', back: '70/30' },
  { grade: '8', front: '60/40', back: '80/20' },
  { grade: '7', front: '65/35', back: '90/10' },
  { grade: '6', front: '70/30', back: '90/10' },
  { grade: '5', front: '75/25', back: '95/5' },
  { grade: '4', front: '80/20', back: 'Any' },
  { grade: '3', front: '85/15', back: 'Any' },
  { grade: '2', front: '90/10', back: 'Any' },
  { grade: '1', front: 'Any', back: 'Any' },
];
