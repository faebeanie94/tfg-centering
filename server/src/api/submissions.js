const express = require('express');
const { pool } = require('../server');
const { deleteSubmissionImages } = require('../services/s3');
const { saveSubmissionMetadata, deleteSubmissionFolder } = require('../services/localStorage');
const { validateSubmissionName, validateUUID } = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

router.post('/', validateSubmissionName, asyncHandler(async (req, res) => {
  const { name } = req.body;

  const result = await pool.query(
    'INSERT INTO submissions (name) VALUES ($1) RETURNING *',
    [name]
  );
  const submission = result.rows[0];

  await saveSubmissionMetadata(submission);
  res.status(201).json(submission);
}));

router.get('/', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM submissions ORDER BY created_at DESC');
  res.json(result.rows);
}));

router.get('/:id', validateUUID('id'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await pool.query('SELECT * FROM submissions WHERE id = $1', [id]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Submission not found' });
  }

  res.json(result.rows[0]);
}));

router.put('/:id', validateUUID('id'), validateSubmissionName, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  const result = await pool.query(
    'UPDATE submissions SET name = $1 WHERE id = $2 RETURNING *',
    [name, id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Submission not found' });
  }

  const submission = result.rows[0];
  await saveSubmissionMetadata(submission);
  res.json(submission);
}));

router.delete('/:id', validateUUID('id'), asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await pool.query('DELETE FROM submissions WHERE id = $1 RETURNING *', [id]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Submission not found' });
  }

  await deleteSubmissionImages(id);
  await deleteSubmissionFolder(id);

  res.json({ message: 'Submission deleted', id: result.rows[0].id });
}));

module.exports = router;
