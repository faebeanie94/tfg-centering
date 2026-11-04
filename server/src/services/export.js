const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const { pool } = require('../server');
const { getSubmissionPath } = require('./localStorage');
const { getPresignedUrl } = require('./supabase');

const folderNameFor = (name) => (name || 'submission').replace(/[^a-z0-9]/gi, '_').toLowerCase();

/** Share (%) of the first border: top of top+bottom, left of left+right. Blank when unmeasured. */
const sharePct = (a, b) => {
  const x = parseFloat(a);
  const y = parseFloat(b);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x + y <= 0) return '';
  return ((x / (x + y)) * 100).toFixed(1);
};

const csvCell = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * Add one submission (summary JSON, card images + metadata, grades.csv) to an
 * open archive under `folderName/`. Returns the submission and its card rows.
 */
const appendSubmission = async (archive, submissionId, folderNameOverride) => {
  {
    // Get submission from DB
    const submissionResult = await pool.query(
      'SELECT * FROM submissions WHERE id = $1',
      [submissionId]
    );

    if (submissionResult.rows.length === 0) {
      throw new Error('Submission not found');
    }

    const submission = submissionResult.rows[0];
    console.log(`📦 Found submission: "${submission.name}"`);
    const submissionDir = getSubmissionPath(submissionId);
    const folderName = folderNameOverride || folderNameFor(submission.name);

    // Get all cards
    const cardsResult = await pool.query(
      `SELECT c.*, m.front_grade, m.back_grade, m.condition, m.notes,
              m.front_left_mm, m.front_right_mm, m.front_top_mm, m.front_bottom_mm,
              m.back_left_mm, m.back_right_mm, m.back_top_mm, m.back_bottom_mm
       FROM cards c
       LEFT JOIN card_metadata m ON c.id = m.card_id
       WHERE c.submission_id = $1
       ORDER BY c.card_number ASC`,
      [submissionId]
    );
    console.log(`📦 Found ${cardsResult.rows.length} cards to export`);

    // Add submission summary JSON
    const submissionSummary = {
      name: submission.name,
      id: submissionId,
      cardCount: cardsResult.rows.length,
      exportedAt: new Date().toISOString(),
      cards: cardsResult.rows.map(card => ({
        cardNumber: card.card_number,
        frontGrade: card.front_grade || null,
        backGrade: card.back_grade || null,
        condition: card.condition || null,
        notes: card.notes || null,
        frontMeasurements: {
          leftMm: card.front_left_mm ?? null,
          rightMm: card.front_right_mm ?? null,
          topMm: card.front_top_mm ?? null,
          bottomMm: card.front_bottom_mm ?? null,
        },
        backMeasurements: {
          leftMm: card.back_left_mm ?? null,
          rightMm: card.back_right_mm ?? null,
          topMm: card.back_top_mm ?? null,
          bottomMm: card.back_bottom_mm ?? null,
        },
      })),
    };
    archive.append(JSON.stringify(submissionSummary, null, 2), {
      name: `${folderName}/submission.json`,
    });

    // Add card folders with images and metadata
    for (const card of cardsResult.rows) {
      const cardDir = path.join(submissionDir, `card-${card.card_number}`);

      // Add card.json if it exists locally
      const cardJsonPath = path.join(cardDir, 'card.json');
      if (fs.existsSync(cardJsonPath)) {
        archive.file(cardJsonPath, {
          name: `${folderName}/card-${card.card_number}/card.json`,
        });
      }

      // Add front image from S3 or local
      if (card.front_image_url) {
        try {
          const frontUrl = await getPresignedUrl(submissionId, card.card_number, 'front');
          if (!frontUrl) {
            console.error(`Failed to get presigned URL for front image of card ${card.card_number}`);
          } else {
            console.log(`Fetching front image for card ${card.card_number}...`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            try {
              const frontResponse = await fetch(frontUrl, { signal: controller.signal });
              console.log(`Front S3 response: ${frontResponse.status}`);
              if (frontResponse.ok) {
                const arrayBuffer = await frontResponse.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                console.log(`Added front image (${buffer.length} bytes) for card ${card.card_number}`);
                archive.append(buffer, {
                  name: `${folderName}/card-${card.card_number}/front.jpg`,
                });
              } else {
                console.error(`Front image returned ${frontResponse.status} for card ${card.card_number}`);
              }
            } finally {
              clearTimeout(timeoutId);
            }
          }
        } catch (err) {
          console.error(`Failed to download front image for card ${card.card_number}:`, err.message);
        }
      } else {
        const frontPath = path.join(cardDir, 'front.jpg');
        if (fs.existsSync(frontPath)) {
          archive.file(frontPath, {
            name: `${folderName}/card-${card.card_number}/front.jpg`,
          });
        }
      }

      // Add back image from S3 or local
      if (card.back_image_url) {
        try {
          const backUrl = await getPresignedUrl(submissionId, card.card_number, 'back');
          if (!backUrl) {
            console.error(`Failed to get presigned URL for back image of card ${card.card_number}`);
          } else {
            console.log(`Fetching back image for card ${card.card_number}...`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            try {
              const backResponse = await fetch(backUrl, { signal: controller.signal });
              console.log(`Back S3 response: ${backResponse.status}`);
              if (backResponse.ok) {
                const arrayBuffer = await backResponse.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                console.log(`Added back image (${buffer.length} bytes) for card ${card.card_number}`);
                archive.append(buffer, {
                  name: `${folderName}/card-${card.card_number}/back.jpg`,
                });
              } else {
                console.error(`Back image returned ${backResponse.status} for card ${card.card_number}`);
              }
            } finally {
              clearTimeout(timeoutId);
            }
          }
        } catch (err) {
          console.error(`Failed to download back image for card ${card.card_number}:`, err.message);
        }
      } else {
        const backPath = path.join(cardDir, 'back.jpg');
        if (fs.existsSync(backPath)) {
          archive.file(backPath, {
            name: `${folderName}/card-${card.card_number}/back.jpg`,
          });
        }
      }

      // Add card metadata JSON
      const cardMetadata = {
        cardNumber: card.card_number,
        frontGrade: card.front_grade || null,
        backGrade: card.back_grade || null,
        condition: card.condition || null,
        notes: card.notes || null,
        frontMeasurements: {
          leftMm: card.front_left_mm ?? null,
          rightMm: card.front_right_mm ?? null,
          topMm: card.front_top_mm ?? null,
          bottomMm: card.front_bottom_mm ?? null,
        },
        backMeasurements: {
          leftMm: card.back_left_mm ?? null,
          rightMm: card.back_right_mm ?? null,
          topMm: card.back_top_mm ?? null,
          bottomMm: card.back_bottom_mm ?? null,
        },
      };
      archive.append(JSON.stringify(cardMetadata, null, 2), {
        name: `${folderName}/card-${card.card_number}/metadata.json`,
      });
    }

    // Add grades and measurements CSV
    const gradesLines = ['Card Number,Front Grade,Back Grade,Overall Grade,Front Left (mm),Front Right (mm),Front Top (mm),Front Bottom (mm),Back Left (mm),Back Right (mm),Back Top (mm),Back Bottom (mm),Front Top (%),Front Left (%)'];
    for (const card of cardsResult.rows) {
      const frontGrade = card.front_grade || '—';
      const backGrade = card.back_grade || '—';
      // Overall grade is the lower of the two (limiting grade)
      let overallGrade = '—';
      if (frontGrade !== '—' && backGrade !== '—') {
        const frontNum = parseFloat(frontGrade.replace(/[^\d.]/g, ''));
        const backNum = parseFloat(backGrade.replace(/[^\d.]/g, ''));
        // Validate that parsing succeeded and no NaN values
        if (!isNaN(frontNum) && !isNaN(backNum)) {
          overallGrade = frontNum <= backNum ? frontGrade : backGrade;
        }
      } else if (frontGrade !== '—') {
        overallGrade = frontGrade;
      } else if (backGrade !== '—') {
        overallGrade = backGrade;
      }
      const frontLeft = card.front_left_mm ?? '—';
      const frontRight = card.front_right_mm ?? '—';
      const frontTop = card.front_top_mm ?? '—';
      const frontBottom = card.front_bottom_mm ?? '—';
      const backLeft = card.back_left_mm ?? '—';
      const backRight = card.back_right_mm ?? '—';
      const backTop = card.back_top_mm ?? '—';
      const backBottom = card.back_bottom_mm ?? '—';
      card.overall_grade = overallGrade;
      gradesLines.push(`${card.card_number},${frontGrade},${backGrade},${overallGrade},${frontLeft},${frontRight},${frontTop},${frontBottom},${backLeft},${backRight},${backTop},${backBottom},${sharePct(card.front_top_mm, card.front_bottom_mm)},${sharePct(card.front_left_mm, card.front_right_mm)}`);
    }
    archive.append(gradesLines.join('\n') + '\n', {
      name: `${folderName}/grades.csv`,
    });
    console.log(`📦 Added grades CSV with ${gradesLines.length - 1} cards`);

    return { submission, folderName, cards: cardsResult.rows };
  }
};

// Create ZIP of submission
const createSubmissionZip = async (submissionId, outputStream) => {
  console.log(`📦 Starting export for submission: ${submissionId}`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(outputStream);

  try {
    const { cards } = await appendSubmission(archive, submissionId);
    console.log(`📦 Finalizing archive with ${cards.length} cards`);
    await archive.finalize();
    console.log(`📦 Export complete`);
  } catch (err) {
    archive.destroy();
    throw err;
  }
};

const LIBRARY_CSV_HEADER = [
  'Submission', 'Submission Completed', 'Card Number', 'Folder',
  'Front Grade', 'Back Grade', 'Overall Grade',
  'Front Left (mm)', 'Front Right (mm)', 'Front Top (mm)', 'Front Bottom (mm)',
  'Back Left (mm)', 'Back Right (mm)', 'Back Top (mm)', 'Back Bottom (mm)',
  'Front Top (%)', 'Front Left (%)', 'Notes',
];

/**
 * Every given submission in one ZIP, each in its own folder exactly as a
 * single export, plus library.csv at the top with one row per card across all
 * of them. Missing submissions are skipped and listed in library.json.
 */
const createLibraryZip = async (submissionIds, outputStream) => {
  console.log(`📦 Starting library export for ${submissionIds.length} submissions`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(outputStream);

  try {
    const lines = [LIBRARY_CSV_HEADER.join(',')];
    const usedFolders = new Set();
    const included = [];
    const skipped = [];

    for (const id of submissionIds) {
      const found = await pool.query('SELECT name FROM submissions WHERE id = $1', [id]);
      if (found.rows.length === 0) {
        skipped.push(id);
        continue;
      }

      // Two submissions can share a name; keep their folders apart.
      const base = folderNameFor(found.rows[0].name);
      let folder = base;
      for (let n = 2; usedFolders.has(folder); n++) folder = `${base}_${n}`;
      usedFolders.add(folder);

      const { submission, cards } = await appendSubmission(archive, id, folder);
      included.push({ id, name: submission.name, folder, cardCount: cards.length });

      for (const card of cards) {
        lines.push([
          submission.name,
          submission.completed_at ? 'yes' : 'no',
          card.card_number,
          `${folder}/card-${card.card_number}`,
          card.front_grade || '',
          card.back_grade || '',
          card.overall_grade && card.overall_grade !== '—' ? card.overall_grade : '',
          card.front_left_mm ?? '', card.front_right_mm ?? '', card.front_top_mm ?? '', card.front_bottom_mm ?? '',
          card.back_left_mm ?? '', card.back_right_mm ?? '', card.back_top_mm ?? '', card.back_bottom_mm ?? '',
          sharePct(card.front_top_mm, card.front_bottom_mm),
          sharePct(card.front_left_mm, card.front_right_mm),
          card.notes || '',
        ].map(csvCell).join(','));
      }
    }

    archive.append(lines.join('\n') + '\n', { name: 'library.csv' });
    archive.append(JSON.stringify({
      exportedAt: new Date().toISOString(),
      submissions: included,
      cardCount: lines.length - 1,
      skippedSubmissionIds: skipped,
    }, null, 2), { name: 'library.json' });

    console.log(`📦 Finalizing library archive: ${included.length} submissions, ${lines.length - 1} cards`);
    await archive.finalize();
  } catch (err) {
    archive.destroy();
    throw err;
  }
};

// Get file size estimate (card count * avg image size)
const estimateZipSize = async (submissionId) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) as card_count FROM cards WHERE submission_id = $1`,
      [submissionId]
    );

    const cardCount = parseInt(result.rows[0].card_count);
    const avgImageSize = 1024 * 1024; // 1MB per image
    const estimatedSize = cardCount * avgImageSize * 2; // front + back

    return estimatedSize;
  } catch (err) {
    return 0;
  }
};

module.exports = {
  createSubmissionZip,
  createLibraryZip,
  sharePct,
  estimateZipSize,
};
