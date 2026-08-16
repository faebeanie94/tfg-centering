import { getTfgGrade, type CardSide, type TfgCenteringGrade } from '../../lib/tfg-standards';
import type { BorderMeasurements } from '../../lib/centering';

/**
 * Commit 19 entry: measured L/R/T/B → existing TFG spreadsheet rules.
 * Do not add new grade bands here.
 */
export function gradeCard(borders: BorderMeasurements, side: CardSide): TfgCenteringGrade {
  return getTfgGrade(borders, side);
}
