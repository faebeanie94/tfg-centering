require('dotenv').config();
const { Storage } = require('@google-cloud/storage');
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

const GCS_BUCKET = 'tfg-submissions';
const SUPABASE_BUCKET = 'tfg-submissions';

// Initialize clients
const gcsStorage = new Storage({
  projectId: process.env.GCP_PROJECT_ID,
  keyFilename: process.env.GCP_KEY_FILE,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  console.log('🚀 Starting GCS to Supabase migration...\n');

  try {
    // Get all cards from database
    const result = await pool.query(
      'SELECT id, submission_id, card_number, front_s3_url, back_s3_url FROM cards WHERE front_s3_url IS NOT NULL OR back_s3_url IS NOT NULL'
    );

    console.log(`📊 Found ${result.rows.length} cards to migrate\n`);

    let migratedCount = 0;

    for (const card of result.rows) {
      console.log(`\n📦 Migrating card ${card.card_number} (ID: ${card.id})...`);

      let frontUrl = null;
      let backUrl = null;

      // Migrate front image
      if (card.front_s3_url) {
        try {
          console.log('  ⬇️  Downloading front image from GCS...');
          const gcsBucket = gcsStorage.bucket(GCS_BUCKET);
          const gcsFile = gcsBucket.file(card.front_s3_url);

          // Check if file exists
          const [exists] = await gcsFile.exists();
          if (!exists) {
            console.warn(`  ⚠️  Front image not found in GCS: ${card.front_s3_url}`);
          } else {
            const buffer = await gcsFile.download();

            console.log('  ⬆️  Uploading front image to Supabase...');
            const supabasePath = `${card.submission_id}/card-${card.card_number}/front.jpg`;

            const { error: uploadError } = await supabase.storage
              .from(SUPABASE_BUCKET)
              .upload(supabasePath, buffer[0], {
                cacheControl: '3600',
                upsert: true,
              });

            if (uploadError) {
              console.error(`  ❌ Failed to upload front image:`, uploadError);
            } else {
              const { data } = supabase.storage
                .from(SUPABASE_BUCKET)
                .getPublicUrl(supabasePath);
              frontUrl = data.publicUrl;
              console.log('  ✅ Front image migrated');
            }
          }
        } catch (err) {
          console.error(`  ❌ Error migrating front image:`, err.message);
        }
      }

      // Migrate back image
      if (card.back_s3_url) {
        try {
          console.log('  ⬇️  Downloading back image from GCS...');
          const gcsBucket = gcsStorage.bucket(GCS_BUCKET);
          const gcsFile = gcsBucket.file(card.back_s3_url);

          const [exists] = await gcsFile.exists();
          if (!exists) {
            console.warn(`  ⚠️  Back image not found in GCS: ${card.back_s3_url}`);
          } else {
            const buffer = await gcsFile.download();

            console.log('  ⬆️  Uploading back image to Supabase...');
            const supabasePath = `${card.submission_id}/card-${card.card_number}/back.jpg`;

            const { error: uploadError } = await supabase.storage
              .from(SUPABASE_BUCKET)
              .upload(supabasePath, buffer[0], {
                cacheControl: '3600',
                upsert: true,
              });

            if (uploadError) {
              console.error(`  ❌ Failed to upload back image:`, uploadError);
            } else {
              const { data } = supabase.storage
                .from(SUPABASE_BUCKET)
                .getPublicUrl(supabasePath);
              backUrl = data.publicUrl;
              console.log('  ✅ Back image migrated');
            }
          }
        } catch (err) {
          console.error(`  ❌ Error migrating back image:`, err.message);
        }
      }

      // Update database if either image was migrated
      if (frontUrl || backUrl) {
        try {
          await pool.query(
            `UPDATE cards SET
              front_s3_url = COALESCE($1, front_s3_url),
              back_s3_url = COALESCE($2, back_s3_url)
             WHERE id = $3`,
            [frontUrl, backUrl, card.id]
          );
          console.log('  💾 Database updated');
          migratedCount++;
        } catch (err) {
          console.error(`  ❌ Failed to update database:`, err.message);
        }
      }
    }

    console.log(`\n\n✨ Migration complete!`);
    console.log(`✅ Successfully migrated ${migratedCount}/${result.rows.length} cards\n`);

  } catch (error) {
    console.error('💥 Migration failed:', error);
  } finally {
    await pool.end();
  }
}

// Run migration
migrate();
