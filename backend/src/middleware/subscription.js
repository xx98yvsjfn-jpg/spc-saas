const db = require('../db');

async function requireActiveSubscription(req, res, next) {
  try {
    const result = await db.query(
      'SELECT subscription_status FROM companies WHERE id = $1',
      [req.user.company_id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Empresa no encontrada.' });
    }
    const { subscription_status } = result.rows[0];
    if (subscription_status !== 'active') {
      return res.status(402).json({
        error: 'Suscripción inactiva o vencida.',
        subscription_status
      });
    }
    next();
  } catch (err) {
    console.error('Error verificando suscripción:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Se requieren privilegios de administrador.' });
  }
  next();
}

module.exports = { requireActiveSubscription, requireAdmin };
