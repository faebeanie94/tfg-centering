import { useMemo, useState } from 'react';
import type { GradingSession } from '../lib/session';
import { formatGrade, limitingGrade } from '../lib/session';
import type { CardSide } from '../lib/tfg-standards';
import { CompareExportMenu } from './CardMenu';

interface CompareViewProps {
  session: GradingSession;
  onEdit: (side: CardSide) => void;
  onClose: () => void;
}

function SideCard({
  label,
  snapshot,
  onEdit,
}: {
  label: string;
  snapshot: GradingSession['front'];
  onEdit: () => void;
}) {
  if (!snapshot) {
    return (
      <div className="compare-card compare-card-empty">
        <div className="compare-card-label">{label}</div>
        <p>Not captured</p>
        <button type="button" className="btn btn-secondary btn-small" onClick={onEdit}>
          Capture
        </button>
      </div>
    );
  }

  const { grade, result, imageSrc, name } = snapshot;

  return (
    <div className="compare-card">
      <div className="compare-card-label">{label}{name ? ` · ${name}` : ''}</div>
      <img src={imageSrc} alt={label} className="compare-thumb" />
      <div className="compare-grade">{formatGrade(grade.grade)}</div>
      <div className="compare-metrics">
        <span>L|R {result.leftRight.left.toFixed(1)}|{result.leftRight.right.toFixed(1)}</span>
        <span>T|B {result.topBottom.top.toFixed(1)}|{result.topBottom.bottom.toFixed(1)}</span>
      </div>
      <div className="compare-detail">
        Qualify {grade.worstQualify.toFixed(2)} · {grade.worstAxis === 'left-right' ? 'L/R' : 'T/B'}
      </div>
      <button type="button" className="btn btn-secondary btn-small" onClick={onEdit}>
        Edit
      </button>
    </div>
  );
}

export function CompareView({ session, onEdit, onClose }: CompareViewProps) {
  const [showExport, setShowExport] = useState(false);
  const limit = limitingGrade(session);

  const exportImages = useMemo(() => {
    const items: Array<{ side: CardSide; imageSrc: string; name?: string }> = [];
    if (session.front) items.push({ side: 'front', imageSrc: session.front.imageSrc, name: session.front.name });
    if (session.back) items.push({ side: 'back', imageSrc: session.back.imageSrc, name: session.back.name });
    return items;
  }, [session]);

  return (
    <div className="compare">
      <div className="compare-header">
        <button type="button" className="btn btn-secondary btn-small" onClick={onClose}>
          ← Back
        </button>
        <h2>Front & Back Compare</h2>
        {exportImages.length > 0 && (
          <button type="button" className="btn btn-secondary btn-small" onClick={() => setShowExport(true)}>
            Export
          </button>
        )}
      </div>

      <div className="compare-grid">
        <SideCard label="Front" snapshot={session.front} onEdit={() => onEdit('front')} />
        <SideCard label="Back" snapshot={session.back} onEdit={() => onEdit('back')} />
      </div>

      {limit && session.front && session.back && (
        <div className="compare-summary">
          <strong>Limiting centering grade:</strong> {formatGrade(limit.grade)} ({limit.side})
          <p className="compare-note">
            TFG centering is scored independently per side. The lower grade typically limits the
            centering sub-score for the overall grade.
          </p>
        </div>
      )}

      {(session.front?.grade.ocEligible || session.back?.grade.ocEligible) && (
        <div className="oc-note">
          One or both sides may qualify for OC alt grade (centering ≤5, other criteria ≥5)
        </div>
      )}

      <CompareExportMenu open={showExport} images={exportImages} onClose={() => setShowExport(false)} />
    </div>
  );
}
