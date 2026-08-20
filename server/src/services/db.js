const fs = require('fs');
const path = require('path');

function parseSQL(sql) {
  // Replace dollar-quoted strings with placeholders, split, then restore
  const dollarStrings = [];

  // Match dollar-quoted strings: $tag$...content...$tag$ (tag must match on both ends)
  const processedSQL = sql.replace(/\$([a-zA-Z0-9_]*)\$[\s\S]*?\$\1\$/g, (match) => {
    dollarStrings.push(match);
    return `__PLACEHOLDER_${dollarStrings.length - 1}__`;
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
