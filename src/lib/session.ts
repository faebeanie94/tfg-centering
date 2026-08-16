import { computeCentering, type Rect, type CenteringResult } from './centering';
import { getTfgGrade, type TfgCenteringGrade, type CardSide } from './tfg-standards';
import type { CardFormat } from './card-sizes';

export interface SideSnapshot {
  imageSrc: string;
  outer: Rect;
  inner: Rect;
  result: CenteringResult;
  grade: TfgCenteringGrade;
  savedAt: number;
  name?: string;
}

export interface GradingSession {
  front: SideSnapshot | null;
  back: SideSnapshot | null;
}

/** Build a side snapshot with existing centering math + TFG thresholds. */
export function snapshotFromRects(
  imageSrc: string,
  outer: Rect,
  inner: Rect,
  side: CardSide,
  cardFormat: CardFormat,
  name?: string,
): SideSnapshot {
  const result = computeCentering(outer, inner, cardFormat.widthMm, cardFormat.heightMm);
  return {
    imageSrc,
    outer,
    inner,
    result,
    grade: getTfgGrade(result.bordersPx, side),
    savedAt: Date.now(),
    name: name?.trim() || undefined,
  };
}

export function emptySession(): GradingSession {
  return { front: null, back: null };
}

export function sessionHasBoth(session: GradingSession): boolean {
  return session.front !== null && session.back !== null;
}

export function sessionHasAny(session: GradingSession): boolean {
  return session.front !== null || session.back !== null;
}

export function formatGrade(grade: number): string {
  return grade === 9.5 ? '9.5' : String(grade);
}

export function limitingGrade(session: GradingSession): { side: CardSide; grade: number } | null {
  const f = session.front?.grade.grade;
  const b = session.back?.grade.grade;
  if (f == null && b == null) return null;
  if (f == null) return { side: 'back', grade: b! };
  if (b == null) return { side: 'front', grade: f };
  if (f <= b) return { side: 'front', grade: f };
  return { side: 'back', grade: b };
}
