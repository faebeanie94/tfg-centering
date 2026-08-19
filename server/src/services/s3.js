const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3Client = new S3Client({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  region: process.env.AWS_REGION,
});

const BUCKET = process.env.S3_BUCKET;

// Upload image to S3
const uploadImage = async (fileBuffer, fileName, submissionId, cardNumber, side) => {
  if (!fileBuffer) return null;

  const key = `submissions/${submissionId}/card-${cardNumber}/${side}.jpg`;

  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: 'image/jpeg',
      ACL: 'private',
    });

    const result = await s3Client.send(command);
    return `https://${BUCKET}.s3.amazonaws.com/${key}`;
  } catch (err) {
    console.error(`Error uploading ${side} image to S3:`, err);
    throw new Error(`Failed to upload ${side} image to S3`);
  }
};

// Delete image from S3
const deleteImage = async (url) => {
  if (!url) return;

  try {
    const key = url.replace(`https://${BUCKET}.s3.amazonaws.com/`, '');
    const command = new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    });
    await s3Client.send(command);
  } catch (err) {
    console.error('Error deleting image from S3:', err);
  }
};

// Generate presigned URL for downloading
const getPresignedUrl = async (submissionId, cardNumber, side) => {
  const key = `submissions/${submissionId}/card-${cardNumber}/${side}.jpg`;

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    });
    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    return url;
  } catch (err) {
    console.error('Error generating presigned URL:', err);
    return null;
  }
};

// List objects for a submission
const listSubmissionImages = async (submissionId) => {
  try {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: `submissions/${submissionId}/`,
    });
    const result = await s3Client.send(command);
    return result.Contents || [];
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

    const command = new DeleteObjectsCommand({
      Bucket: BUCKET,
      Delete: {
        Objects: files.map(file => ({ Key: file.Key })),
      },
    });

    await s3Client.send(command);
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
