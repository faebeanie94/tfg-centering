import { useState, useEffect } from 'react';
import type { Card } from '../lib/api-client';
import * as api from '../lib/api-client';

interface CardEditorModalProps {
  card: Card;
  submissionId: string;
  onClose: () => void;
  onSave: (updatedCard: Card) => void;
  onEditImage?: (submissionId: string, card: Card, side: 'front' | 'back') => void;
}

export function CardEditorModal({ card, submissionId, onClose, onSave, onEditImage }: CardEditorModalProps) {
  const [frontGrade, setFrontGrade] = useState(card.front_grade || '');
  const [backGrade, setBackGrade] = useState(card.back_grade || '');
  const [condition, setCondition] = useState(card.condition || '');
  const [notes, setNotes] = useState(card.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!card.front_grade && !card.back_grade);

  // Fetch full card data on mount to ensure grades are loaded
  useEffect(() => {
    if (!loading) return;

    api.getCard(submissionId, card.card_number)
      .then(fullCard => {
        setFrontGrade(fullCard.front_grade || '');
        setBackGrade(fullCard.back_grade || '');
        setCondition(fullCard.condition || '');
        setNotes(fullCard.notes || '');
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load card details:', err);
        setLoading(false);
      });
  }, [card.card_number, submissionId, loading]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updatedCard = await api.updateCard(submissionId, card.card_number, {
        frontGrade: frontGrade || undefined,
        backGrade: backGrade || undefined,
        condition: condition || undefined,
        notes: notes || undefined,
      });
      onSave(updatedCard);
    } catch (err) {
      setError('Failed to save card');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit Card {card.card_number}</h2>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-content">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label htmlFor="front-grade">Front Grade</label>
            <input
              id="front-grade"
              type="text"
              value={frontGrade}
              onChange={(e) => setFrontGrade(e.target.value)}
              placeholder="e.g., 9, PSA 10"
            />
          </div>

          <div className="form-group">
            <label htmlFor="back-grade">Back Grade</label>
            <input
              id="back-grade"
              type="text"
              value={backGrade}
              onChange={(e) => setBackGrade(e.target.value)}
              placeholder="e.g., 9, PSA 10"
            />
          </div>

          <div className="form-group">
            <label htmlFor="condition">Condition</label>
            <input
              id="condition"
              type="text"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              placeholder="e.g., Mint, Near Mint"
            />
          </div>

          <div className="form-group">
            <label htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes..."
              rows={3}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
          {onEditImage && (
            <div className="button-group">
              {card.front_s3_url && (
                <button type="button" className="btn btn-secondary" onClick={() => { onEditImage(submissionId, card, 'front'); }}>
                  Edit Front
                </button>
              )}
              {card.back_s3_url && (
                <button type="button" className="btn btn-secondary" onClick={() => { onEditImage(submissionId, card, 'back'); }}>
                  Edit Back
                </button>
              )}
            </div>
          )}
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
