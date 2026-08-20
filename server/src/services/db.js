const fs = require('fs');
const path = require('path');

function parseSQL(sql) {
  const statements = [];
  let current = '';
  let inDollarQuote = null;
  let i = 0;

  while (i < sql.length) {
    const char = sql[i];

    if (inDollarQuote) {
      current += char;
      // Check if we're at the start of the closing dollar quote
      if (sql.substr(i, inDollarQuote.length) === inDollarQuote) {
        // Add the rest of the dollar quote (we already added first char)
        if (inDollarQuote.length > 1) {
          current += sql.substr(i + 1, inDollarQuote.length - 1);
          i += inDollarQuote.length - 1;
        }
        inDollarQuote = null;
      }
    } else if (char === '$') {
      // Look for dollar quote pattern (e.g., $$, $tag$, etc.)
      let j = i + 1;
      while (j < sql.length && /[a-zA-Z0-9_]/.test(sql[j])) {
        j++;
      }
      if (j < sql.length && sql[j] === '$') {
        inDollarQuote = sql.substr(i, j - i + 1);
        current += inDollarQuote;
        i = j;
      } else {
        current += char;
      }
    } else if (char === ';') {
      current = current.trim();
      if (current.length > 0) {
        statements.push(current);
      }
      current = '';
    } else {
      current += char;
    }

    i++;
  }

  current = current.trim();
  if (current.length > 0) {
    statements.push(current);
  }

  return statements;
}

async function initializeDatabase(pool) {
  try {
    const migrationsPath = path.join(__dirname, '../../db/migrations.sql');
    const migrations = fs.readFileSync(migrationsPath, 'utf-8');

    // Parse SQL while respecting dollar-quoted strings
    const statements = parseSQL(migrations);

    for (const statement of statements) {
      await pool.query(statement);
    }

    console.log('Database migrations completed successfully');
  } catch (err) {
    console.error('Failed to run database migrations:', err.message);
    throw err;
  }
}

module.exports = { initializeDatabase };
