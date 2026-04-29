const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const stripe  = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db      = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const SALT_ROUNDS = 12;

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { company_name, name, email, password } = req.body;

  // ── 1. Validaciones sincrónicas — fallar rápido antes de cualquier trabajo ──
  if (!company_name || !name || !email || !password) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  }
  if (!process.env.JWT_SECRET) {
    console.error('FATAL: JWT_SECRET no está definido en las variables de entorno.');
    return res.status(500).json({ error: 'Error de configuración del servidor.' });
  }

  // ── 2. bcrypt ANTES de abrir la transacción ───────────────────────────────
  // Es costoso en CPU (~300 ms con 12 rounds). Mantenerlo dentro de una
  // transacción bloquea la conexión a la BD innecesariamente.
  let hash;
  try {
    hash = await bcrypt.hash(password, SALT_ROUNDS);
  } catch (err) {
    console.error('Error hasheando contraseña:', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }

  // ── 3. Stripe ANTES de abrir la transacción ───────────────────────────────
  // Llamada a servicio externo: puede tardar segundos o fallar. No debe
  // mantener una conexión a PostgreSQL abierta mientras espera.
  let stripeCustomerId = null;
  try {
    const customer = await stripe.customers.create({
      email: email.toLowerCase(),
      name: company_name,
      metadata: { company_name }
    });
    stripeCustomerId = customer.id;
  } catch (stripeErr) {
    console.warn('Stripe no disponible (modo desarrollo):', stripeErr.message);
    // Continuar sin Stripe; la suscripción quedará inactiva hasta activarla.
  }

  // ── 4. Transacción atómica: solo operaciones de BD ────────────────────────
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Verificar email dentro de la transacción para evitar race conditions
    const existing = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    if (existing.rows.length) {
      await client.query('ROLLBACK');
      // Limpiar el cliente de Stripe que acabamos de crear
      if (stripeCustomerId) {
        stripe.customers.del(stripeCustomerId).catch(e =>
          console.warn('No se pudo eliminar cliente Stripe huérfano:', e.message)
        );
      }
      return res.status(409).json({ error: 'El email ya está registrado.' });
    }

    const companyResult = await client.query(
      `INSERT INTO companies (name, email, stripe_customer_id, subscription_status)
       VALUES ($1, $2, $3, 'inactive') RETURNING id`,
      [company_name, email.toLowerCase(), stripeCustomerId]
    );
    const company_id = companyResult.rows[0].id;

    const userResult = await client.query(
      `INSERT INTO users (company_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'admin') RETURNING id, name, email, role`,
      [company_id, name, email.toLowerCase(), hash]
    );

    await client.query('COMMIT');

    // ── 5. JWT después del COMMIT ─────────────────────────────────────────
    // jwt.sign() es síncrono y no puede fallar: ya validamos JWT_SECRET arriba
    // y payload/opciones son constantes del código.
    const user  = userResult.rows[0];
    const token = jwt.sign(
      { user_id: user.id, company_id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      token,
      user:               { id: user.id, name: user.name, email: user.email, role: user.role },
      company:            { id: company_id, name: company_name },
      stripe_customer_id: stripeCustomerId
    });
  } catch (err) {
    // ROLLBACK es efectivo solo si el COMMIT aún no se ejecutó
    await client.query('ROLLBACK').catch(() => {});
    // Limpiar cliente Stripe si la inserción en BD falló
    if (stripeCustomerId) {
      stripe.customers.del(stripeCustomerId).catch(e =>
        console.warn('No se pudo eliminar cliente Stripe huérfano:', e.message)
      );
    }
    console.error('Error en registro:', err);
    return res.status(500).json({ error: 'Error al registrar la empresa.' });
  } finally {
    client.release();
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos.' });
  }

  try {
    const result = await db.query(
      `SELECT u.id, u.name, u.email, u.password_hash, u.role,
              c.id as company_id, c.name as company_name, c.subscription_status
       FROM users u
       JOIN companies c ON u.company_id = c.id
       WHERE u.email = $1`,
      [email.toLowerCase()]
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    const row = result.rows[0];
    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    const token = jwt.sign(
      { user_id: row.id, company_id: row.company_id, role: row.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: row.id, name: row.name, email: row.email, role: row.role },
      company: {
        id: row.company_id,
        name: row.company_name,
        subscription_status: row.subscription_status
      }
    });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error al iniciar sesión.' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.created_at,
              c.id as company_id, c.name as company_name,
              c.subscription_status, c.subscription_end_date
       FROM users u
       JOIN companies c ON u.company_id = c.id
       WHERE u.id = $1`,
      [req.user.user_id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const row = result.rows[0];
    res.json({
      user: { id: row.id, name: row.name, email: row.email, role: row.role, created_at: row.created_at },
      company: {
        id: row.company_id,
        name: row.company_name,
        subscription_status: row.subscription_status,
        subscription_end_date: row.subscription_end_date
      }
    });
  } catch (err) {
    console.error('Error en /me:', err);
    res.status(500).json({ error: 'Error al obtener el perfil.' });
  }
});

module.exports = router;
