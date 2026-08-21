const express = require('express');
const { pool } = require('../server');
const { uploadImage, deleteImage, getPresignedUrl } = require('../services/s3');
const { saveCardImage, saveCardMetadata, deleteCardFolder } = require('../services/localStorage');
const { validateCardNumber, validateUUID, validateCardMetadata } = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

router.post(
  '/:submissionId/cards',
  validateUUID('submissionId'),
  validateCardNumber,
  asyncHandler(async (req, res) => {
    const { submissionId } = req.params;
    const { cardNumber } = req.body;

    // Verify submission exists
    const submissionCheck = await pool.query('SELECT id FROM submissions WHERE id = $1', [
      submissionId,
    ]);
    if (submissionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    let frontS3Url = null;
    let backS3Url = null;

    if (req.files?.frontImage) {
      frontS3Url = await uploadImage(
        req.files.frontImage.data,
        req.files.frontImage.name,
        submissionId,
        cardNumber,
        'front'
      );
    }

    if (req.files?.backImage) {
      backS3Url = await uploadImage(
        req.files.backImage.data,
        req.files.backImage.name,
        submissionId,
        cardNumber,
        'back'
      );
    }

    const result = await pool.query(
      `INSERT INTO cards (submission_id, card_number, front_s3_url, back_s3_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (submission_id, card_number) DO UPDATE SET
         front_s3_url = COALESCE($3, cards.front_s3_url),
         back_s3_url = COALESCE($4, cards.back_s3_url)
       RETURNING *`,
      [submissionId, cardNumber, frontS3Url, backS3Url]
    );

    const card = result.rows[0];

    if (req.files?.frontImage) {
      await saveCardImage(submissionId, cardNumber, 'front', req.files.frontImage.data);
    }
    if (req.files?.backImage) {
      await saveCardImage(submissionId, cardNumber, 'back', req.files.backImage.data);
    }

    await saveCardMetadata(submissionId, card, null);
    res.status(201).json(card);
  })
);

router.get('/:submissionId/cards', validateUUID('submissionId'), asyncHandler(async (req, res) => {
  const { submissionId } = req.params;

  const result = await pool.query(
    `SELECT c.*, m.front_grade, m.back_grade, m.condition, m.notes,
            m.front_left_mm, m.front_right_mm, m.front_top_mm, m.front_bottom_mm,
            m.back_left_mm, m.back_right_mm, m.back_top_mm, m.back_bottom_mm
     FROM cards c
     LEFT JOIN card_metadata m ON c.id = m.card_id
     WHERE c.submission_id = $1
     ORDER BY c.card_number ASC`,
    [submissionId]
  );

  // Generate presigned URLs for images
  const cards = await Promise.all(
    result.rows.map(async (card) => {
      const front_url = card.front_s3_url ? await getPresignedUrl(submissionId, card.card_number, 'front') : null;
      const back_url = card.back_s3_url ? await getPresignedUrl(submissionId, card.card_number, 'back') : null;
      return {
        ...card,
        front_s3_url: front_url,
        back_s3_url: back_url,
      };
    })
  );

  res.json(cards);
}));

router.get(
  '/:submissionId/cards/:cardNumber',
  validateUUID('submissionId'),
  asyncHandler(async (req, res) => {
    const { submissionId, cardNumber } = req.params;

    const result = await pool.query(
      `SELECT c.*, m.front_grade, m.back_grade, m.condition, m.notes,
              m.front_left_mm, m.front_right_mm, m.front_top_mm, m.front_bottom_mm,
              m.back_left_mm, m.back_right_mm, m.back_top_mm, m.back_bottom_mm
       FROM cards c
       LEFT JOIN card_metadata m ON c.id = m.card_id
       WHERE c.submission_id = $1 AND c.card_number = $2`,
      [submissionId, parseInt(cardNumber)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Card not found' });
    }

    const card = result.rows[0];
    const front_url = card.front_s3_url ? await getPresignedUrl(submissionId, card.card_number, 'front') : null;
    const back_url = card.back_s3_url ? await getPresignedUrl(submissionId, card.card_number, 'back') : null;

    res.json({
      ...card,
      front_s3_url: front_url,
      back_s3_url: back_url,
    });
  })
);

router.put(
  '/:submissionId/cards/:cardNumber',
  validateUUID('submissionId'),
  validateCardMetadata,
  asyncHandler(async (req, res) => {
    const { submissionId, cardNumber } = req.params;
    const { metadata } = req.body;

    const cardResult = await pool.query(
      `UPDATE cards SET updated_at = CURRENT_TIMESTAMP
       WHERE submission_id = $1 AND card_number = $2
       RETURNING id`,
      [submissionId, parseInt(cardNumber)]
    );

    if (cardResult.rows.length === 0) {
      return res.status(404).json({ error: 'Card not found' });
    }

    const cardId = cardResult.rows[0].id;

    if (metadata) {
      const {
        frontGrade,
        backGrade,
        condition,
        notes,
        frontLeftMm,
        frontRightMm,
        frontTopMm,
        frontBottomMm,
        backLeftMm,
        backRightMm,
        backTopMm,
        backBottomMm,
      } = metadata;
      await pool.query(
        `INSERT INTO card_metadata (
          card_id, front_grade, back_grade, condition, notes,
          front_left_mm, front_right_mm, front_top_mm, front_bottom_mm,
          back_left_mm, back_right_mm, back_top_mm, back_bottom_mm
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (card_id) DO UPDATE SET
           front_grade = COALESCE($2, card_metadata.front_grade),
           back_grade = COALESCE($3, card_metadata.back_grade),
           condition = COALESCE($4, card_metadata.condition),
           notes = COALESCE($5, card_metadata.notes),
           front_left_mm = COALESCE($6, card_metadata.front_left_mm),
           front_right_mm = COALESCE($7, card_metadata.front_right_mm),
           front_top_mm = COALESCE($8, card_metadata.front_top_mm),
           front_bottom_mm = COALESCE($9, card_metadata.front_bottom_mm),
           back_left_mm = COALESCE($10, card_metadata.back_left_mm),
           back_right_mm = COALESCE($11, card_metadata.back_right_mm),
           back_top_mm = COALESCE($12, card_metadata.back_top_mm),
           back_bottom_mm = COALESCE($13, card_metadata.back_bottom_mm)`,
        [
          cardId,
          frontGrade || null,
          backGrade || null,
          condition || null,
          notes || null,
          frontLeftMm || null,
          frontRightMm || null,
          frontTopMm || null,
          frontBottomMm || null,
          backLeftMm || null,
          backRightMm || null,
          backTopMm || null,
          backBottomMm || null,
        ]
      );
    }

    const result = await pool.query(
      `SELECT c.*, m.front_grade, m.back_grade, m.condition, m.notes,
              m.front_left_mm, m.front_right_mm, m.front_top_mm, m.front_bottom_mm,
              m.back_left_mm, m.back_right_mm, m.back_top_mm, m.back_bottom_mm
       FROM cards c
       LEFT JOIN card_metadata m ON c.id = m.card_id
       WHERE c.id = $1`,
      [cardId]
    );

    const updatedCard = result.rows[0];

    if (metadata) {
      await saveCardMetadata(submissionId, updatedCard, metadata);
    }

    res.json(updatedCard);
  })
);

router.delete(
  '/:submissionId/cards/:cardNumber',
  validateUUID('submissionId'),
  asyncHandler(async (req, res) => {
    const { submissionId, cardNumber } = req.params;
    console.log(`DELETE card: submission=${submissionId}, cardNumber=${cardNumber}`);

    const cardResult = await pool.query(
      'SELECT * FROM cards WHERE submission_id = $1 AND card_number = $2',
      [submissionId, parseInt(cardNumber)]
    );

    if (cardResult.rows.length === 0) {
      console.log(`Card not found: ${cardNumber}`);
      return res.status(404).json({ error: 'Card not found' });
    }

    const card = cardResult.rows[0];

    if (card.front_s3_url) await deleteImage(card.front_s3_url);
    if (card.back_s3_url) await deleteImage(card.back_s3_url);

    await deleteCardFolder(submissionId, parseInt(cardNumber));

    const deleteResult = await pool.query('DELETE FROM cards WHERE submission_id = $1 AND card_number = $2', [
      submissionId,
      parseInt(cardNumber),
    ]);
    console.log(`Deleted card ${cardNumber}: ${deleteResult.rowCount} rows affected`);

    res.json({ message: 'Card deleted', cardNumber: parseInt(cardNumber) });
  })
);

// Serve image as data (to avoid CORS issues with direct GCS fetch)
router.get(
  '/:submissionId/cards/:cardNumber/image/:side',
  validateUUID('submissionId'),
  asyncHandler(async (req, res) => {
    const { submissionId, cardNumber, side } = req.params;

    if (!['front', 'back'].includes(side)) {
      return res.status(400).json({ error: 'Invalid side' });
    }

    const result = await pool.query(
      `SELECT c.id, c.${side}_s3_url FROM cards c WHERE c.submission_id = $1 AND c.card_number = $2`,
      [submissionId, parseInt(cardNumber)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Card not found' });
    }

    const card = result.rows[0];
    const imageKey = `${side}_s3_url`;

    if (!card[imageKey]) {
      return res.status(404).json({ error: `${side} image not found` });
    }

    try {
      const presignedUrl = await getPresignedUrl(submissionId, parseInt(cardNumber), side);

      // Fetch the image from GCS using the presigned URL
      const imageResponse = await fetch(presignedUrl);

      if (!imageResponse.ok) {
        return res.status(404).json({ error: 'Image not found in storage' });
      }

      const imageBuffer = await imageResponse.arrayBuffer();
      const base64Data = Buffer.from(imageBuffer).toString('base64');
      const mimeType = 'image/jpeg'; // Assuming JPEG, could detect from file extension

      res.json({
        data: `data:${mimeType};base64,${base64Data}`,
        mimeType
      });
    } catch (err) {
      console.error(`Failed to fetch ${side} image:`, err);
      res.status(500).json({ error: 'Failed to load image' });
    }
  })
);

module.exports = router;
