const fs = require('fs');
const path = require('path');

function parseSQL(sql) {
  // Replace dollar-quoted strings with placeholders, split, then restore
  const dollarStrings = [];
  let processedSQL = sql;

  // Match dollar-quoted strings: $tag$...content...$tag$ (tag must match on both ends)
  const dollarQuoteRegex = /\$([a-zA-Z0-9_]*)\$[\s\S]*?\$\1\$/g;
  let match;

  // Replace all dollar-quoted strings with placeholders
  while ((match = dollarQuoteRegex.exec(sql)) !== null) {
    dollarStrings.push(match[0]);
  }

  // Sort by length descending to replace longer strings first
  dollarStrings.sort((a, b) => b.length - a.length);

  // Replace all dollar-quoted strings with placeholders
  dollarStrings.forEach((dollarStr, idx) => {
    processedSQL = processedSQL.replace(dollarStr, `__PLACEHOLDER_${idx}__`);
  });

  // Split on semicolons
  const statements = processedSQL
    .split(';')
    .map(stmt => {
      // Restore dollar-quoted strings
      let restored = stmt;
      dollarStrings.forEach((dollarStr, idx) => {
        restored = restored.replace(`__PLACEHOLDER_${idx}__`, dollarStr);
      });
      return restored.trim();
    })
    .filter(stmt => stmt.length > 0);

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
