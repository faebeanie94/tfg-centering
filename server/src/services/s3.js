const { Storage } = require('@google-cloud/storage');

// Handle GCP credentials from env var (as JSON string) or file
let storageConfig = {
  projectId: process.env.GCP_PROJECT_ID,
};

if (process.env.GCP_KEY_FILE) {
  // Check if it's JSON content or a file path
  if (process.env.GCP_KEY_FILE.startsWith('{')) {
    // It's JSON content, parse it
    try {
      storageConfig.credentials = JSON.parse(process.env.GCP_KEY_FILE);
    } catch (err) {
      console.error('Failed to parse GCP_KEY_FILE as JSON:', err);
      storageConfig.keyFilename = process.env.GCP_KEY_FILE;
    }
  } else {
    // It's a file path
    storageConfig.keyFilename = process.env.GCP_KEY_FILE;
  }
}

const storage = new Storage(storageConfig);

const BUCKET_NAME = process.env.GCS_BUCKET;
const bucket = storage.bucket(BUCKET_NAME);

// Upload image to Google Cloud Storage
const uploadImage = async (fileBuffer, fileName, submissionId, cardNumber, side) => {
  if (!fileBuffer) return null;

  const filename = `submissions/${submissionId}/card-${cardNumber}/${side}.jpg`;

  try {
    const file = bucket.file(filename);
    await file.save(fileBuffer, { metadata: { contentType: 'image/jpeg' } });
    const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${filename}`;
    return publicUrl;
  } catch (err) {
    console.error(`Error uploading ${side} image to GCS:`, err);
    throw new Error(`Failed to upload ${side} image to GCS`);
  }
};

// Delete image from Google Cloud Storage
const deleteImage = async (url) => {
  if (!url) return;

  try {
    const filename = url.replace(`https://storage.googleapis.com/${BUCKET_NAME}/`, '');
    const file = bucket.file(filename);
    await file.delete();
  } catch (err) {
    console.error('Error deleting image from GCS:', err);
  }
};

// Generate presigned URL for downloading
const getPresignedUrl = async (submissionId, cardNumber, side) => {
  const filename = `submissions/${submissionId}/card-${cardNumber}/${side}.jpg`;

  try {
    const file = bucket.file(filename);
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 3600 * 1000,
    });
    return url;
  } catch (err) {
    console.error('Error generating presigned URL:', err);
    return null;
  }
};

// List objects for a submission
const listSubmissionImages = async (submissionId) => {
  try {
    const prefix = `submissions/${submissionId}/`;
    const [files] = await bucket.getFiles({ prefix });
    return files.map(file => ({ Key: file.name }));
  } catch (err) {
    console.error('Error listing submission images:', err);
    return [];
  }
};

// Delete all images for a submission
const deleteSubmissionImages = async (submissionId) => {
  try {
    const files = await listSubmissionImages(submissionId);

    if (files.length === 0) return;

    await Promise.all(
      files.map(file => bucket.file(file.Key).delete().catch(err => {
        console.error(`Error deleting ${file.Key}:`, err);
      }))
    );
  } catch (err) {
    console.error('Error deleting submission images:', err);
  }
};

module.exports = {
  uploadImage,
  deleteImage,
  getPresignedUrl,
  listSubmissionImages,
  deleteSubmissionImages,
};
