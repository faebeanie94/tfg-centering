const fs = require('fs');
const path = require('path');

function parseSQL(sql) {
  const statements = [];
  let current = '';
  let inDollarQuote = false;
  let i = 0;

  while (i < sql.length) {
    // Check for dollar quote markers
    if (!inDollarQuote && sql[i] === '$' && sql[i + 1] === '$') {
      current += '$$';
      i += 2;
      inDollarQuote = true;
    } else if (inDollarQuote && sql[i] === '$' && sql[i + 1] === '$') {
      current += '$$';
      i += 2;
      inDollarQuote = false;
    } else if (!inDollarQuote && sql[i] === ';') {
      // Only treat as statement terminator outside dollar quotes
      current = current.trim();
      if (current.length > 0) {
        statements.push(current);
      }
      current = '';
      i++;
    } else {
      current += sql[i];
      i++;
    }
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
    console.log(`Parsed ${statements.length} SQL statements`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      try {
        await pool.query(statement);
      } catch (err) {
        console.error(`Failed on statement ${i + 1}/${statements.length}:`);
        console.error(statement.substring(0, 300));
        console.error('Error:', err.message);
        throw err;
      }
    }

    console.log('Database migrations completed successfully');
  } catch (err) {
    console.error('Failed to run database migrations:', err.message);
    throw err;
  }
}

module.exports = { initializeDatabase };
