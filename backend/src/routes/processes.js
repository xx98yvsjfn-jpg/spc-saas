const express = require('express');
const db      = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireActiveSubscription } = require('../middleware/subscription');

const router = express.Router();
router.use(requireAuth, requireActiveSubscription);

// GET /api/processes
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT p.id, p.name, p.description, p.unit, p.usl, p.lsl, p.nominal,
              p.created_at, u.name as created_by_name,
              COUNT(m.id)::int as measurement_count
       FROM processes p
       LEFT JOIN users u ON p.created_by = u.id
       LEFT JOIN measurements m ON m.process_id = p.id
       WHERE p.company_id = $1
       GROUP BY p.id, u.name
       ORDER BY p.created_at DESC`,
      [req.user.company_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los procesos.' });
  }
});

// POST /api/processes
router.post('/', async (req, res) => {
  const { name, description, unit, usl, lsl, nominal } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'El nombre del proceso es obligatorio.' });
  }

  try {
    const result = await db.query(
      `INSERT INTO processes (company_id, name, description, unit, usl, lsl, nominal, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [req.user.company_id, name, description || null, unit || null,
       usl || null, lsl || null, nominal || null, req.user.user_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear el proceso.' });
  }
});

// GET /api/processes/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT p.*, u.name as created_by_name
       FROM processes p
       LEFT JOIN users u ON p.created_by = u.id
       WHERE p.id = $1 AND p.company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Proceso no encontrado.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el proceso.' });
  }
});

// PUT /api/processes/:id
router.put('/:id', async (req, res) => {
  const { name, description, unit, usl, lsl, nominal } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'El nombre del proceso es obligatorio.' });
  }

  try {
    const result = await db.query(
      `UPDATE processes
       SET name=$1, description=$2, unit=$3, usl=$4, lsl=$5, nominal=$6
       WHERE id=$7 AND company_id=$8
       RETURNING *`,
      [name, description || null, unit || null, usl || null,
       lsl || null, nominal || null, req.params.id, req.user.company_id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Proceso no encontrado.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar el proceso.' });
  }
});

// DELETE /api/processes/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM processes WHERE id=$1 AND company_id=$2 RETURNING id',
      [req.params.id, req.user.company_id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Proceso no encontrado.' });
    }
    res.json({ message: 'Proceso eliminado correctamente.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar el proceso.' });
  }
});

module.exports = router;
