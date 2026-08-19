const fs = require('fs').promises;
const path = require('path');

const SUBMISSIONS_DIR = path.join(process.cwd(), 'submissions');

// Ensure submissions directory exists
const ensureDir = async (dirPath) => {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
};

// Save submission metadata locally
const saveSubmissionMetadata = async (submission) => {
  const submissionDir = path.join(SUBMISSIONS_DIR, submission.id);
  await ensureDir(submissionDir);

  const metadata = {
    id: submission.id,
    name: submission.name,
    created_at: submission.created_at,
    updated_at: submission.updated_at,
  };

  await fs.writeFile(
    path.join(submissionDir, 'submission.json'),
    JSON.stringify(metadata, null, 2)
  );
};

// Save card image locally
const saveCardImage = async (submissionId, cardNumber, side, imageBuffer) => {
  if (!imageBuffer) return null;

  const cardDir = path.join(SUBMISSIONS_DIR, submissionId, `card-${cardNumber}`);
  await ensureDir(cardDir);

  const imagePath = path.join(cardDir, `${side}.jpg`);
  await fs.writeFile(imagePath, imageBuffer);

  return imagePath;
};

// Save card metadata locally
const saveCardMetadata = async (submissionId, card, metadata) => {
  const cardDir = path.join(SUBMISSIONS_DIR, submissionId, `card-${card.card_number}`);
  await ensureDir(cardDir);

  const cardData = {
    card_number: card.card_number,
    front_s3_url: card.front_s3_url,
    back_s3_url: card.back_s3_url,
    front_local_path: card.front_local_path,
    back_local_path: card.back_local_path,
    metadata: metadata || {},
  };

  await fs.writeFile(
    path.join(cardDir, 'card.json'),
    JSON.stringify(cardData, null, 2)
  );
};

// Delete submission folder
const deleteSubmissionFolder = async (submissionId) => {
  const submissionDir = path.join(SUBMISSIONS_DIR, submissionId);

  try {
    await fs.rm(submissionDir, { recursive: true, force: true });
  } catch (err) {
    console.error(`Error deleting submission folder ${submissionId}:`, err);
  }
};

// Delete card folder
const deleteCardFolder = async (submissionId, cardNumber) => {
  const cardDir = path.join(SUBMISSIONS_DIR, submissionId, `card-${cardNumber}`);

  try {
    await fs.rm(cardDir, { recursive: true, force: true });
  } catch (err) {
    console.error(`Error deleting card folder:`, err);
  }
};

// List local submissions
const listLocalSubmissions = async () => {
  try {
    await ensureDir(SUBMISSIONS_DIR);
    const entries = await fs.readdir(SUBMISSIONS_DIR, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  } catch (err) {
    console.error('Error listing local submissions:', err);
    return [];
  }
};

// Load submission from local folder
const loadSubmission = async (submissionId) => {
  const metadataPath = path.join(SUBMISSIONS_DIR, submissionId, 'submission.json');

  try {
    const data = await fs.readFile(metadataPath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return null;
  }
};

// Load all cards for a submission
const loadSubmissionCards = async (submissionId) => {
  const submissionDir = path.join(SUBMISSIONS_DIR, submissionId);
  const cards = [];

  try {
    const entries = await fs.readdir(submissionDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('card-')) {
        const cardJsonPath = path.join(submissionDir, entry.name, 'card.json');
        try {
          const data = await fs.readFile(cardJsonPath, 'utf-8');
          cards.push(JSON.parse(data));
        } catch (err) {
          console.error(`Error loading card ${entry.name}:`, err);
        }
      }
    }
  } catch (err) {
    console.error(`Error loading submission cards:`, err);
  }

  return cards;
};

// Get local submission directory path
const getSubmissionPath = (submissionId) => {
  return path.join(SUBMISSIONS_DIR, submissionId);
};

module.exports = {
  SUBMISSIONS_DIR,
  ensureDir,
  saveSubmissionMetadata,
  saveCardImage,
  saveCardMetadata,
  deleteSubmissionFolder,
  deleteCardFolder,
  listLocalSubmissions,
  loadSubmission,
  loadSubmissionCards,
  getSubmissionPath,
};
