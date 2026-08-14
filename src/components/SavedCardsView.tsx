import { useMemo, useState } from 'react';
import type { SavedCardRecord } from '../lib/saved-cards';
import { exportSessionImages } from '../lib/export-image';
import { exportLibraryZip, groupSavedCards, type ArchiveProgress } from '../lib/export-library';
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

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function SavedCardsView({ cards, loading, onClose, onOpen, onDelete }: SavedCardsViewProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<ArchiveProgress | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const groups = useMemo(() => groupSavedCards(cards), [cards]);
  const hasGroups = groups.some((group) => group.key);

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

  async function handleExportZip(records: SavedCardRecord[], what: string) {
    setBusy(true);
    setMessage(null);
    setProgress({ done: 0, total: records.length });
    try {
      const archive = await exportLibraryZip(records, setProgress);
      setMessage(
        archive.result === 'shared'
          ? `Share sheet opened for ${what} — choose Save to Files`
          : `Saved ${archive.filename} — ${plural(archive.cardCount, 'card')}, ${plural(archive.imageCount, 'image')}`,
      );
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setMessage('ZIP export failed — try again');
    } finally {
      setBusy(false);
      setProgress(null);
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

  function renderCard(record: SavedCardRecord) {
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
            onClick={() => runExport(() => exportSessionImages(record.session), `Exported ${record.label}`)}
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
            onClick={() => void handleExportZip(cards, 'the library')}
            title="Download every saved card as one .zip, grouped by card name"
          >
            {hasGroups ? 'Export all (ZIP)' : 'Export ZIP'}
          </button>
        )}
      </div>

      {progress ? (
        <div className="library-feedback library-feedback-progress">
          Building ZIP… {progress.done}/{progress.total} cards
        </div>
      ) : (
        message && <div className="library-feedback">{message}</div>
      )}

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
        groups.map((group) => (
          <section key={group.key || 'ungrouped'} className="library-group">
            {(group.key || hasGroups) && (
              <div className="library-group-header">
                <div className="library-group-title">
                  <span className="library-group-name">{group.label}</span>
                  <span className="library-group-count">{plural(group.cards.length, 'card')}</span>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  disabled={busy}
                  onClick={() => void handleExportZip(group.cards, group.label)}
                  title={`Download ${group.label} as one .zip`}
                >
                  Export ZIP
                </button>
              </div>
            )}
            <ul className="library-list">{group.cards.map(renderCard)}</ul>
          </section>
        ))
      )}
    </div>
  );
}
