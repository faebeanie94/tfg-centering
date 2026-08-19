import { useState, useEffect } from 'react';
import * as api from '../lib/api-client';
import { listSubmissionHandles } from '../lib/submission-persistence';

interface SubmissionWithCards {
  id: string;
  name: string;
  type: 'api' | 'zip';
  cards: Array<{ cardNumber: number; frontUrl?: string | null; backUrl?: string | null }>;
}

export function ImageGalleryView({ onClose }: { onClose: () => void }) {
  const [submissions, setSubmissions] = useState<SubmissionWithCards[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

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
            cards: cards.map((card) => ({
              cardNumber: card.card_number,
              frontUrl: card.front_s3_url,
              backUrl: card.back_s3_url,
            })),
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
                    <div key={card.cardNumber} className="gallery-card">
                      <div className="gallery-card-number">Card {card.cardNumber}</div>
                      <div className="gallery-images">
                        {card.frontUrl && (
                          <img
                            src={card.frontUrl}
                            alt={`Card ${card.cardNumber} - Front`}
                            className="gallery-image"
                          />
                        )}
                        {card.backUrl && (
                          <img
                            src={card.backUrl}
                            alt={`Card ${card.cardNumber} - Back`}
                            className="gallery-image"
                          />
                        )}
                        {!card.frontUrl && !card.backUrl && (
                          <p className="gallery-no-image">No images</p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
