'use strict';
require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');

const authRoutes         = require('./routes/auth');
const billingRoutes      = require('./routes/billing');
const processesRoutes    = require('./routes/processes');
const measurementsRoutes = require('./routes/measurements');
const analysisRoutes     = require('./routes/analysis');
const usersRoutes        = require('./routes/users');

const app = express();

// ── CORS ───────────────────────────────────────────────────────────────────
const _extraOrigins = (process.env.FRONTEND_URL || '')
  .split(',').map(o => o.trim()).filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    // Peticiones sin origin (Postman, curl, mobile)
    if (!origin) return cb(null, true);

    // Localhost en cualquier puerto
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);

    // Túneles ngrok (.ngrok-free.app, .ngrok.io, etc.)
    if (/\.ngrok(-free)?\.app$/.test(origin) || /\.ngrok\.io$/.test(origin)) return cb(null, true);

    // Despliegues de Vercel (.vercel.app y previews de PR)
    if (/\.vercel\.app$/.test(origin)) return cb(null, true);

    // Orígenes extra configurados en FRONTEND_URL
    if (_extraOrigins.some(o => origin.startsWith(o))) return cb(null, true);

    cb(new Error(`Origen no permitido por CORS: ${origin}`));
  },
  credentials: true,
  // Permite que el cliente (ngrok) envíe este header sin que CORS lo bloquee
  allowedHeaders: ['Authorization', 'Content-Type', 'ngrok-skip-browser-warning']
}));

// ── Stripe webhook necesita body raw ──────────────────────────────────────
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

// ── Body parsers ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting en autenticación ────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intente de nuevo en un minuto.' }
});
app.use('/api/auth/login',    authLimiter);
app.use('/api/auth/register', authLimiter);

// ── Rutas ─────────────────────────────────────────────────────────────────
app.use('/api/auth',         authRoutes);
app.use('/api/billing',      billingRoutes);
app.use('/api/processes',    processesRoutes);
app.use('/api/measurements', measurementsRoutes);
app.use('/api/analysis',     analysisRoutes);
app.use('/api/users',        usersRoutes);

// ── Health check ──────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── 404 para rutas /api no existentes (devuelve JSON, no HTML) ────────────
app.use('/api', (req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
});

// ── Manejador de errores global ───────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('Error no manejado:', err);
  // CORS errors
  if (err.message && err.message.startsWith('Origen no permitido')) {
    return res.status(403).json({ error: err.message });
  }
  res.status(500).json({ error: 'Error interno del servidor.' });
});

// ── Inicio ────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor SPC SaaS escuchando en puerto ${PORT}`);
  console.log(`   Entorno: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
