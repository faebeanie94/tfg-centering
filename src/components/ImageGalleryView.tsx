import { useState, useEffect } from 'react';
import * as api from '../lib/api-client';
import type { Card } from '../lib/api-client';
import { listSubmissionHandles } from '../lib/submission-persistence';
import { CardEditorModal } from './CardEditorModal';

interface SubmissionWithCards {
  id: string;
  name: string;
  type: 'api' | 'zip';
  completed: boolean;
  cards: Card[];
}

type GalleryFilter = 'in-progress' | 'completed';

const FILTER_KEY = 'tfg-library-filter';

function loadFilter(): GalleryFilter {
  try {
    return localStorage.getItem(FILTER_KEY) === 'completed' ? 'completed' : 'in-progress';
  } catch {
    return 'in-progress';
  }
}

function storeFilter(filter: GalleryFilter): void {
  try {
    localStorage.setItem(FILTER_KEY, filter);
  } catch {
    // The tab still switches for this visit if storage is unavailable.
  }
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
  const gradeValue = (g: string) => parseFloat(g.replace(/[^\d.]/g, ''));
  return grades.sort((a, b) => gradeValue(a) - gradeValue(b))[0];
}

export function ImageGalleryView({ onClose, onEditImage }: { onClose: () => void; onEditImage?: (submissionId: string, card: Card, side: 'front' | 'back') => void }) {
  const [submissions, setSubmissions] = useState<SubmissionWithCards[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<{ submissionId: string; card: Card } | null>(null);
  const [expandedSubmissions, setExpandedSubmissions] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<GalleryFilter>(loadFilter);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const completedSubmissions = submissions.filter((s) => s.completed);
  const inProgressSubmissions = submissions.filter((s) => !s.completed);
  const visibleSubmissions = filter === 'completed' ? completedSubmissions : inProgressSubmissions;

  function changeFilter(next: GalleryFilter) {
    setFilter(next);
    storeFilter(next);
  }

  async function handleToggleCompleted(submission: SubmissionWithCards) {
    setTogglingId(submission.id);
    try {
      const updated = await api.setSubmissionCompleted(submission.id, !submission.completed);
      setSubmissions((prev) =>
        prev.map((s) => (s.id === submission.id ? { ...s, completed: Boolean(updated.completed_at) } : s)),
      );
    } catch (err) {
      console.error('Failed to update submission status:', err);
    } finally {
      setTogglingId(null);
    }
  }

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
            completed: Boolean(submission?.completed_at),
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

      {submissions.length > 0 && (
        <div className="library-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'in-progress'}
            className={`library-tab${filter === 'in-progress' ? ' is-active' : ''}`}
            onClick={() => changeFilter('in-progress')}
          >
            In progress <span className="library-tab-count">{inProgressSubmissions.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'completed'}
            className={`library-tab${filter === 'completed' ? ' is-active' : ''}`}
            onClick={() => changeFilter('completed')}
          >
            Completed <span className="library-tab-count">{completedSubmissions.length}</span>
          </button>
        </div>
      )}

      {submissions.length === 0 ? (
        <p className="card-list-empty">No submissions with images yet.</p>
      ) : visibleSubmissions.length === 0 ? (
        <p className="card-list-empty">
          {filter === 'completed'
            ? 'No completed submissions yet. Use Mark complete on a submission to move it here.'
            : 'Every submission is marked complete.'}
        </p>
      ) : (
        <div className="gallery-submissions">
          {visibleSubmissions.map((submission) => {
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
                    disabled={togglingId === submission.id}
                    onClick={() => void handleToggleCompleted(submission)}
                  >
                    {submission.completed ? 'Reopen' : 'Mark complete'}
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
                          <div
                            key={card.card_number}
                            className="card-list-item"
                            onClick={() => setEditingCard({ submissionId: submission.id, card })}
                            role="button"
                            tabIndex={0}
                          >
                            <div className="card-list-header-row">
                              <div className="card-list-title">Card {card.card_number} - {overallGrade}</div>
                            </div>

                            <div className="card-list-images">
                              {card.front_image_url && (
                                <div className="card-list-image">
                                  <img
                                    src={card.front_image_url}
                                    alt={`Card ${card.card_number} - Front`}
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                </div>
                              )}
                              {card.back_image_url && (
                                <div className="card-list-image">
                                  <img
                                    src={card.back_image_url}
                                    alt={`Card ${card.card_number} - Back`}
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                </div>
                              )}
                              {!card.front_image_url && !card.back_image_url && (
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
                                      T: {formatMm(card.front_top_mm)} | B: {formatMm(card.front_bottom_mm)} | L: {formatMm(card.front_left_mm)} | R: {formatMm(card.front_right_mm)}
                                    </span>
                                  </div>
                                )}
                                {(card.back_left_mm !== null && card.back_left_mm !== undefined) && (
                                  <div className="card-list-measurement-side">
                                    <span className="card-list-measurement-label">Back</span>
                                    <span className="card-list-measurement-values">
                                      T: {formatMm(card.back_top_mm)} | B: {formatMm(card.back_bottom_mm)} | L: {formatMm(card.back_left_mm)} | R: {formatMm(card.back_right_mm)}
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
