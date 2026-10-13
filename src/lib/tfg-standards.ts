/** TFG centering grade thresholds from the official centering tool spreadsheet. */

export type CardSide = 'front' | 'back';

export interface GradeThreshold {
  grade: number;
  label: string;
  /** Highest qualify ratio (3 d.p.) that still earns this grade. */
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
 * The worst-axis ratio is rounded to 3 d.p. before grading, matching PHP 8.4
 * round($n, 3) on the TFG website: half away from zero, applied to the
 * shortest decimal form of the float (so 4.0005 → 4.001, 1.0014999999999998 → 1.001).
 */
export function roundQualify(n: number): number {
  if (!Number.isFinite(n)) return n;
  const [whole, frac = ''] = String(Math.abs(n)).split('.');
  if (frac.length <= 3 || whole.includes('e')) return n;
  const thousandths = Number(whole + frac.slice(0, 3)) + (frac[3] >= '5' ? 1 : 0);
  return (Math.sign(n) * thousandths) / 1000;
}

export const TFG_FRONT_THRESHOLDS: GradeThreshold[] = [
  { grade: 10, label: 'TFG 10', maxQualify: 1.061, ratioLabel: '~51.5/48.5' },
  { grade: 9.5, label: 'TFG 9.5', maxQualify: 1.152, ratioLabel: '~53.5/46.5' },
  { grade: 9, label: 'TFG 9', maxQualify: 1.31, ratioLabel: '~56.7/43.3' },
  { grade: 8, label: 'TFG 8', maxQualify: 1.5, ratioLabel: '60/40' },
  { grade: 7, label: 'TFG 7', maxQualify: 1.857, ratioLabel: '65/35' },
  { grade: 6, label: 'TFG 6', maxQualify: 2.333, ratioLabel: '70/30' },
  { grade: 5, label: 'TFG 5', maxQualify: 3, ratioLabel: '75/25' },
  { grade: 4, label: 'TFG 4', maxQualify: 4, ratioLabel: '80/20' },
  { grade: 3, label: 'TFG 3', maxQualify: 5.667, ratioLabel: '85/15' },
  { grade: 2, label: 'TFG 2', maxQualify: 9, ratioLabel: '90/10' },
  { grade: 1, label: 'TFG 1', maxQualify: Infinity, ratioLabel: 'Worse than 90/10' },
];

/** The back alone never limits a card below TFG 5. */
export const TFG_BACK_THRESHOLDS: GradeThreshold[] = [
  { grade: 10, label: 'TFG 10', maxQualify: 1.25, ratioLabel: '~55.6/44.4' },
  { grade: 9.5, label: 'TFG 9.5', maxQualify: 1.5, ratioLabel: '60/40' },
  { grade: 9, label: 'TFG 9', maxQualify: 2.333, ratioLabel: '70/30' },
  { grade: 8, label: 'TFG 8', maxQualify: 4, ratioLabel: '80/20' },
  { grade: 7, label: 'TFG 7', maxQualify: 9, ratioLabel: '90/10' },
  { grade: 6, label: 'TFG 6', maxQualify: 19, ratioLabel: '95/5' },
  { grade: 5, label: 'TFG 5', maxQualify: Infinity, ratioLabel: 'Worse than 95/5' },
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
  const lrQualify = qualifyRatio(borders.left, borders.right);
  const tbQualify = qualifyRatio(borders.top, borders.bottom);
  const worstQualify = roundQualify(Math.max(lrQualify, tbQualify));
  const worstAxis = lrQualify >= tbQualify ? 'left-right' : 'top-bottom';

  const thresholds = side === 'front' ? TFG_FRONT_THRESHOLDS : TFG_BACK_THRESHOLDS;

  const match =
    thresholds.find((t) => worstQualify <= t.maxQualify) ?? thresholds[thresholds.length - 1];

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
  { grade: '10', front: '~51.5/48.5', back: '~55.6/44.4' },
  { grade: '9.5', front: '~53.5/46.5', back: '60/40' },
  { grade: '9', front: '~56.7/43.3', back: '70/30' },
  { grade: '8', front: '60/40', back: '80/20' },
  { grade: '7', front: '65/35', back: '90/10' },
  { grade: '6', front: '70/30', back: '95/5' },
  { grade: '5', front: '75/25', back: 'Worse than 95/5' },
  { grade: '4', front: '80/20', back: '—' },
  { grade: '3', front: '85/15', back: '—' },
  { grade: '2', front: '90/10', back: '—' },
  { grade: '1', front: 'Worse than 90/10', back: '—' },
];
