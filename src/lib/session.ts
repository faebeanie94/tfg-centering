import type { Rect, CenteringResult } from './centering';
import type { TfgCenteringGrade, CardSide } from './tfg-standards';

export interface SideSnapshot {
  imageSrc: string;
  outer: Rect;
  inner: Rect;
  result: CenteringResult;
  grade: TfgCenteringGrade;
  savedAt: number;
  name?: string;
  cardFormatId?: string;
}

export interface GradingSession {
  front: SideSnapshot | null;
  back: SideSnapshot | null;
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
