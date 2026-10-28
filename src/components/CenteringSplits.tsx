import { getTfgGrade } from '../lib/tfg-standards';

type MmValue = number | string | null | undefined;

function toNumber(value: MmValue): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(num) ? null : num;
}

/** Border pair as a percentage split, e.g. "54.6/45.4". */
function formatSplit(a: number | null, b: number | null): string {
  if (a === null || b === null) return '—';
  const total = a + b;
  if (total <= 0) return '50.0/50.0';
  const pct = (a / total) * 100;
  return `${pct.toFixed(1)}/${(100 - pct).toFixed(1)}`;
}

/** T/B and L/R percentage splits, with the axis that sets the grade in bold. */
export function CenteringSplits({ top, bottom, left, right }: { top: MmValue; bottom: MmValue; left: MmValue; right: MmValue }) {
  const t = toNumber(top);
  const b = toNumber(bottom);
  const l = toNumber(left);
  const r = toNumber(right);
  const worstAxis =
    t !== null && b !== null && l !== null && r !== null
      ? getTfgGrade({ top: t, bottom: b, left: l, right: r }, 'front').worstAxis
      : null;

  const tb = formatSplit(t, b);
  const lr = formatSplit(l, r);

  return (
    <span className="card-list-measurement-values">
      {worstAxis === 'top-bottom' ? <strong>T/B: {tb}</strong> : <>T/B: {tb}</>}
      {' | '}
      {worstAxis === 'left-right' ? <strong>L/R: {lr}</strong> : <>L/R: {lr}</>}
    </span>
  );
}
