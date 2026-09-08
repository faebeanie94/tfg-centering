require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const SUPABASE_BUCKET = 'tfg-submissions';
const tempDir = path.join(os.tmpdir(), 'gcs-migration');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Create temp directory
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadFromGCS(gsPath) {
  const tempFile = path.join(tempDir, path.basename(gsPath));
  try {
    execSync(`gsutil cp gs://tfg-submissions/${gsPath} ${tempFile}`, { stdio: 'pipe' });
    return tempFile;
  } catch (err) {
    console.error(`Failed to download ${gsPath}:`, err.message);
    return null;
  }
}

async function uploadToSupabase(filePath, submissionId, cardNumber, side) {
  try {
    const buffer = fs.readFileSync(filePath);
    const supabasePath = `${submissionId}/card-${cardNumber}/${side}.jpg`;

    const { error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(supabasePath, buffer, { upsert: true });

    if (error) throw error;

    const { data } = supabase.storage
      .from(SUPABASE_BUCKET)
      .getPublicUrl(supabasePath);

    return data.publicUrl;
  } catch (err) {
    console.error(`Failed to upload to Supabase:`, err.message);
    return null;
  }
}

async function migrate() {
  console.log('🚀 Starting GCS to Supabase migration with gsutil...\n');

  try {
    // Get all submissions from GCS
    const submissions = {};
    try {
      const output = execSync('gsutil ls gs://tfg-submissions/submissions/', { encoding: 'utf-8' });
      const submissionPaths = output.trim().split('\n').filter(line => line.includes('submissions/'));

      submissionPaths.forEach(subPath => {
        const match = subPath.match(/submissions\/([a-f0-9-]+)\//);
        if (match) {
          const submissionId = match[1];
          submissions[submissionId] = true;
        }
      });
    } catch (err) {
      console.error('Error listing submissions:', err.message);
      return;
    }

    const submissionIds = Object.keys(submissions);
    console.log(`📊 Found ${submissionIds.length} submissions\n`);

    let totalMigrated = 0;

    for (const submissionId of submissionIds) {
      console.log(`\n📦 Processing submission ${submissionId.slice(0, 8)}...`);

      // Create submission if needed
      try {
        await pool.query(
          'INSERT INTO submissions (id, name, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) ON CONFLICT (id) DO NOTHING',
          [submissionId, `Submission ${submissionId.slice(0, 8)}`]
        );
      } catch (err) {
        console.error(`Error creating submission:`, err.message);
      }

      // Get all files for this submission
      try {
        const output = execSync(`gsutil ls gs://tfg-submissions/submissions/${submissionId}/`, { encoding: 'utf-8' });
        const cardDirs = output.trim().split('\n').filter(line => line.includes('card-'));

        // Group files by card number
        const cards = {};
        cardDirs.forEach(cardPath => {
          const match = cardPath.match(/card-(\d+)\//);
          if (match) {
            const cardNumber = parseInt(match[1]);
            if (!cards[cardNumber]) {
              cards[cardNumber] = [];
            }
            cards[cardNumber].push(cardPath);
          }
        });

        // Process each card
        for (const cardNumber of Object.keys(cards).sort((a, b) => parseInt(a) - parseInt(b))) {
          const cardNum = parseInt(cardNumber);

          // Create card if needed
          try {
            await pool.query(
              `INSERT INTO cards (submission_id, card_number, created_at, updated_at)
               VALUES ($1, $2, NOW(), NOW())
               ON CONFLICT (submission_id, card_number) DO NOTHING`,
              [submissionId, cardNum]
            );
          } catch (err) {
            console.error(`Error creating card:`, err.message);
          }

          let frontUrl = null;
          let backUrl = null;

          // Download and upload front image
          try {
            const gsPath = `submissions/${submissionId}/card-${cardNum}/front.jpg`;
            const tempFile = await downloadFromGCS(gsPath);
            if (tempFile) {
              frontUrl = await uploadToSupabase(tempFile, submissionId, cardNum, 'front');
              fs.unlinkSync(tempFile);
            }
          } catch (err) {
            console.error(`Error with front image:`, err.message);
          }

          // Download and upload back image
          try {
            const gsPath = `submissions/${submissionId}/card-${cardNum}/back.jpg`;
            const tempFile = await downloadFromGCS(gsPath);
            if (tempFile) {
              backUrl = await uploadToSupabase(tempFile, submissionId, cardNum, 'back');
              fs.unlinkSync(tempFile);
            }
          } catch (err) {
            console.error(`Error with back image:`, err.message);
          }

          // Update database
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
              console.error(`Error updating database:`, err.message);
            }
          }

          await sleep(100);
        }
      } catch (err) {
        console.error(`Error processing submission:`, err.message);
      }
    }

    console.log(`\n\n✨ Migration complete!`);
    console.log(`✅ Successfully migrated ${totalMigrated} cards\n`);

  } catch (error) {
    console.error('💥 Migration failed:', error);
  } finally {
    // Cleanup
    try {
      execSync(`rm -rf ${tempDir}`);
    } catch (err) {
      // Ignore cleanup errors
    }
    await pool.end();
  }
}

// Run migration
migrate();
