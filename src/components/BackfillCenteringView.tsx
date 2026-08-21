import { useState, useEffect } from 'react';
import type { SubmissionFolder } from '../lib/folder-submission';
import * as api from '../lib/api-client';

interface SavedSnapshot {
  label: string;
  submissionName: string;
  cardNumber: number;
  hasFront: boolean;
  hasBack: boolean;
}

interface BackfillResult {
  cardNumber: number;
  success: boolean;
  message: string;
}

interface BackfillCenteringViewProps {
  submission: SubmissionFolder;
  onClose: () => void;
}

export function BackfillCenteringView({ submission, onClose }: BackfillCenteringViewProps) {
  const [snapshots, setSnapshots] = useState<SavedSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [results, setResults] = useState<BackfillResult[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (submission.type !== 'api') {
      setLoading(false);
      return;
    }

    loadSavedSnapshots();
  }, [submission]);

  async function loadSavedSnapshots() {
    try {
      const db = await openDb();
      const allCards = await getSavedCards(db);
      db.close();

      const extracted: SavedSnapshot[] = [];
      for (const record of allCards) {
        const match = record.label.match(/^([^/]+)\/(\d+)$/);
        if (match) {
          const submissionName = match[1];
          const cardNumber = parseInt(match[2], 10);
          const session = record.session;

          const hasFront = !!session.front?.result?.bordersMm;
          const hasBack = !!session.back?.result?.bordersMm;

          if (hasFront || hasBack) {
            extracted.push({
              label: record.label,
              submissionName,
              cardNumber,
              hasFront,
              hasBack,
            });
          }
        }
      }

      setSnapshots(extracted);
    } catch (err) {
      setMessage('Failed to load saved snapshots');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleBackfill() {
    if (submission.type !== 'api') return;

    setBackfilling(true);
    setResults([]);
    setMessage(null);

    try {
      // Get submission to match name
      const submissionData = await api.getSubmission(submission.submissionId);
      const cardsToSync = snapshots.filter((s) => s.submissionName === submissionData.name);

      if (cardsToSync.length === 0) {
        setMessage(`No snapshots found for submission "${submissionData.name}"`);
        setBackfilling(false);
        return;
      }

      const backfillResults: BackfillResult[] = [];
      const db = await openDb();
      const allCards = await getSavedCards(db);
      db.close();

      for (const cardSnapshot of cardsToSync) {
        try {
          // Find the actual snapshot data
          const record = allCards.find(
            (r) =>
              r.label === cardSnapshot.label &&
              r.session.front?.result?.bordersMm &&
              r.session.back?.result?.bordersMm
          );

          if (!record) continue;

          const metadata: any = {};

          if (cardSnapshot.hasFront && record.session.front?.result?.bordersMm) {
            metadata.frontLeftMm = record.session.front.result.bordersMm.left;
            metadata.frontRightMm = record.session.front.result.bordersMm.right;
            metadata.frontTopMm = record.session.front.result.bordersMm.top;
            metadata.frontBottomMm = record.session.front.result.bordersMm.bottom;
          }

          if (cardSnapshot.hasBack && record.session.back?.result?.bordersMm) {
            metadata.backLeftMm = record.session.back.result.bordersMm.left;
            metadata.backRightMm = record.session.back.result.bordersMm.right;
            metadata.backTopMm = record.session.back.result.bordersMm.top;
            metadata.backBottomMm = record.session.back.result.bordersMm.bottom;
          }

          await api.updateCard(submission.submissionId, cardSnapshot.cardNumber, metadata);

          backfillResults.push({
            cardNumber: cardSnapshot.cardNumber,
            success: true,
            message: `Synced (Front: ${cardSnapshot.hasFront ? '✓' : '✗'}, Back: ${cardSnapshot.hasBack ? '✓' : '✗'})`,
          });
        } catch (err) {
          backfillResults.push({
            cardNumber: cardSnapshot.cardNumber,
            success: false,
            message: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }

      setResults(backfillResults);
      const successCount = backfillResults.filter((r) => r.success).length;
      setMessage(`Backfilled ${successCount} of ${backfillResults.length} cards`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Backfill failed');
    } finally {
      setBackfilling(false);
    }
  }

  if (loading) {
    return (
      <div className="backfill-view">
        <div className="backfill-header">
          <button type="button" className="btn btn-secondary btn-small" onClick={onClose}>
            ← Back
          </button>
          <h2>Backfill Centering Measurements</h2>
        </div>
        <p>Loading saved snapshots...</p>
      </div>
    );
  }

  const matchingSnapshots = snapshots.filter(
    (s) => s.submissionName === submission.name
  );

  return (
    <div className="backfill-view">
      <div className="backfill-header">
        <button type="button" className="btn btn-secondary btn-small" onClick={onClose} disabled={backfilling}>
          ← Back
        </button>
        <h2>Backfill Centering Measurements</h2>
      </div>

      {message && <div className={`backfill-message ${results.some((r) => !r.success) ? 'backfill-message-error' : ''}`}>{message}</div>}

      {snapshots.length === 0 ? (
        <div className="backfill-empty">
          <p>No saved card snapshots found in your library.</p>
          <p>Snapshots are created when you grade cards. Grade some cards first, then return here.</p>
        </div>
      ) : matchingSnapshots.length === 0 ? (
        <div className="backfill-empty">
          <p>No snapshots found matching "{submission.name}".</p>
          <p>Available submissions in your library:</p>
          <ul>
            {[...new Set(snapshots.map((s) => s.submissionName))].map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <div className="backfill-info">
            <p>Found {matchingSnapshots.length} cards with centering measurements:</p>
            <div className="backfill-cards-list">
              {matchingSnapshots.map((snap) => (
                <div key={snap.cardNumber} className="backfill-card-item">
                  <span className="backfill-card-number">Card {snap.cardNumber}</span>
                  <span className="backfill-card-sides">
                    {snap.hasFront && <span className="backfill-side-badge">Front</span>}
                    {snap.hasBack && <span className="backfill-side-badge">Back</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {results.length > 0 && (
            <div className="backfill-results">
              <h3>Results:</h3>
              <div className="backfill-results-list">
                {results.map((result) => (
                  <div key={result.cardNumber} className={`backfill-result-item ${result.success ? 'success' : 'error'}`}>
                    <span className="result-icon">{result.success ? '✓' : '✗'}</span>
                    <span className="result-text">
                      Card {result.cardNumber}: {result.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleBackfill}
            disabled={backfilling}
          >
            {backfilling ? 'Backfilling...' : 'Backfill All Cards'}
          </button>
        </>
      )}
    </div>
  );
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('tfg-centering', 1);
    request.onerror = () => reject(request.error ?? new Error('Failed to open database'));
    request.onsuccess = () => resolve(request.result);
  });
}

function getSavedCards(db: IDBDatabase): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('saved-cards', 'readonly');
    const request = tx.objectStore('saved-cards').getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
