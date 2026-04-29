-- ============================================================
-- Seed de datos de demostración — Ejecutar después de schema.sql
-- ============================================================

-- NOTA: Este script asume que ya existe un usuario admin.
-- Úsalo solo en entorno de desarrollo. Los datos reales
-- se crean desde el panel de administración de la app.

-- Para activar manualmente una suscripción en desarrollo:
-- UPDATE companies SET subscription_status = 'active',
--   subscription_end_date = NOW() + INTERVAL '1 year'
-- WHERE email = 'tu_email@empresa.com';
