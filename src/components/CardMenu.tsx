import { useState } from 'react';
import type { CardSide } from '../lib/tfg-standards';
import { saveCleanImage, shareCleanImage, saveAllCleanImages } from '../lib/export-image';

interface CardMenuProps {
  open: boolean;
  side: CardSide;
  imageSrc: string;
  cardName: string;
  onNameChange: (name: string) => void;
  onCrop: () => void;
  onPerspectiveFix: () => void;
  onFlipSide: () => void;
  onResetLines: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function CardMenu({
  open,
  side,
  imageSrc,
  cardName,
  onNameChange,
  onCrop,
  onPerspectiveFix,
  onFlipSide,
  onResetLines,
  onDelete,
  onClose,
}: CardMenuProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showNameEdit, setShowNameEdit] = useState(false);
  const [nameDraft, setNameDraft] = useState(cardName);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!open) return null;

  const otherSide = side === 'front' ? 'back' : 'front';

  async function runExport(action: () => Promise<void | 'shared' | 'downloaded'>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      if (result === 'shared') setMessage('Shared successfully');
      else if (result === 'downloaded') setMessage('Saved to downloads');
      else setMessage(success);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setMessage('Action failed — try again');
    } finally {
      setBusy(false);
    }
  }

  function handleAction(fn: () => void) {
    onClose();
    fn();
  }

  function saveName() {
    onNameChange(nameDraft.trim());
    setShowNameEdit(false);
    setMessage('Card name updated');
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="action-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="action-sheet-header">
          <h2>Card Options</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {showNameEdit ? (
          <div className="name-edit">
            <label className="name-edit-label" htmlFor="card-name">Card name</label>
            <input
              id="card-name"
              className="name-edit-input"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="e.g. Umbreon SAR"
              autoFocus
            />
            <div className="name-edit-actions">
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setShowNameEdit(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary btn-small" onClick={saveName}>
                Save name
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="action-sheet-item"
              disabled={busy}
              onClick={() => {
                setNameDraft(cardName);
                setShowNameEdit(true);
              }}
            >
              <span className="action-icon">✎</span>
              <span>
                Edit card info
                {cardName && <span className="action-sub">{cardName}</span>}
              </span>
            </button>

            <button
              type="button"
              className="action-sheet-item"
              disabled={busy}
              onClick={() => handleAction(onCrop)}
            >
              <span className="action-icon">⬚</span>
              Crop image
            </button>

            <button
              type="button"
              className="action-sheet-item"
              disabled={busy}
              onClick={() => handleAction(onPerspectiveFix)}
            >
              <span className="action-icon">⊞</span>
              Perspective fix
            </button>

            <button
              type="button"
              className="action-sheet-item"
              disabled={busy}
              onClick={() => handleAction(onFlipSide)}
            >
              <span className="action-icon">⇄</span>
              Flip to {otherSide} side
            </button>

            <button
              type="button"
              className="action-sheet-item action-destructive"
              disabled={busy}
              onClick={() => {
                onResetLines();
                setMessage('Border lines reset');
              }}
            >
              <span className="action-icon">↺</span>
              Reset lines
            </button>

            {!confirmDelete ? (
              <button
                type="button"
                className="action-sheet-item action-destructive"
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
              >
                <span className="action-icon">🗑</span>
                Delete image
              </button>
            ) : (
              <div className="confirm-delete">
                <p>Delete this {side} image? This cannot be undone.</p>
                <div className="confirm-delete-actions">
                  <button type="button" className="btn btn-secondary btn-small" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-small"
                    onClick={() => handleAction(onDelete)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}

            <div className="action-sheet-divider" />

            <button
              type="button"
              className="action-sheet-item"
              disabled={busy}
              onClick={() => runExport(() => saveCleanImage(imageSrc, side, cardName), 'Saved clean image')}
            >
              <span className="action-icon">↓</span>
              Save clean image
            </button>

            <button
              type="button"
              className="action-sheet-item"
              disabled={busy}
              onClick={() => runExport(() => shareCleanImage(imageSrc, side, cardName), 'Shared clean image')}
            >
              <span className="action-icon">↗</span>
              Share clean image
            </button>
          </>
        )}

        {message && <div className="action-sheet-feedback">{message}</div>}

        <button type="button" className="action-sheet-cancel" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}

interface CompareExportMenuProps {
  open: boolean;
  images: Array<{ side: CardSide; imageSrc: string; name?: string }>;
  onClose: () => void;
}

export function CompareExportMenu({ open, images, onClose }: CompareExportMenuProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!open) return null;

  async function saveAll() {
    setBusy(true);
    setMessage(null);
    try {
      await saveAllCleanImages(images);
      setMessage(`Saved ${images.length} clean image${images.length === 1 ? '' : 's'}`);
    } catch {
      setMessage('Export failed — try again');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="action-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="action-sheet-header">
          <h2>Export</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <p className="action-sheet-note">Clean exports without border analysis overlays.</p>

        {images.map(({ side, imageSrc, name }) => (
          <button
            key={side}
            type="button"
            className="action-sheet-item"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              saveCleanImage(imageSrc, side, name)
                .then(() => setMessage(`Saved ${side} image`))
                .catch(() => setMessage('Export failed'))
                .finally(() => setBusy(false));
            }}
          >
            <span className="action-icon">↓</span>
            Save {side} (clean){name ? ` — ${name}` : ''}
          </button>
        ))}

        {images.length > 1 && (
          <button type="button" className="action-sheet-item" disabled={busy} onClick={saveAll}>
            <span className="action-icon">↓</span>
            Save both (clean)
          </button>
        )}

        {message && <div className="action-sheet-feedback">{message}</div>}

        <button type="button" className="action-sheet-cancel" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}
