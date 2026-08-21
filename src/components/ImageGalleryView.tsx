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

function formatMm(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(num) ? '—' : num.toFixed(2);
}

function getOverallGrade(frontGrade: string | null | undefined, backGrade: string | null | undefined): string {
  const grades = [frontGrade, backGrade].filter(Boolean) as string[];
  if (grades.length === 0) return '—';
  if (grades.length === 1) return grades[0];
  return grades.sort((a, b) => parseFloat(a) - parseFloat(b))[0];
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
    <div className="card-list">
      <div className="card-list-header">
        <button type="button" className="btn btn-secondary btn-small" onClick={onClose} disabled={exporting !== null}>
          ← Back
        </button>
        <h2>Card Images</h2>
      </div>

      {submissions.length === 0 ? (
        <p className="card-list-empty">No submissions with images yet.</p>
      ) : (
        <div className="gallery-submissions">
          {submissions.map((submission) => {
            const isExpanded = expandedSubmissions.has(submission.id);
            return (
              <div key={submission.id}>
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
                  <div className="card-list-grid">
                    {submission.cards.length === 0 ? (
                      <p className="card-list-empty">No images in this submission</p>
                    ) : (
                      submission.cards.map((card) => {
                        const overallGrade = getOverallGrade(card.front_grade, card.back_grade);
                        return (
                          <div key={card.card_number} className="card-list-item">
                            <div className="card-list-header-row">
                              <div className="card-list-title">Card {card.card_number} - {overallGrade}</div>
                            </div>

                            <div className="card-list-images">
                              {card.front_s3_url && (
                                <div className="card-list-image">
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
                                <div className="card-list-image">
                                  <img
                                    src={card.back_s3_url}
                                    alt={`Card ${card.card_number} - Back`}
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                </div>
                              )}
                              {!card.front_s3_url && !card.back_s3_url && (
                                <p className="card-list-no-images">No images</p>
                              )}
                            </div>

                            <div className="card-list-grades">
                              <div className="card-list-grade">
                                <span className="grade-label">Front</span>
                                <span className="grade-value">{card.front_grade || '—'}</span>
                              </div>
                              <div className="card-list-grade">
                                <span className="grade-label">Back</span>
                                <span className="grade-value">{card.back_grade || '—'}</span>
                              </div>
                            </div>

                            {((card.front_left_mm !== null && card.front_left_mm !== undefined) ||
                              (card.back_left_mm !== null && card.back_left_mm !== undefined)) && (
                              <div className="card-list-measurements-section">
                                {(card.front_left_mm !== null && card.front_left_mm !== undefined) && (
                                  <div className="card-list-measurement-side">
                                    <span className="card-list-measurement-label">Front</span>
                                    <span className="card-list-measurement-values">
                                      L: {formatMm(card.front_left_mm)} | R: {formatMm(card.front_right_mm)} | T: {formatMm(card.front_top_mm)} | B: {formatMm(card.front_bottom_mm)}
                                    </span>
                                  </div>
                                )}
                                {(card.back_left_mm !== null && card.back_left_mm !== undefined) && (
                                  <div className="card-list-measurement-side">
                                    <span className="card-list-measurement-label">Back</span>
                                    <span className="card-list-measurement-values">
                                      L: {formatMm(card.back_left_mm)} | R: {formatMm(card.back_right_mm)} | T: {formatMm(card.back_top_mm)} | B: {formatMm(card.back_bottom_mm)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
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
