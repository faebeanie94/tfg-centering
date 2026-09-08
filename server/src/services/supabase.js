const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase credentials not configured');
}

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const BUCKET_NAME = 'tfg-submissions';

async function ensureBucket() {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.storage.getBucket(BUCKET_NAME);
    if (error && error.statusCode === 404) {
      const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, { public: true });
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
    console.warn('Supabase not configured');
    return null;
  }
  try {
    const bucketReady = await ensureBucket();
    if (!bucketReady) throw new Error('Storage bucket not available');

    const filePath = `${submissionId}/card-${cardNumber}/${side}.jpg`;
    console.log(`Uploading ${side} image: ${filePath} (${fileBuffer.length} bytes)`);
    const { data, error } = await supabase.storage.from(BUCKET_NAME).upload(filePath, fileBuffer, { upsert: true });

    if (error) throw error;

    const { data: publicData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
    console.log(`✅ Uploaded ${side} image for card ${cardNumber}: ${publicData.publicUrl}`);
    return publicData.publicUrl;
  } catch (err) {
    console.error(`Error uploading ${side} image:`, err);
    throw err;
  }
}

async function deleteImage(imageUrl) {
  if (!supabase) return true;
  try {
    const urlParts = imageUrl.split(`/${BUCKET_NAME}/`);
    if (urlParts.length !== 2) {
      console.warn('Cannot parse image URL:', imageUrl);
      return false;
    }
    const filePath = urlParts[1].split('?')[0];
    const { error } = await supabase.storage.from(BUCKET_NAME).remove([filePath]);
    if (error) {
      console.error('Failed to delete image:', error);
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
    const { data, error } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
    if (error) {
      console.error('Failed to get public URL:', error);
      return null;
    }
    return data.publicUrl;
  } catch (err) {
    console.error('Error getting public URL:', err);
    return null;
  }
}

module.exports = {
  uploadImage,
  deleteImage,
  getPresignedUrl,
  ensureBucket,
};
