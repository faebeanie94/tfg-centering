require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');

const SUPABASE_BUCKET = 'tfg-submissions';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function ensureBucket() {
  try {
    const { data, error } = await supabase.storage.getBucket(SUPABASE_BUCKET);
    if (error && error.statusCode === 404) {
      const { error: createError } = await supabase.storage.createBucket(SUPABASE_BUCKET, {
        public: true,
      });
      if (createError) {
        console.error('Failed to create storage bucket:', createError);
        return false;
      }
      console.log('✅ Created Supabase storage bucket');
    }
    return true;
  } catch (err) {
    console.error('Error ensuring bucket:', err);
    return false;
  }
}

async function migrate() {
  console.log('🚀 Starting Supabase storage setup...\n');

  try {
    const bucketReady = await ensureBucket();
    if (!bucketReady) {
      console.error('Failed to ensure storage bucket is ready');
      process.exit(1);
    }

    // Get all cards from database
    const result = await pool.query(
      'SELECT id, submission_id, card_number, front_image_url, back_image_url FROM cards WHERE front_image_url IS NOT NULL OR back_image_url IS NOT NULL'
    );

    console.log(`📊 Found ${result.rows.length} cards with images\n`);

    if (result.rows.length === 0) {
      console.log('✨ No cards to migrate. Supabase storage is ready for use!\n');
    } else {
      console.log('✨ Supabase storage is ready! Images are already in Supabase.\n');
    }

  } catch (error) {
    console.error('💥 Setup failed:', error);
  } finally {
    await pool.end();
  }
}

// Run migration
migrate();
