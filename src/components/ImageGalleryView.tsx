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

export function ImageGalleryView({ onClose }: { onClose: () => void }) {
  const [submissions, setSubmissions] = useState<SubmissionWithCards[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<{ submissionId: string; card: Card } | null>(null);

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
          {submissions.map((submission) => (
            <div key={submission.id} className="gallery-submission">
              <div className="gallery-submission-header">
                <h3>{submission.name}</h3>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  disabled={exporting === submission.id}
                  onClick={() => handleExportSubmission(submission.id)}
                >
                  {exporting === submission.id ? 'Exporting…' : 'Export ZIP'}
                </button>
              </div>

              <div className="gallery-grid">
                {submission.cards.length === 0 ? (
                  <p className="gallery-empty-submission">No images in this submission</p>
                ) : (
                  submission.cards.map((card) => (
                    <div
                      key={card.card_number}
                      className="gallery-card"
                      onClick={() => setEditingCard({ submissionId: submission.id, card })}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="gallery-card-number">Card {card.card_number}</div>
                      <div className="gallery-images">
                        {card.front_s3_url && (
                          <img
                            src={card.front_s3_url}
                            alt={`Card ${card.card_number} - Front`}
                            className="gallery-image"
                          />
                        )}
                        {card.back_s3_url && (
                          <img
                            src={card.back_s3_url}
                            alt={`Card ${card.card_number} - Back`}
                            className="gallery-image"
                          />
                        )}
                        {!card.front_s3_url && !card.back_s3_url && (
                          <p className="gallery-no-image">No images</p>
                        )}
                      </div>
                      {(card.front_grade || card.back_grade || card.condition) && (
                        <div className="gallery-card-metadata">
                          {card.front_grade && <span className="grade-badge">F: {card.front_grade}</span>}
                          {card.back_grade && <span className="grade-badge">B: {card.back_grade}</span>}
                          {card.condition && <span className="condition-badge">{card.condition}</span>}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editingCard && (
        <CardEditorModal
          card={editingCard.card}
          submissionId={editingCard.submissionId}
          onClose={() => setEditingCard(null)}
          onSave={(updatedCard) => {
            setSubmissions(
              submissions.map((sub) =>
                sub.id === editingCard.submissionId
                  ? {
                      ...sub,
                      cards: sub.cards.map((c) =>
                        c.card_number === updatedCard.card_number ? updatedCard : c
                      ),
                    }
                  : sub
              )
            );
            setEditingCard(null);
          }}
          onEditImage={() => {
            // TODO: Load card image and open the crop/border editing workflow
            console.log('Edit image for card:', editingCard.card.card_number);
          }}
        />
      )}
    </div>
  );
}
