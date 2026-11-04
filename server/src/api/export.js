const express = require('express');
const { pool } = require('../server');
const { createSubmissionZip, createLibraryZip, estimateZipSize } = require('../services/export');
const { validateUUID } = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LIBRARY_SUBMISSIONS = 500;

/** Several submissions in one ZIP: body { ids: [uuid, ...] }. */
router.post('/export-all', asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids)] : null;
  if (!ids || ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array of submission ids' });
  }
  if (ids.length > MAX_LIBRARY_SUBMISSIONS) {
    return res.status(400).json({ error: `at most ${MAX_LIBRARY_SUBMISSIONS} submissions per export` });
  }
  if (!ids.every((id) => typeof id === 'string' && UUID_RE.test(id))) {
    return res.status(400).json({ error: 'every id must be a valid UUID' });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="tfg_library_${stamp}.zip"`);

  await createLibraryZip(ids, res);
}));

router.get('/:id/export', validateUUID('id'), asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await pool.query('SELECT * FROM submissions WHERE id = $1', [id]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Submission not found' });
  }

  const submission = result.rows[0];
  const fileName = `${(submission.name || 'submission').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.zip`;

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

  if (cardsResult.rows.length === 0) {
    return res.status(500).json({ error: 'Failed to count cards' });
  }

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
