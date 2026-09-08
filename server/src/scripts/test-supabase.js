require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function test() {
  try {
    console.log('Testing Supabase connection...\n');

    // Test 1: Check credentials
    console.log('1️⃣  Credentials:');
    console.log(`   URL: ${process.env.SUPABASE_URL}`);
    console.log(`   Key length: ${process.env.SUPABASE_SERVICE_KEY.length}`);
    console.log(`   Key starts with: ${process.env.SUPABASE_SERVICE_KEY.slice(0, 20)}...`);

    // Test 2: List buckets
    console.log('\n2️⃣  Listing buckets...');
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    if (bucketsError) {
      console.error('   ❌ Error:', bucketsError.message);
    } else {
      console.log(`   ✅ Found ${buckets.length} buckets`);
      buckets.forEach(b => console.log(`      - ${b.name}`));
    }

    // Test 3: Upload test file
    console.log('\n3️⃣  Testing upload...');
    const testBuffer = Buffer.from('test content');
    const { data, error } = await supabase.storage
      .from('tfg-submissions')
      .upload('test-migration/test.txt', testBuffer, { upsert: true });

    if (error) {
      console.error('   ❌ Error:', error.message);
      console.error('   Full error:', error);
    } else {
      console.log('   ✅ Upload successful');
      console.log(`   Path: ${data.path}`);

      // Try to delete it
      const { error: deleteError } = await supabase.storage
        .from('tfg-submissions')
        .remove(['test-migration/test.txt']);

      if (!deleteError) {
        console.log('   ✅ Cleanup successful');
      }
    }

    console.log('\n✨ All tests complete!');
  } catch (err) {
    console.error('\n❌ Unexpected error:', err.message);
    console.error(err);
  }
}

test();
