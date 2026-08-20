import { useState, useEffect } from 'react';
import * as api from '../lib/api-client';
import type { Card } from '../lib/api-client';
import { listSubmissionHandles } from '../lib/submission-persistence';
import { CardEditorModal } from './CardEditorModal';

interface SubmissionWithCards {
  id: string;
  name: string;
  type: 'api' | 'zip';
  cards: Card[];
}

function extractGradeNumber(grade: string | null | undefined): number | null {
  if (!grade) return null;
  const match = grade.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

function getWorstGrade(frontGrade: string | null | undefined, backGrade: string | null | undefined): string | null {
  const frontNum = extractGradeNumber(frontGrade);
  const backNum = extractGradeNumber(backGrade);

  if (frontNum === null && backNum === null) return null;
  if (frontNum === null) return (backGrade as string | null) || null;
  if (backNum === null) return (frontGrade as string | null) || null;

  return frontNum <= backNum ? (frontGrade as string) : (backGrade as string);
}

export function ImageGalleryView({ onClose, onEditImage }: { onClose: () => void; onEditImage?: (submissionId: string, card: Card, side: 'front' | 'back') => void }) {
  const [submissions, setSubmissions] = useState<SubmissionWithCards[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<{ submissionId: string; card: Card } | null>(null);
  const [expandedSubmissions, setExpandedSubmissions] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadSubmissions();
  }, []);

  async function loadSubmissions() {
    try {
      const handles = await listSubmissionHandles();
      const submissionsData: SubmissionWithCards[] = [];

      for (const handle of handles) {
        try {
          const submission = await api.getSubmission(handle.id);
          const cards = await api.listCards(handle.id);

          submissionsData.push({
            id: handle.id,
            name: submission?.name || handle.name,
            type: 'api',
            cards,
          });
        } catch (err) {
          console.warn('Failed to load submission:', handle.id, err);
        }
      }

      setSubmissions(submissionsData);
    } catch (err) {
      console.error('Failed to load submissions:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleExportSubmission(submissionId: string) {
    setExporting(submissionId);
    try {
      await api.exportSubmissionZip(submissionId);
    } catch (err) {
      console.error('Failed to export submission:', err);
    } finally {
      setExporting(null);
    }
  }

  function toggleSubmissionExpanded(submissionId: string) {
    setExpandedSubmissions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(submissionId)) {
        newSet.delete(submissionId);
      } else {
        newSet.add(submissionId);
      }
      return newSet;
    });
  }

  if (loading) {
    return (
      <div className="gallery-view">
        <div className="gallery-header">
          <button type="button" className="btn btn-secondary btn-small" onClick={onClose}>
            ← Back
          </button>
          <h2>Card Images</h2>
        </div>
        <p className="gallery-empty">Loading images…</p>
      </div>
    );
  }

  return (
    <div className="gallery-view">
      <div className="gallery-header">
        <button type="button" className="btn btn-secondary btn-small" onClick={onClose}>
          ← Back
        </button>
        <h2>Card Images</h2>
      </div>

      {submissions.length === 0 ? (
        <p className="gallery-empty">No submissions with images yet.</p>
      ) : (
        <div className="gallery-submissions">
          {submissions.map((submission) => {
            const isExpanded = expandedSubmissions.has(submission.id);
            return (
              <div key={submission.id} className="gallery-submission">
                <div className="gallery-submission-header">
                  <button
                    type="button"
                    className="gallery-submission-toggle"
                    onClick={() => toggleSubmissionExpanded(submission.id)}
                  >
                    <span className="toggle-icon">{isExpanded ? '▼' : '▶'}</span>
                    <h3>{submission.name}</h3>
                    <span className="card-count">({submission.cards.length})</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    disabled={exporting === submission.id}
                    onClick={() => handleExportSubmission(submission.id)}
                  >
                    {exporting === submission.id ? 'Exporting…' : 'Export ZIP'}
                  </button>
                </div>

                {isExpanded && (
                  <div className="gallery-grid">
                {submission.cards.length === 0 ? (
                  <p className="gallery-empty-submission">No images in this submission</p>
                ) : (
                  submission.cards.map((card) => {
                    const worstGrade = getWorstGrade(card.front_grade, card.back_grade);
                    return (
                      <div
                        key={card.card_number}
                        className="gallery-card"
                        onClick={() => setEditingCard({ submissionId: submission.id, card })}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="gallery-card-header">
                          <div className="gallery-card-title">Card {card.card_number} - {worstGrade || '—'}</div>
                        </div>

                        <div className="gallery-card-images">
                          {card.front_s3_url || card.back_s3_url ? (
                            <>
                              {card.front_s3_url && (
                                <div className="gallery-card-image">
                                  <img
                                    src={card.front_s3_url}
                                    alt={`Card ${card.card_number} - Front`}
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                </div>
                              )}
                              {card.back_s3_url && (
                                <div className="gallery-card-image">
                                  <img
                                    src={card.back_s3_url}
                                    alt={`Card ${card.card_number} - Back`}
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                </div>
                              )}
                            </>
                          ) : (
                            <p className="gallery-no-images">No images</p>
                          )}
                        </div>

                        <div className="gallery-card-grades">
                          <div className="gallery-card-grade">
                            <span className="grade-label">Front</span>
                            <span className="grade-value">{card.front_grade || '—'}</span>
                          </div>
                          <div className="gallery-card-grade">
                            <span className="grade-label">Back</span>
                            <span className="grade-value">{card.back_grade || '—'}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editingCard && (
        <CardEditorModal
          card={editingCard.card}
          submissionId={editingCard.submissionId}
          onClose={() => setEditingCard(null)}
          onEditImage={onEditImage && ((submissionId: string, card: Card, side: 'front' | 'back') => onEditImage(submissionId, card, side))}
        />
      )}
    </div>
  );
}
