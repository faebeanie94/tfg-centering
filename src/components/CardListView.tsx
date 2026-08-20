import { useState, useEffect } from 'react';
import type { SubmissionFolder } from '../lib/folder-submission';
import * as api from '../lib/api-client';

interface Card {
  cardNumber: number;
  frontUrl?: string | null;
  backUrl?: string | null;
  frontGrade?: string | null;
  backGrade?: string | null;
}

function getOverallGrade(card: Card): string {
  // Prefer the limiting grade (lower grade)
  const grades = [card.frontGrade, card.backGrade].filter(Boolean) as string[];
  if (grades.length === 0) return '—';
  if (grades.length === 1) return grades[0];
  // Simple comparison - assume grades are formatted the same way
  return grades.sort()[0]; // This sorts alphabetically; adjust if needed for numeric grades
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
        <button type="button" className="btn btn-secondary btn-small" onClick={onClose}>
          ← Back
        </button>
        <h2>Cards in Submission ({cards.length})</h2>
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
