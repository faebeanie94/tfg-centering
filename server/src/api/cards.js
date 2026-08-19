const express = require('express');
const { pool } = require('../server');

const router = express.Router();

// Create card (with image data)
router.post('/:submissionId/cards', async (req, res) => {
  const { submissionId } = req.params;
  const { cardNumber, frontImage, backImage, frontS3Url, backS3Url, frontLocalPath, backLocalPath } = req.body;

  if (!cardNumber) {
    return res.status(400).json({ error: 'Card number is required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO cards (submission_id, card_number, front_s3_url, back_s3_url, front_local_path, back_local_path)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (submission_id, card_number) DO UPDATE SET
         front_s3_url = COALESCE($3, cards.front_s3_url),
         back_s3_url = COALESCE($4, cards.back_s3_url),
         front_local_path = COALESCE($5, cards.front_local_path),
         back_local_path = COALESCE($6, cards.back_local_path)
       RETURNING *`,
      [submissionId, cardNumber, frontS3Url || null, backS3Url || null, frontLocalPath || null, backLocalPath || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating card:', err);
    res.status(500).json({ error: 'Failed to create card' });
  }
});

// List cards for submission
router.get('/:submissionId/cards', async (req, res) => {
  const { submissionId } = req.params;

  try {
    const result = await pool.query(
      `SELECT c.*, m.front_grade, m.back_grade, m.condition, m.notes
       FROM cards c
       LEFT JOIN card_metadata m ON c.id = m.card_id
       WHERE c.submission_id = $1
       ORDER BY c.card_number ASC`,
      [submissionId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching cards:', err);
    res.status(500).json({ error: 'Failed to fetch cards' });
  }
});

// Get single card
router.get('/:submissionId/cards/:cardNumber', async (req, res) => {
  const { submissionId, cardNumber } = req.params;

  try {
    const result = await pool.query(
      `SELECT c.*, m.front_grade, m.back_grade, m.condition, m.notes
       FROM cards c
       LEFT JOIN card_metadata m ON c.id = m.card_id
       WHERE c.submission_id = $1 AND c.card_number = $2`,
      [submissionId, parseInt(cardNumber)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Card not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching card:', err);
    res.status(500).json({ error: 'Failed to fetch card' });
  }
});

// Update card
router.put('/:submissionId/cards/:cardNumber', async (req, res) => {
  const { submissionId, cardNumber } = req.params;
  const { frontS3Url, backS3Url, frontLocalPath, backLocalPath, metadata } = req.body;

  try {
    // Update card
    const cardResult = await pool.query(
      `UPDATE cards SET
         front_s3_url = COALESCE($1, front_s3_url),
         back_s3_url = COALESCE($2, back_s3_url),
         front_local_path = COALESCE($3, front_local_path),
         back_local_path = COALESCE($4, back_local_path)
       WHERE submission_id = $5 AND card_number = $6
       RETURNING id`,
      [frontS3Url, backS3Url, frontLocalPath, backLocalPath, submissionId, parseInt(cardNumber)]
    );

    if (cardResult.rows.length === 0) {
      return res.status(404).json({ error: 'Card not found' });
    }

    const cardId = cardResult.rows[0].id;

    // Update metadata if provided
    if (metadata) {
      const { frontGrade, backGrade, condition, notes } = metadata;
      await pool.query(
        `INSERT INTO card_metadata (card_id, front_grade, back_grade, condition, notes)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (card_id) DO UPDATE SET
           front_grade = COALESCE($2, card_metadata.front_grade),
           back_grade = COALESCE($3, card_metadata.back_grade),
           condition = COALESCE($4, card_metadata.condition),
           notes = COALESCE($5, card_metadata.notes)`,
        [cardId, frontGrade || null, backGrade || null, condition || null, notes || null]
      );
    }

    const result = await pool.query(
      `SELECT c.*, m.front_grade, m.back_grade, m.condition, m.notes
       FROM cards c
       LEFT JOIN card_metadata m ON c.id = m.card_id
       WHERE c.id = $1`,
      [cardId]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating card:', err);
    res.status(500).json({ error: 'Failed to update card' });
  }
});

// Delete card
router.delete('/:submissionId/cards/:cardNumber', async (req, res) => {
  const { submissionId, cardNumber } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM cards WHERE submission_id = $1 AND card_number = $2 RETURNING id',
      [submissionId, parseInt(cardNumber)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Card not found' });
    }

    res.json({ message: 'Card deleted', cardNumber: parseInt(cardNumber) });
  } catch (err) {
    console.error('Error deleting card:', err);
    res.status(500).json({ error: 'Failed to delete card' });
  }
});

module.exports = router;
