const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase credentials not configured');
}

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const BUCKET_NAME = 'tfg-submissions';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

async function ensureBucket() {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.storage.getBucket(BUCKET_NAME);
    if (error && error.statusCode === 404) {
      const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, { public: false });
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

function imagePath(submissionId, cardNumber, side) {
  return `${submissionId}/card-${cardNumber}/${side}.jpg`;
}

// Returns the URL stored on the card row. It records where the image is but
// can't be opened in a private bucket: readers need a signed URL.
async function uploadImage(fileBuffer, fileName, submissionId, cardNumber, side) {
  if (!supabase) {
    console.warn('Supabase not configured');
    return null;
  }
  try {
    const bucketReady = await ensureBucket();
    if (!bucketReady) throw new Error('Storage bucket not available');

    const filePath = imagePath(submissionId, cardNumber, side);
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

// Storage has no recursive list. Folders come back with a null id.
async function listFiles(prefix) {
  const pageSize = 1000;
  const files = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list(prefix, { limit: pageSize, offset });
    if (error) throw error;

    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id) files.push(path);
      else files.push(...(await listFiles(path)));
    }
    if (data.length < pageSize) return files;
  }
}

// Returns false if anything may be left behind. Safe to call again after that.
async function deleteSubmissionImages(submissionId) {
  if (!supabase) return true;
  try {
    const files = await listFiles(submissionId);
    for (let i = 0; i < files.length; i += 1000) {
      const { error } = await supabase.storage.from(BUCKET_NAME).remove(files.slice(i, i + 1000));
      if (error) throw error;
    }
    return true;
  } catch (err) {
    console.error(`Failed to delete images for submission ${submissionId}:`, err);
    return false;
  }
}

async function getPresignedUrl(submissionId, cardNumber, side) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(imagePath(submissionId, cardNumber, side), SIGNED_URL_TTL_SECONDS);
    if (error) {
      console.error('Failed to sign image URL:', error);
      return null;
    }
    return data.signedUrl;
  } catch (err) {
    console.error('Error signing image URL:', err);
    return null;
  }
}

// Swaps the stored image URLs on card rows for signed ones, using one storage
// request however many cards there are. An image that can't be signed comes
// back as null, so a storage outage doesn't fail the card list: the app also
// uses that list to pick the next card number.
async function signCardImageUrls(submissionId, cards) {
  const signedUrls = new Map();
  const paths = cards.flatMap((card) => [
    ...(card.front_image_url ? [imagePath(submissionId, card.card_number, 'front')] : []),
    ...(card.back_image_url ? [imagePath(submissionId, card.card_number, 'back')] : []),
  ]);

  if (supabase && paths.length > 0) {
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
      if (error) throw error;
      for (const { path, signedUrl } of data) signedUrls.set(path, signedUrl);
    } catch (err) {
      console.error(`Failed to sign image URLs for submission ${submissionId}:`, err);
    }
  }

  const signedUrl = (card, side) =>
    signedUrls.get(imagePath(submissionId, card.card_number, side)) || null;

  return cards.map((card) => ({
    ...card,
    front_image_url: signedUrl(card, 'front'),
    back_image_url: signedUrl(card, 'back'),
  }));
}

module.exports = {
  uploadImage,
  deleteImage,
  deleteSubmissionImages,
  getPresignedUrl,
  signCardImageUrls,
  ensureBucket,
};
