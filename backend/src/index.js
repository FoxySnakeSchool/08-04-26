require('dotenv').config();

const express = require('express');
const cors    = require('cors');

const { demarrerCrons } = require('./cron');

const marchesRoutes       = require('./routes/marches');
const logsRoutes          = require('./routes/logs');
const adminRoutes         = require('./routes/admin');
const dashboardRoutes     = require('./routes/dashboard');
const notificationsRoutes = require('./routes/notifications');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middlewares ──────────────────────────────────────────────────────────────
app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/marches',    marchesRoutes);
app.use('/api/logs',       logsRoutes);
app.use('/api/admin',      adminRoutes);
app.use('/api/dashboard',      dashboardRoutes);
app.use('/api/notifications',  notificationsRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

// 404 catch-all
app.use((req, res) => res.status(404).json({ error: 'Route introuvable.' }));

// ── Démarrage ────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[SERVER] Backend démarré sur http://localhost:${PORT}`);
  demarrerCrons();
});
