/**
 * server/index.js
 * Express entry point.
 */

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const cookieParser = require('cookie-parser');
const path       = require('path');

const app = express();

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin:      process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));  // Jeff JSON can be large
app.use(cookieParser());

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/pilots',        require('./routes/pilots'));
app.use('/api/xp',            require('./routes/xp').router);
app.use('/api/units',         require('./routes/units'));
app.use('/api/repairs',       require('./routes/repairs'));
app.use('/api/accounting',    require('./routes/accounting').router);
app.use('/api/contracts',     require('./routes/contracts'));
app.use('/api/play',          require('./routes/playmode'));
app.use('/api/salvage',       require('./routes/salvage'));
app.use('/api/notifications', require('./routes/notifications'));

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use('/api/*', (_, res) => res.status(404).json({ error: 'Not found' }));

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API server running on port ${PORT}`));
