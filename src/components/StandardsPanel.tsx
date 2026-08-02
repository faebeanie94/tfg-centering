import { TFG_STANDARDS_TEXT } from '../lib/tfg-standards';

interface StandardsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function StandardsPanel({ open, onClose }: StandardsPanelProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal standards-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>TFG Centering Standards</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <p className="standards-intro">
          TFG grades centering by the ratio between the two worst opposing borders (left/right
          or top/bottom). A perfect ratio is 50/50. Grade is based on the worst axis.
        </p>

        <table className="grade-table">
          <thead>
            <tr>
              <th>Grade</th>
              <th>Front (worst axis)</th>
              <th>Back (worst axis)</th>
            </tr>
          </thead>
          <tbody>
            {TFG_STANDARDS_TEXT.map((row) => (
              <tr key={row.grade}>
                <td>{row.grade}</td>
                <td>{row.front}</td>
                <td>{row.back}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="standards-note">
          <strong>OC (Off-Center):</strong> Awarded when centering scores 5 or below, but the
          card averages 5+ across Corners, Edges, and Surface.
        </div>
      </div>
    </div>
  );
}
