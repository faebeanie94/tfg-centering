const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('Supabase database credentials not fully configured');
}

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

class SupabasePool {
  async query(sql, params = []) {
    if (!supabase) {
      throw new Error('Supabase client not initialized');
    }

    try {
      // Replace $1, $2, etc. with actual values
      let processedSql = sql;
      params.forEach((param, index) => {
        const placeholder = `$${index + 1}`;
        const value = param === null ? 'null' : `'${String(param).replace(/'/g, "''")}'`;
        processedSql = processedSql.replace(placeholder, value);
      });

      const { data, error } = await supabase.rpc('execute_sql', {
        sql_query: processedSql
      });

      if (error) {
        throw error;
      }

      return {
        rows: Array.isArray(data) ? data : (data ? [data] : []),
        rowCount: Array.isArray(data) ? data.length : (data ? 1 : 0)
      };
    } catch (err) {
      console.error('Supabase query error:', err);
      throw err;
    }
  }

  async end() {
    // Supabase client doesn't need explicit closing
  }

  on(event, callback) {
    // Emulate pg pool events
    if (event === 'error') {
      // Handle errors if needed
    }
  }
}

// Create pool instance
const pool = new SupabasePool();

module.exports = { pool };
