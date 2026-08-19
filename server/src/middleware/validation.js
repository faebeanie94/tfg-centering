const validateSubmissionName = (req, res, next) => {
  const { name } = req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Submission name is required and must be a string' });
  }

  if (name.trim().length === 0) {
    return res.status(400).json({ error: 'Submission name cannot be empty' });
  }

  if (name.length > 255) {
    return res.status(400).json({ error: 'Submission name must be 255 characters or less' });
  }

  next();
};

const validateCardNumber = (req, res, next) => {
  const { cardNumber } = req.body || req.params;
  const num = parseInt(cardNumber);

  if (!cardNumber || isNaN(num)) {
    return res.status(400).json({ error: 'Card number is required and must be a valid integer' });
  }

  if (num <= 0) {
    return res.status(400).json({ error: 'Card number must be greater than 0' });
  }

  next();
};

const validateUUID = (paramName = 'id') => {
  return (req, res, next) => {
    const id = req.params[paramName];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!id || !uuidRegex.test(id)) {
      return res.status(400).json({ error: `Invalid ${paramName}: must be a valid UUID` });
    }

    next();
  };
};

const validateCardMetadata = (req, res, next) => {
  const { metadata } = req.body;

  if (metadata) {
    if (typeof metadata !== 'object') {
      return res.status(400).json({ error: 'Metadata must be an object' });
    }

    const { frontGrade, backGrade, condition, notes } = metadata;

    if (frontGrade && frontGrade.length > 50) {
      return res.status(400).json({ error: 'Front grade must be 50 characters or less' });
    }

    if (backGrade && backGrade.length > 50) {
      return res.status(400).json({ error: 'Back grade must be 50 characters or less' });
    }

    if (condition && condition.length > 100) {
      return res.status(400).json({ error: 'Condition must be 100 characters or less' });
    }

    if (notes && notes.length > 5000) {
      return res.status(400).json({ error: 'Notes must be 5000 characters or less' });
    }
  }

  next();
};

module.exports = {
  validateSubmissionName,
  validateCardNumber,
  validateUUID,
  validateCardMetadata,
};
