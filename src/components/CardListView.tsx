import { useState, useEffect } from 'react';
import type { SubmissionFolder } from '../lib/folder-submission';
import * as api from '../lib/api-client';

interface Card {
  cardNumber: number;
  frontUrl?: string | null;
  backUrl?: string | null;
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
          {cards.map(card => (
            <div key={card.cardNumber} className="card-list-item">
              {(card.frontUrl || card.backUrl) && (
                <div className="card-list-thumbnail">
                  <img
                    src={(card.frontUrl || card.backUrl) as string}
                    alt={`Card ${card.cardNumber}`}
                  />
                </div>
              )}
              <div className="card-list-number">Card {card.cardNumber}</div>
              <button
                type="button"
                className="btn btn-danger btn-small"
                onClick={() => handleDelete(card.cardNumber)}
                disabled={deleting === card.cardNumber}
              >
                {deleting === card.cardNumber ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
