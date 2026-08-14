import { useState } from 'react';
import type { SavedCardRecord } from '../lib/saved-cards';
import { exportAllSessions, exportSessionImages } from '../lib/export-image';
import { formatGrade, limitingGrade } from '../lib/session';

interface SavedCardsViewProps {
  cards: SavedCardRecord[];
  loading: boolean;
  onClose: () => void;
  onOpen: (record: SavedCardRecord) => void;
  onDelete: (id: string) => Promise<void>;
}

function formatWhen(savedAt: number): string {
  return new Date(savedAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function gradeSummary(record: SavedCardRecord): string {
  const limit = limitingGrade(record.session);
  if (limit) return formatGrade(limit.grade);
  if (record.session.front) return formatGrade(record.session.front.grade.grade);
  if (record.session.back) return formatGrade(record.session.back.grade.grade);
  return '—';
}

function thumbSrc(record: SavedCardRecord): string | null {
  return record.session.front?.imageSrc ?? record.session.back?.imageSrc ?? null;
}

export function SavedCardsView({ cards, loading, onClose, onOpen, onDelete }: SavedCardsViewProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function runExport(action: () => Promise<void | 'shared' | 'downloaded'>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      if (result === 'shared') setMessage('Share sheet opened — Save Image or Save to Files');
      else setMessage(success);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setMessage('Export failed — try again');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    setMessage(null);
    try {
      await onDelete(id);
      setConfirmDeleteId(null);
      setMessage('Removed from library');
    } catch {
      setMessage('Could not delete — try again');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="library">
      <div className="library-header">
        <button type="button" className="btn btn-secondary btn-small" onClick={onClose} disabled={busy}>
          ← Back
        </button>
        <h2>Saved Cards</h2>
        {cards.length > 0 && (
          <button
            type="button"
            className="btn btn-secondary btn-small"
            disabled={busy}
            onClick={() =>
              runExport(
                async () => {
                  await exportAllSessions(cards.map((c) => c.session));
                },
                `Exported ${cards.length} card${cards.length === 1 ? '' : 's'}`,
              )
            }
          >
            Export all
          </button>
        )}
      </div>

      {message && <div className="library-feedback">{message}</div>}

      {loading ? (
        <p className="library-empty">Loading saved cards…</p>
      ) : cards.length === 0 ? (
        <div className="library-empty">
          <p>No saved cards yet.</p>
          <p className="library-empty-hint">
            Grade a card, then use <strong>Save to library</strong> on the compare screen or card menu.
          </p>
        </div>
      ) : (
        <ul className="library-list">
          {cards.map((record) => {
            const thumb = thumbSrc(record);
            const sides = [record.session.front ? 'Front' : null, record.session.back ? 'Back' : null]
              .filter(Boolean)
              .join(' · ');

            return (
              <li key={record.id} className="library-item">
                <button type="button" className="library-item-main" onClick={() => onOpen(record)} disabled={busy}>
                  {thumb ? (
                    <img src={thumb} alt="" className="library-thumb" />
                  ) : (
                    <div className="library-thumb library-thumb-empty">?</div>
                  )}
                  <div className="library-item-body">
                    <div className="library-item-title">{record.label}</div>
                    <div className="library-item-meta">
                      <span className="library-grade">{gradeSummary(record)}</span>
                      <span>{sides}</span>
                    </div>
                    <div className="library-item-date">{formatWhen(record.savedAt)}</div>
                  </div>
                </button>

                <div className="library-item-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    disabled={busy}
                    onClick={() =>
                      runExport(
                        () => exportSessionImages(record.session),
                        `Exported ${record.label}`,
                      )
                    }
                  >
                    Export
                  </button>
                  {confirmDeleteId === record.id ? (
                    <div className="library-delete-confirm">
                      <button
                        type="button"
                        className="btn btn-danger btn-small"
                        disabled={busy}
                        onClick={() => void handleDelete(record.id)}
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        disabled={busy}
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-secondary btn-small library-delete-btn"
                      disabled={busy}
                      onClick={() => setConfirmDeleteId(record.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
