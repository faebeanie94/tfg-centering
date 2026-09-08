require('dotenv').config();
const { Storage } = require('@google-cloud/storage');
const path = require('path');

let gcsStorageConfig = { projectId: process.env.GCP_PROJECT_ID };

if (process.env.GCP_KEY_FILE) {
  gcsStorageConfig.keyFilename = path.resolve(process.env.GCP_KEY_FILE);
}

const storage = new Storage(gcsStorageConfig);
const bucket = storage.bucket('tfg-submissions');

async function test() {
  try {
    console.log('Testing GCS access...\n');

    // Test 1: Get bucket info
    console.log('1️⃣  Getting bucket info...');
    const [metadata] = await bucket.getMetadata();
    console.log(`   ✅ Bucket exists: ${metadata.name}`);

    // Test 2: List files
    console.log('\n2️⃣  Listing files...');
    const [files] = await bucket.getFiles({ maxResults: 1 });
    console.log(`   ✅ Can list files (found ${files.length})`);

    // Test 3: Try downloading a file
    console.log('\n3️⃣  Downloading a test file...');
    const file = files[0];
    console.log(`   Attempting to download: ${file.name}`);
    const buffer = await file.download();
    console.log(`   ✅ Downloaded ${buffer[0].length} bytes`);

    console.log('\n✨ All tests passed! GCS access is working.');
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    console.error('\nFull error:', err);
  }
}

test();
