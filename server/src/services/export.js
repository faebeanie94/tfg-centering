const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const { pool } = require('../server');
const { getSubmissionPath } = require('./localStorage');

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

    // Add submission metadata
    const metadataPath = path.join(submissionDir, 'submission.json');
    if (fs.existsSync(metadataPath)) {
      archive.file(metadataPath, { name: `${folderName}/submission.json` });
    }

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
          console.log(`Fetching front S3 URL for card ${card.card_number}: ${card.front_s3_url.substring(0, 80)}...`);
          const frontResponse = await fetch(card.front_s3_url);
          console.log(`Front S3 response: ${frontResponse.status}`);
          if (frontResponse.ok) {
            const buffer = await frontResponse.buffer();
            console.log(`Added front image (${buffer.length} bytes) for card ${card.card_number}`);
            archive.append(buffer, {
              name: `${folderName}/card-${card.card_number}/front.jpg`,
            });
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
          console.log(`Fetching back S3 URL for card ${card.card_number}: ${card.back_s3_url.substring(0, 80)}...`);
          const backResponse = await fetch(card.back_s3_url);
          console.log(`Back S3 response: ${backResponse.status}`);
          if (backResponse.ok) {
            const buffer = await backResponse.buffer();
            console.log(`Added back image (${buffer.length} bytes) for card ${card.card_number}`);
            archive.append(buffer, {
              name: `${folderName}/card-${card.card_number}/back.jpg`,
            });
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
    }

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
