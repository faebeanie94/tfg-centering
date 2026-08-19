const express = require('express');
const { pool } = require('../server');
const { createSubmissionZip, estimateZipSize } = require('../services/export');
const { validateUUID } = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

router.get('/:id/export', validateUUID('id'), asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await pool.query('SELECT * FROM submissions WHERE id = $1', [id]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Submission not found' });
  }

  const submission = result.rows[0];
  const fileName = `${submission.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

  await createSubmissionZip(id, res);
}));

router.get('/:id/export-info', validateUUID('id'), asyncHandler(async (req, res) => {
  const { id } = req.params;

  const submissionResult = await pool.query('SELECT * FROM submissions WHERE id = $1', [id]);

  if (submissionResult.rows.length === 0) {
    return res.status(404).json({ error: 'Submission not found' });
  }

  const cardsResult = await pool.query(
    'SELECT COUNT(*) as card_count FROM cards WHERE submission_id = $1',
    [id]
  );

  const cardCount = parseInt(cardsResult.rows[0].card_count);
  const estimatedSize = await estimateZipSize(id);

  res.json({
    submission_id: id,
    submission_name: submissionResult.rows[0].name,
    card_count: cardCount,
    estimated_zip_size: estimatedSize,
    estimated_zip_size_mb: (estimatedSize / (1024 * 1024)).toFixed(2),
  });
}));

module.exports = router;
