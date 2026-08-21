/**
 * Backfill API submission cards with centering measurements from local IndexedDB snapshots
 *
 * Usage:
 * 1. Open the app in Safari on iPhone or in browser
 * 2. Open the browser console (Safari: Develop menu > Web Inspector, Chrome: F12)
 * 3. Copy and paste this entire script into the console
 * 4. Run: await backfillCenteringMeasurements(submissionId)
 *    - Replace submissionId with the actual submission UUID
 *    - Or run without args to see a preview: await backfillCenteringMeasurements()
 */

async function backfillCenteringMeasurements(targetSubmissionId = null) {
  const API_BASE = '/api';

  // Open IndexedDB and get saved cards
  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('tfg-centering', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  function getSavedCards(db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('saved-cards', 'readonly');
      const request = tx.objectStore('saved-cards').getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  try {
    console.log('Opening IndexedDB...');
    const db = await openDb();
    const savedCards = await getSavedCards(db);
    db.close();

    console.log(`Found ${savedCards.length} saved cards in library`);

    // Extract cards that match submission format (label contains submission name and card number)
    const extractedCards = [];
    for (const record of savedCards) {
      const label = record.label;
      const match = label.match(/^([^/]+)\/(\d+)$/);

      if (match) {
        const submissionName = match[1];
        const cardNumber = parseInt(match[2], 10);
        const session = record.session;

        const measurements = {};

        // Extract front measurements
        if (session.front?.result?.bordersMm) {
          measurements.front = {
            leftMm: session.front.result.bordersMm.left,
            rightMm: session.front.result.bordersMm.right,
            topMm: session.front.result.bordersMm.top,
            bottomMm: session.front.result.bordersMm.bottom,
          };
        }

        // Extract back measurements
        if (session.back?.result?.bordersMm) {
          measurements.back = {
            leftMm: session.back.result.bordersMm.left,
            rightMm: session.back.result.bordersMm.right,
            topMm: session.back.result.bordersMm.top,
            bottomMm: session.back.result.bordersMm.bottom,
          };
        }

        if (Object.keys(measurements).length > 0) {
          extractedCards.push({
            label,
            submissionName,
            cardNumber,
            measurements,
            hasFront: !!session.front?.result?.bordersMm,
            hasBack: !!session.back?.result?.bordersMm,
          });
        }
      }
    }

    console.log(`\nExtracted ${extractedCards.length} cards with measurements from library:`);
    extractedCards.forEach((card) => {
      console.log(`  ${card.label} - Front: ${card.hasFront ? '✓' : '✗'}, Back: ${card.hasBack ? '✓' : '✗'}`);
    });

    if (extractedCards.length === 0) {
      console.log('No cards found with submission format (Name/CardNumber)');
      return;
    }

    // If no submission specified, show preview
    if (!targetSubmissionId) {
      console.log('\n=== PREVIEW MODE ===');
      console.log('To sync these measurements to the API, call:');
      console.log('await backfillCenteringMeasurements(submissionId)');
      console.log('\nExample submission IDs from your submissions:');

      // Try to fetch submissions to show examples
      try {
        const res = await fetch(`${API_BASE}/submissions`);
        const submissions = await res.json();
        submissions.slice(0, 3).forEach((sub) => {
          console.log(`  - Name: "${sub.name}", ID: ${sub.id}`);
        });
      } catch (err) {
        console.log('(Could not fetch submissions list)');
      }

      return;
    }

    console.log(`\n=== BACKFILLING SUBMISSION: ${targetSubmissionId} ===`);

    // Fetch submission to match cards
    const subRes = await fetch(`${API_BASE}/submissions/${targetSubmissionId}`);
    if (!subRes.ok) {
      throw new Error(`Submission not found: ${targetSubmissionId}`);
    }
    const submission = await subRes.json();
    console.log(`Submission: "${submission.name}"`);

    // Filter extracted cards for this submission
    const cardsToSync = extractedCards.filter(
      (card) => card.submissionName === submission.name
    );

    if (cardsToSync.length === 0) {
      console.log(
        `\nNo cards found matching submission name "${submission.name}"`
      );
      console.log(
        'Available submission names:',
        [...new Set(extractedCards.map((c) => c.submissionName))]
      );
      return;
    }

    console.log(`\nFound ${cardsToSync.length} cards to sync for this submission:\n`);

    let synced = 0;
    let failed = 0;

    for (const card of cardsToSync) {
      try {
        const metadata = {};

        if (card.measurements.front) {
          metadata.frontLeftMm = card.measurements.front.leftMm;
          metadata.frontRightMm = card.measurements.front.rightMm;
          metadata.frontTopMm = card.measurements.front.topMm;
          metadata.frontBottomMm = card.measurements.front.bottomMm;
        }

        if (card.measurements.back) {
          metadata.backLeftMm = card.measurements.back.leftMm;
          metadata.backRightMm = card.measurements.back.rightMm;
          metadata.backTopMm = card.measurements.back.topMm;
          metadata.backBottomMm = card.measurements.back.bottomMm;
        }

        const updateRes = await fetch(
          `${API_BASE}/submissions/${targetSubmissionId}/cards/${card.cardNumber}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ metadata }),
          }
        );

        if (updateRes.ok) {
          console.log(`✓ Card ${card.cardNumber}: Synced (Front: ${card.hasFront ? '✓' : '✗'}, Back: ${card.hasBack ? '✓' : '✗'})`);
          synced++;
        } else {
          const err = await updateRes.json().catch(() => ({}));
          console.log(`✗ Card ${card.cardNumber}: Failed - ${err.error || updateRes.statusText}`);
          failed++;
        }
      } catch (err) {
        console.log(`✗ Card ${card.cardNumber}: Error - ${err.message}`);
        failed++;
      }
    }

    console.log(`\n=== COMPLETE ===`);
    console.log(`Synced: ${synced}, Failed: ${failed}`);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

// Export for use
console.log('Backfill script loaded!');
console.log('Usage: await backfillCenteringMeasurements(submissionId)');
console.log('Or preview: await backfillCenteringMeasurements()');
