import { useState, useEffect } from 'react';
import type { SubmissionFolder } from '../lib/folder-submission';
import * as api from '../lib/api-client';

interface Card {
  cardNumber: number;
  frontUrl?: string | null;
  backUrl?: string | null;
  frontGrade?: string | null;
  backGrade?: string | null;
  frontLeftMm?: number | null;
  frontRightMm?: number | null;
  frontTopMm?: number | null;
  frontBottomMm?: number | null;
  backLeftMm?: number | null;
  backRightMm?: number | null;
  backTopMm?: number | null;
  backBottomMm?: number | null;
}

function getOverallGrade(card: Card): string {
  // Prefer the limiting grade (lower grade)
  const grades = [card.frontGrade, card.backGrade].filter(Boolean) as string[];
  if (grades.length === 0) return '—';
  if (grades.length === 1) return grades[0];
  // Sort numerically to get the lower grade (TFG 9 < TFG 10)
  return grades.sort((a, b) => parseFloat(a) - parseFloat(b))[0];
}

function CenteringMeasurements({ card }: { card: Card }) {
  const hasFrontMeasurements = card.frontLeftMm !== null && card.frontLeftMm !== undefined;
  const hasBackMeasurements = card.backLeftMm !== null && card.backLeftMm !== undefined;

  if (!hasFrontMeasurements && !hasBackMeasurements) {
    return null;
  }

  return (
    <div className="card-list-centering">
      {hasFrontMeasurements && (
        <div className="centering-side">
          <span className="centering-label">Front</span>
          <div className="centering-values">
            <span title="Left">L: {card.frontLeftMm?.toFixed(2) || '—'}</span>
            <span title="Right">R: {card.frontRightMm?.toFixed(2) || '—'}</span>
            <span title="Top">T: {card.frontTopMm?.toFixed(2) || '—'}</span>
            <span title="Bottom">B: {card.frontBottomMm?.toFixed(2) || '—'}</span>
          </div>
        </div>
      )}
      {hasBackMeasurements && (
        <div className="centering-side">
          <span className="centering-label">Back</span>
          <div className="centering-values">
            <span title="Left">L: {card.backLeftMm?.toFixed(2) || '—'}</span>
            <span title="Right">R: {card.backRightMm?.toFixed(2) || '—'}</span>
            <span title="Top">T: {card.backTopMm?.toFixed(2) || '—'}</span>
            <span title="Bottom">B: {card.backBottomMm?.toFixed(2) || '—'}</span>
          </div>
        </div>
      )}
    </div>
  );
}

interface CardListViewProps {
  submission: SubmissionFolder;
  onClose: () => void;
  onCardDeleted: () => void;
}

export function CardListView({ submission, onClose, onCardDeleted }: CardListViewProps) {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (submission.type === 'api') {
      api.listCards(submission.submissionId)
        .then(cardList => {
          setCards(
            cardList
              .map(c => ({
                cardNumber: c.card_number,
                frontUrl: c.front_s3_url,
                backUrl: c.back_s3_url,
                frontGrade: c.front_grade,
                backGrade: c.back_grade,
                frontLeftMm: c.front_left_mm,
                frontRightMm: c.front_right_mm,
                frontTopMm: c.front_top_mm,
                frontBottomMm: c.front_bottom_mm,
                backLeftMm: c.back_left_mm,
                backRightMm: c.back_right_mm,
                backTopMm: c.back_top_mm,
                backBottomMm: c.back_bottom_mm,
              }))
              .sort((a, b) => a.cardNumber - b.cardNumber)
          );
          setLoading(false);
        })
        .catch(err => {
          console.error('Failed to load cards:', err);
          setLoading(false);
          setMessage('Failed to load cards');
        });
    }
  }, [submission]);

  const handleDelete = async (cardNumber: number) => {
    if (!confirm(`Delete card ${cardNumber}?`)) return;

    setDeleting(cardNumber);
    setMessage(null);
    try {
      if (submission.type === 'api') {
        await api.deleteCard(submission.submissionId, cardNumber);
        setCards(cards.filter(c => c.cardNumber !== cardNumber));
        setMessage(`Deleted card ${cardNumber}`);
        // Reset submission state for proper gap-filling on next capture
        submission.lastSideSaved = null;
        submission.lastCardNumberUsed = null;
        onCardDeleted();
      }
    } catch (err) {
      setMessage(`Failed to delete card ${cardNumber}`);
    } finally {
      setDeleting(null);
    }
  };

  const handleExport = async () => {
    if (submission.type !== 'api') return;

    setExporting(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/submissions/${submission.submissionId}/export`);
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const fileName = response.headers.get('content-disposition')?.split('filename="')[1]?.split('"')[0] || 'submission.zip';

      // Use Web API for download when possible, share sheet on mobile
      if (navigator.share && /iPhone|iPad|Android/.test(navigator.userAgent)) {
        try {
          const file = new File([blob], fileName, { type: 'application/zip' });
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: 'TFG submission' });
            setMessage('Share sheet opened — Save to Files');
            return;
          }
        } catch (err) {
          if ((err as Error).name !== 'AbortError') {
            // Fall through to download
          } else {
            setMessage('Export cancelled');
            return;
          }
        }
      }

      // Download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMessage(`Saved ${fileName}`);
    } catch (err) {
      setMessage('Export failed — try again');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="card-list">
        <div className="card-list-header">
          <button type="button" className="btn btn-secondary btn-small" onClick={onClose}>
            ← Back
          </button>
          <h2>Cards in Submission</h2>
        </div>
        <p>Loading cards...</p>
      </div>
    );
  }

  return (
    <div className="card-list">
      <div className="card-list-header">
        <button type="button" className="btn btn-secondary btn-small" onClick={onClose} disabled={exporting}>
          ← Back
        </button>
        <h2>Cards in Submission ({cards.length})</h2>
        {cards.length > 0 && (
          <button
            type="button"
            className="btn btn-secondary btn-small"
            disabled={exporting}
            onClick={() => void handleExport()}
            title="Download submission as .zip with all card images"
          >
            {exporting ? 'Exporting...' : 'Export ZIP'}
          </button>
        )}
      </div>

      {message && <div className="card-list-message">{message}</div>}

      {cards.length === 0 ? (
        <p className="card-list-empty">No cards in this submission</p>
      ) : (
        <div className="card-list-grid">
          {cards.map(card => {
            const overallGrade = getOverallGrade(card);
            return (
              <div key={card.cardNumber} className="card-list-item">
                <div className="card-list-header-row">
                  <div className="card-list-title">Card {card.cardNumber} - {overallGrade}</div>
                </div>

                <div className="card-list-images">
                  {card.frontUrl && (
                    <div className="card-list-image">
                      <img
                        src={card.frontUrl}
                        alt={`Card ${card.cardNumber} - Front`}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                  {card.backUrl && (
                    <div className="card-list-image">
                      <img
                        src={card.backUrl}
                        alt={`Card ${card.cardNumber} - Back`}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                  {!card.frontUrl && !card.backUrl && (
                    <p className="card-list-no-images">No images</p>
                  )}
                </div>

                <div className="card-list-grades">
                  <div className="card-list-grade">
                    <span className="grade-label">Front</span>
                    <span className="grade-value">{card.frontGrade || '—'}</span>
                  </div>
                  <div className="card-list-grade">
                    <span className="grade-label">Back</span>
                    <span className="grade-value">{card.backGrade || '—'}</span>
                  </div>
                </div>

                <CenteringMeasurements card={card} />

                <button
                  type="button"
                  className="btn btn-danger btn-small"
                  onClick={() => handleDelete(card.cardNumber)}
                  disabled={deleting === card.cardNumber}
                >
                  {deleting === card.cardNumber ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
