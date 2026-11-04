import { useMemo, useState } from 'react';
import { formatPct } from '../lib/centering';
import type { GradingSession } from '../lib/session';
import { formatGrade, limitingGrade } from '../lib/session';
import { libraryErrorMessage } from '../lib/saved-cards';
import type { CardSide } from '../lib/tfg-standards';
import { CompareExportMenu } from './CardMenu';

interface CompareViewProps {
  session: GradingSession;
  onEdit: (side: CardSide) => void;
  onClose: () => void;
  onSaveToLibrary?: () => Promise<boolean>;
  onLibrary?: () => void;
  onViewCards?: () => void;
  libraryMessage?: string | null;
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

  const { grade, result, imageSrc, name, layout } = snapshot;
  // The grade comes from the adjusted split on a borderless card.
  const splits = layout?.corrected ?? result;

  return (
    <div className="compare-card">
      <div className="compare-card-label">{label}{name ? ` · ${name}` : ''}</div>
      <img src={imageSrc} alt={label} className="compare-thumb" />
      <div className="compare-grade">{formatGrade(grade.grade)}</div>
      <div className="compare-metrics">
        <div className="compare-metric-row">
          <span className="compare-metric-label">L | R{layout && ' (adj)'}</span>
          <span className="compare-metric-value">
            {formatPct(splits.leftRight.left)} | {formatPct(splits.leftRight.right)}
          </span>
        </div>
        <div className="compare-metric-row">
          <span className="compare-metric-label">T | B{layout && ' (adj)'}</span>
          <span className="compare-metric-value">
            {formatPct(splits.topBottom.top)} | {formatPct(splits.topBottom.bottom)}
          </span>
        </div>
      </div>
      <div className="compare-mm-grid" aria-label="Border measurements in millimetres">
        <div className="compare-mm-cell">
          <span className="compare-mm-label">Left</span>
          <span className="compare-mm-value">{result.bordersMm.left.toFixed(2)} mm</span>
        </div>
        <div className="compare-mm-cell">
          <span className="compare-mm-label">Right</span>
          <span className="compare-mm-value">{result.bordersMm.right.toFixed(2)} mm</span>
        </div>
        <div className="compare-mm-cell">
          <span className="compare-mm-label">Top</span>
          <span className="compare-mm-value">{result.bordersMm.top.toFixed(2)} mm</span>
        </div>
        <div className="compare-mm-cell">
          <span className="compare-mm-label">Bottom</span>
          <span className="compare-mm-value">{result.bordersMm.bottom.toFixed(2)} mm</span>
        </div>
      </div>
      {layout && (
        <div className="compare-detail">
          {layout.label}: raw T|B {formatPct(result.topBottom.top)} | {formatPct(result.topBottom.bottom)}, L|R{' '}
          {formatPct(result.leftRight.left)} | {formatPct(result.leftRight.right)}
        </div>
      )}
      <div className="compare-detail">
        Qualify {grade.worstQualify.toFixed(2)} · {grade.worstAxis === 'left-right' ? 'L/R' : 'T/B'}
      </div>
      <button type="button" className="btn btn-secondary btn-small" onClick={onEdit}>
        Edit
      </button>
    </div>
  );
}

export function CompareView({
  session,
  onEdit,
  onClose,
  onSaveToLibrary,
  onLibrary,
  onViewCards,
  libraryMessage,
}: CompareViewProps) {
  const [showExport, setShowExport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
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
        <div className="compare-header-actions">
          {onViewCards && (
            <button type="button" className="btn btn-secondary btn-small" onClick={onViewCards}>
              Cards
            </button>
          )}
          {onLibrary && (
            <button type="button" className="btn btn-secondary btn-small" onClick={onLibrary}>
              Library
            </button>
          )}
          {onSaveToLibrary && exportImages.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary btn-small"
              disabled={saving}
              onClick={() => {
                setSaving(true);
                setSaveError(null);
                onSaveToLibrary()
                  .catch((err) => setSaveError(libraryErrorMessage(err)))
                  .finally(() => setSaving(false));
              }}
            >
              {saving ? 'Saving…' : 'Save to library'}
            </button>
          )}
          {exportImages.length > 0 && (
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setShowExport(true)}>
              Export
            </button>
          )}
        </div>
      </div>

      {libraryMessage && <div className="library-toast">{libraryMessage}</div>}
      {saveError && <div className="save-error" role="alert">{saveError}</div>}

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
