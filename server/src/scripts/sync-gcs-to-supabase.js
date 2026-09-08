require('dotenv').config();
const { Storage } = require('@google-cloud/storage');
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
const path = require('path');

// Increase event listener limit for large file operations
require('events').EventEmitter.defaultMaxListeners = 100;

const GCS_BUCKET = 'tfg-submissions';
const SUPABASE_BUCKET = 'tfg-submissions';

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Initialize GCS
let gcsStorageConfig = { projectId: process.env.GCP_PROJECT_ID };

if (process.env.GCP_CREDENTIALS) {
  try {
    gcsStorageConfig.credentials = JSON.parse(process.env.GCP_CREDENTIALS);
  } catch (e) {
    console.error('Failed to parse GCP_CREDENTIALS:', e.message);
    process.exit(1);
  }
} else if (process.env.GCP_KEY_FILE) {
  gcsStorageConfig.keyFilename = path.resolve(process.env.GCP_KEY_FILE);
}

const gcsStorage = new Storage(gcsStorageConfig);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function getExistingSubmissions() {
  try {
    const result = await pool.query('SELECT id FROM submissions');
    const submissionMap = {};
    result.rows.forEach(row => {
      submissionMap[row.id] = true;
    });
    return submissionMap;
  } catch (err) {
    console.error('Error getting existing submissions:', err);
    return {};
  }
}

async function createSubmissionIfNeeded(submissionId) {
  try {
    await pool.query(
      'INSERT INTO submissions (id, name, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) ON CONFLICT (id) DO NOTHING',
      [submissionId, `Submission ${submissionId.slice(0, 8)}`]
    );
  } catch (err) {
    console.error(`Error creating submission ${submissionId}:`, err);
  }
}

async function createCardIfNeeded(submissionId, cardNumber) {
  try {
    await pool.query(
      `INSERT INTO cards (submission_id, card_number, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (submission_id, card_number) DO NOTHING`,
      [submissionId, cardNumber]
    );
  } catch (err) {
    console.error(`Error creating card ${submissionId}/${cardNumber}:`, err);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function migrate() {
  console.log('🚀 Starting GCS scan and Supabase migration...\n');

  try {
    // Get all files from GCS
    const gcsBucket = gcsStorage.bucket(GCS_BUCKET);
    const [files] = await gcsBucket.getFiles();

    console.log(`📊 Found ${files.length} images in GCS\n`);

    // Parse files and group by submission
    const submissions = {};
    files.forEach(file => {
      // Parse: submissions/UUID/card-NUMBER/SIDE.jpg
      const parts = file.name.split('/');
      if (parts.length === 4) {
        const submissionId = parts[1];
        const cardMatch = parts[2].match(/card-(\d+)/);
        const side = parts[3].split('.')[0];

        if (cardMatch) {
          const cardNumber = parseInt(cardMatch[1]);
          if (!submissions[submissionId]) {
            submissions[submissionId] = {};
          }
          if (!submissions[submissionId][cardNumber]) {
            submissions[submissionId][cardNumber] = {};
          }
          submissions[submissionId][cardNumber][side] = file.name;
        }
      }
    });

    console.log(`📂 Organized into ${Object.keys(submissions).length} submissions\n`);

    let totalMigrated = 0;

    // Process each submission
    for (const submissionId of Object.keys(submissions)) {
      console.log(`\n📦 Processing submission ${submissionId.slice(0, 8)}...`);

      // Create submission if needed
      await createSubmissionIfNeeded(submissionId);

      const cards = submissions[submissionId];

      // Process each card
      for (const cardNumber of Object.keys(cards).sort((a, b) => parseInt(a) - parseInt(b))) {
        const cardNum = parseInt(cardNumber);
        const sides = cards[cardNumber];

        // Create card record
        await createCardIfNeeded(submissionId, cardNum);

        let frontUrl = null;
        let backUrl = null;

        // Migrate front image
        if (sides.front) {
          try {
            const gcsFile = gcsBucket.file(sides.front);
            const buffer = await gcsFile.download();

            const supabasePath = `${submissionId}/card-${cardNum}/front.jpg`;
            const { error: uploadError } = await supabase.storage
              .from(SUPABASE_BUCKET)
              .upload(supabasePath, buffer[0], { upsert: true });

            if (!uploadError) {
              const { data } = supabase.storage
                .from(SUPABASE_BUCKET)
                .getPublicUrl(supabasePath);
              frontUrl = data.publicUrl;
            }
          } catch (err) {
            console.error(`  ❌ Error migrating front image for card ${cardNum}:`, err.message);
          }
        }

        // Migrate back image
        if (sides.back) {
          try {
            const gcsFile = gcsBucket.file(sides.back);
            const buffer = await gcsFile.download();

            const supabasePath = `${submissionId}/card-${cardNum}/back.jpg`;
            const { error: uploadError } = await supabase.storage
              .from(SUPABASE_BUCKET)
              .upload(supabasePath, buffer[0], { upsert: true });

            if (!uploadError) {
              const { data } = supabase.storage
                .from(SUPABASE_BUCKET)
                .getPublicUrl(supabasePath);
              backUrl = data.publicUrl;
            }
          } catch (err) {
            console.error(`  ❌ Error migrating back image for card ${cardNum}:`, err.message);
          }
        }

        // Update database with Supabase URLs
        if (frontUrl || backUrl) {
          try {
            await pool.query(
              `UPDATE cards SET
                front_image_url = COALESCE($1, front_image_url),
                back_image_url = COALESCE($2, back_image_url),
                updated_at = NOW()
               WHERE submission_id = $3 AND card_number = $4`,
              [frontUrl, backUrl, submissionId, cardNum]
            );
            totalMigrated++;
          } catch (err) {
            console.error(`  ❌ Failed to update database for card ${cardNum}:`, err.message);
          }
        }

        // Small delay to avoid rate limiting
        await sleep(100);
      }
    }

    console.log(`\n\n✨ Migration complete!`);
    console.log(`✅ Successfully migrated ${totalMigrated} cards\n`);

  } catch (error) {
    console.error('💥 Migration failed:', error);
  } finally {
    await pool.end();
  }
}

// Run migration
migrate();
