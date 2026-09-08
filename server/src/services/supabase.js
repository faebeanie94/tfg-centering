const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase credentials not configured - image uploads will be disabled');
}

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const BUCKET_NAME = 'tfg-submissions';

async function ensureBucket() {
  if (!supabase) return false;

  try {
    // Try to get bucket info
    const { data, error } = await supabase.storage.getBucket(BUCKET_NAME);
    if (error && error.statusCode === 404) {
      // Bucket doesn't exist, create it
      const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
      });
      if (createError) {
        console.error('Failed to create storage bucket:', createError);
        return false;
      }
    } else if (error) {
      console.error('Failed to check bucket:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Error ensuring bucket:', err);
    return false;
  }
}

async function uploadImage(fileBuffer, fileName, submissionId, cardNumber, side) {
  if (!supabase) {
    console.warn('Supabase not configured - skipping image upload');
    return null;
  }

  try {
    const bucketReady = await ensureBucket();
    if (!bucketReady) {
      throw new Error('Storage bucket not available');
    }

    const filePath = `${submissionId}/card-${cardNumber}/${side}.jpg`;

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, fileBuffer, {
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      throw error;
    }

    // Get public URL
    const { data: publicData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    return publicData.publicUrl;
  } catch (err) {
    console.error(`Error uploading ${side} image:`, err);
    throw err;
  }
}

async function deleteImage(imageUrl) {
  if (!supabase) return true;

  try {
    // Extract file path from public URL
    const urlParts = imageUrl.split(`/${BUCKET_NAME}/`);
    if (urlParts.length !== 2) {
      console.warn('Cannot parse image URL for deletion:', imageUrl);
      return false;
    }

    const filePath = urlParts[1].split('?')[0]; // Remove query params

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([filePath]);

    if (error) {
      console.error('Failed to delete image from storage:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error deleting image:', err);
    return false;
  }
}

async function getPresignedUrl(submissionId, cardNumber, side) {
  if (!supabase) return null;

  try {
    const filePath = `${submissionId}/card-${cardNumber}/${side}.jpg`;

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(filePath, 3600); // 1 hour expiry

    if (error) {
      console.error('Failed to create presigned URL:', error);
      return null;
    }

    return data.signedUrl;
  } catch (err) {
    console.error('Error creating presigned URL:', err);
    return null;
  }
}

module.exports = {
  uploadImage,
  deleteImage,
  getPresignedUrl,
  ensureBucket,
};
