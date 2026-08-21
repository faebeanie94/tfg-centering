const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const { pool } = require('../server');
const { getSubmissionPath } = require('./localStorage');
const { getPresignedUrl } = require('./s3');

// Create ZIP of submission
const createSubmissionZip = async (submissionId, outputStream) => {
  console.log(`📦 Starting export for submission: ${submissionId}`);
  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.pipe(outputStream);

  try {
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
    const folderName = submission.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();

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
      })),
    };
    archive.append(JSON.stringify(submissionSummary, null, 2), {
      name: `${folderName}/submission.json`,
    });

    // Get all cards
    const cardsResult = await pool.query(
      `SELECT c.*, m.front_grade, m.back_grade, m.condition, m.notes
       FROM cards c
       LEFT JOIN card_metadata m ON c.id = m.card_id
       WHERE c.submission_id = $1
       ORDER BY c.card_number ASC`,
      [submissionId]
    );
    console.log(`📦 Found ${cardsResult.rows.length} cards to export`);

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
      if (card.front_s3_url) {
        try {
          const frontUrl = await getPresignedUrl(submissionId, card.card_number, 'front');
          console.log(`Fetching front image for card ${card.card_number}...`);
          const frontResponse = await fetch(frontUrl);
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
      if (card.back_s3_url) {
        try {
          const backUrl = await getPresignedUrl(submissionId, card.card_number, 'back');
          console.log(`Fetching back image for card ${card.card_number}...`);
          const backResponse = await fetch(backUrl);
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
      };
      archive.append(JSON.stringify(cardMetadata, null, 2), {
        name: `${folderName}/card-${card.card_number}/metadata.json`,
      });
    }

    // Add grades CSV
    const gradesLines = ['Card Number,Front Grade,Back Grade,Overall Grade'];
    for (const card of cardsResult.rows) {
      const frontGrade = card.front_grade || '—';
      const backGrade = card.back_grade || '—';
      // Overall grade is the lower of the two (limiting grade)
      let overallGrade = '—';
      if (frontGrade !== '—' && backGrade !== '—') {
        overallGrade = [frontGrade, backGrade].sort()[0];
      } else if (frontGrade !== '—') {
        overallGrade = frontGrade;
      } else if (backGrade !== '—') {
        overallGrade = backGrade;
      }
      gradesLines.push(`${card.card_number},${frontGrade},${backGrade},${overallGrade}`);
    }
    archive.append(gradesLines.join('\n') + '\n', {
      name: `${folderName}/grades.csv`,
    });
    console.log(`📦 Added grades CSV with ${gradesLines.length - 1} cards`);

    // Finalize archive
    console.log(`📦 Finalizing archive with ${cardsResult.rows.length} cards`);
    await archive.finalize();
    console.log(`📦 Export complete`);
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
  estimateZipSize,
};
