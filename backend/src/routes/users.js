const express = require('express');
const bcrypt  = require('bcrypt');
const db      = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireActiveSubscription, requireAdmin } = require('../middleware/subscription');

const router = express.Router();
router.use(requireAuth, requireActiveSubscription, requireAdmin);

// GET /api/users
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, email, role, created_at
       FROM users WHERE company_id=$1 ORDER BY created_at ASC`,
      [req.user.company_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los usuarios.' });
  }
});

// POST /api/users/invite
router.post('/invite', async (req, res) => {
  const { name, email, password, role = 'analyst' } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son obligatorios.' });
  }
  if (!['admin', 'analyst'].includes(role)) {
    return res.status(400).json({ error: 'Rol inválido. Use: admin | analyst.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  }

  try {
    const existing = await db.query('SELECT id FROM users WHERE email=$1', [email.toLowerCase()]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'El email ya está registrado.' });
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await db.query(
      `INSERT INTO users (company_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, created_at`,
      [req.user.company_id, name, email.toLowerCase(), hash, role]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear el usuario.' });
  }
});

// DELETE /api/users/:id
router.delete('/:id', async (req, res) => {
  if (req.params.id === req.user.user_id) {
    return res.status(400).json({ error: 'No puedes eliminar tu propio usuario.' });
  }

  try {
    const result = await db.query(
      'DELETE FROM users WHERE id=$1 AND company_id=$2 RETURNING id',
      [req.params.id, req.user.company_id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    res.json({ message: 'Usuario eliminado.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar el usuario.' });
  }
});

module.exports = router;
