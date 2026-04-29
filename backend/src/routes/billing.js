const express  = require('express');
const stripe   = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db       = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/billing/checkout
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT stripe_customer_id, name, email FROM companies WHERE id = $1',
      [req.user.company_id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Empresa no encontrada.' });
    }

    const { stripe_customer_id, email } = result.rows[0];
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      customer: stripe_customer_id || undefined,
      customer_email: stripe_customer_id ? undefined : email,
      mode: 'subscription',
      line_items: [{
        price: process.env.STRIPE_PRICE_ID,
        quantity: 1
      }],
      success_url: `${frontendUrl}/dashboard.html?checkout=success`,
      cancel_url:  `${frontendUrl}/index.html?checkout=canceled`,
      metadata: { company_id: req.user.company_id }
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Error creando sesión de checkout:', err);
    res.status(500).json({ error: 'Error al crear la sesión de pago.' });
  }
});

// POST /api/billing/webhook  (sin requireAuth — verificado por firma Stripe)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Firma de webhook inválida:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const company_id = session.metadata?.company_id;
        if (company_id && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          await db.query(
            `UPDATE companies
             SET stripe_subscription_id = $1,
                 subscription_status = 'active',
                 subscription_end_date = to_timestamp($2)
             WHERE id = $3`,
            [sub.id, sub.current_period_end, company_id]
          );
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        const sub = await stripe.subscriptions.retrieve(invoice.subscription);
        await db.query(
          `UPDATE companies
           SET subscription_status = 'active',
               subscription_end_date = to_timestamp($1)
           WHERE stripe_subscription_id = $2`,
          [sub.current_period_end, invoice.subscription]
        );
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await db.query(
          `UPDATE companies SET subscription_status = 'past_due'
           WHERE stripe_subscription_id = $1`,
          [invoice.subscription]
        );
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await db.query(
          `UPDATE companies SET subscription_status = 'canceled'
           WHERE stripe_subscription_id = $1`,
          [sub.id]
        );
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const statusMap = {
          active: 'active',
          past_due: 'past_due',
          canceled: 'canceled',
          unpaid: 'past_due',
          trialing: 'active'
        };
        const status = statusMap[sub.status] || 'inactive';
        await db.query(
          `UPDATE companies
           SET subscription_status = $1, subscription_end_date = to_timestamp($2)
           WHERE stripe_subscription_id = $3`,
          [status, sub.current_period_end, sub.id]
        );
        break;
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Error procesando webhook:', err);
    res.status(500).json({ error: 'Error procesando webhook.' });
  }
});

// GET /api/billing/status
router.get('/status', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT subscription_status, subscription_end_date, stripe_subscription_id
       FROM companies WHERE id = $1`,
      [req.user.company_id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Empresa no encontrada.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error obteniendo estado de suscripción:', err);
    res.status(500).json({ error: 'Error interno.' });
  }
});

// POST /api/billing/portal (portal de facturación Stripe)
router.post('/portal', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT stripe_customer_id FROM companies WHERE id = $1',
      [req.user.company_id]
    );
    if (!result.rows.length || !result.rows[0].stripe_customer_id) {
      return res.status(404).json({ error: 'Cliente de Stripe no configurado.' });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const session = await stripe.billingPortal.sessions.create({
      customer: result.rows[0].stripe_customer_id,
      return_url: `${frontendUrl}/admin.html`
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Error creando portal de facturación:', err);
    res.status(500).json({ error: 'Error al abrir el portal de facturación.' });
  }
});

// POST /api/billing/activate-dev (SOLO DESARROLLO — activa suscripción sin Stripe)
router.post('/activate-dev', requireAuth, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'No disponible en producción.' });
  }
  await db.query(
    `UPDATE companies
     SET subscription_status = 'active',
         subscription_end_date = NOW() + INTERVAL '1 year'
     WHERE id = $1`,
    [req.user.company_id]
  );
  res.json({ message: 'Suscripción activada en modo de desarrollo.' });
});

module.exports = router;
