require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const path = require('path');
const { Pool } = require('pg');
const { errorHandler } = require('./middleware/errorHandler');
const { initializeDatabase } = require('./services/db');

const app = express();
const PORT = process.env.PORT || 3001;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// Initialize database (run migrations)
initializeDatabase(pool).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

// Export pool early to avoid circular dependency issues
module.exports = { app, pool };

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(fileUpload({ limits: { fileSize: 50 * 1024 * 1024 } }));

// Serve static frontend files (in production)
const frontendPath = path.join(__dirname, '../dist');
app.use((req, res, next) => {
  // Cache static assets permanently (they have hash in filename)
  if (req.path.startsWith('/assets/')) {
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
  } else {
    // Don't cache HTML files - always fetch fresh
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});
app.use(express.static(frontendPath));

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', database: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', database: 'disconnected', error: err.message });
  }
});

// Mount API routes
app.use('/api', require('./api/routes'));

// SPA fallback - serve index.html for non-API routes (before error handler)
app.use((req, res, next) => {
  // Check if it's an API request that wasn't handled
  if (req.path.startsWith('/api')) {
    return next();
  }

  const indexPath = path.join(frontendPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error('Error serving index.html:', err);
      next(err);
    }
  });
});

// Error handler (must be last)
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    pool.end(() => {
      console.log('Pool ended');
      process.exit(0);
    });
  });
});
