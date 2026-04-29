# SPC SaaS — Plataforma de Control Estadístico de Procesos

Aplicación web SaaS multiempresa para análisis de capacidad de procesos (Cp, Cpk, Cpu, Cpl) y control estadístico de procesos (cartas X̄-R, X̄-S, I-MR).

---

## Requisitos previos

- Node.js 18+
- PostgreSQL 14+
- Cuenta de Stripe (para pagos; opcional en desarrollo)

---

## Instalación

### 1. Clonar y configurar el backend

```bash
cd backend
npm install
cp .env.example .env
# Edita .env con tus credenciales
```

### 2. Crear la base de datos

```bash
createdb spc_saas
psql spc_saas < src/db/schema.sql
```

### 3. Variables de entorno (`.env`)

```
DATABASE_URL=postgresql://usuario:contraseña@localhost:5432/spc_saas
JWT_SECRET=secreto_seguro_de_al_menos_32_chars
STRIPE_SECRET_KEY=sk_test_...        # Desde dashboard.stripe.com
STRIPE_WEBHOOK_SECRET=whsec_...      # Desde Stripe CLI o webhook config
STRIPE_PRICE_ID=price_...            # ID del precio mensual en Stripe
FRONTEND_URL=http://localhost:3000
PORT=4000
NODE_ENV=development
```

### 4. Iniciar el backend

```bash
cd backend
npm run dev       # desarrollo (nodemon)
# o
npm start         # producción
```

### 5. Servir el frontend

El frontend son archivos estáticos. En desarrollo puedes usar cualquier servidor estático:

```bash
cd frontend
npx serve -p 3000
# o con Python:
python -m http.server 3000
# o con VS Code: Live Server apuntando a /frontend
```

---

## Uso en modo desarrollo (sin Stripe)

1. Registra una empresa en `/index.html`
2. Inicia sesión
3. Ve a `/admin.html`
4. Haz clic en **"Activar demo (dev)"** — activa la suscripción sin pasar por Stripe
5. Haz clic en **"Cargar datos de demostración"** para crear el proceso de Llenado de Envases

---

## Configuración de Stripe (producción)

1. Crea un producto y precio mensual en [Stripe Dashboard](https://dashboard.stripe.com)
2. Copia el `STRIPE_PRICE_ID` al `.env`
3. Configura el webhook en Stripe → Developers → Webhooks:
   - URL: `https://tu-dominio.com/api/billing/webhook`
   - Eventos: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`, `customer.subscription.updated`
4. Copia el `STRIPE_WEBHOOK_SECRET` al `.env`

Para desarrollo local con webhooks:

```bash
stripe listen --forward-to localhost:4000/api/billing/webhook
```

---

## Estructura del proyecto

```
spc-saas/
├── backend/
│   ├── src/
│   │   ├── app.js              # Entrada principal Express
│   │   ├── db/
│   │   │   ├── index.js        # Pool de conexión PostgreSQL
│   │   │   ├── schema.sql      # Esquema de tablas
│   │   │   └── seed.sql        # Datos de demostración
│   │   ├── middleware/
│   │   │   ├── auth.js         # Verificación JWT
│   │   │   └── subscription.js # Verificación de suscripción activa
│   │   ├── routes/
│   │   │   ├── auth.js         # /api/auth
│   │   │   ├── billing.js      # /api/billing
│   │   │   ├── processes.js    # /api/processes
│   │   │   ├── measurements.js # /api/measurements
│   │   │   ├── analysis.js     # /api/analysis
│   │   │   └── users.js        # /api/users
│   │   └── utils/
│   │       └── spc.js          # Cálculos SPC (Cp, Cpk, cartas, reglas Nelson)
│   ├── .env.example
│   └── package.json
└── frontend/
    ├── index.html              # Login / Registro
    ├── dashboard.html          # Dashboard principal
    ├── processes.html          # CRUD de procesos
    ├── measurements.html       # Ingreso y gestión de mediciones
    ├── control-chart.html      # Cartas de control (X̄-R, X̄-S, I-MR)
    ├── capability.html         # Análisis de capacidad (Cp, Cpk...)
    ├── admin.html              # Administración de empresa y usuarios
    ├── css/main.css            # Estilos globales
    └── js/
        ├── api.js              # Cliente HTTP con JWT + wrappers de API
        ├── charts.js           # Renderizado de gráficos con Chart.js
        └── spc.js              # Cálculos SPC en cliente (previsualizaciones)
```

---

## API REST — Resumen

| Grupo | Ruta base | Autenticación |
|-------|-----------|---------------|
| Auth | `/api/auth` | Pública |
| Billing | `/api/billing` | JWT (parcial) |
| Procesos | `/api/processes` | JWT + suscripción activa |
| Mediciones | `/api/measurements` | JWT + suscripción activa |
| Análisis | `/api/analysis` | JWT + suscripción activa |
| Usuarios | `/api/users` | JWT + suscripción activa + rol admin |

---

## Despliegue

### Backend (Railway / Render)
- Establece las variables de entorno en el panel del servicio
- El `DATABASE_URL` lo provee el servicio de PostgreSQL gestionado
- Usa `npm start` como comando de inicio

### Frontend (Netlify / Vercel / Nginx)
- Sube la carpeta `/frontend` como sitio estático
- Actualiza `API_BASE` en `js/api.js` con la URL del backend en producción
- Configura redirects SPA si es necesario (para Netlify: `_redirects`)

---

## Seguridad implementada

- Contraseñas con bcrypt (12 salt rounds)
- JWT firmado, expiración 7 días
- `company_id` extraído del JWT, nunca del body
- Consultas parametrizadas en todas las rutas (sin interpolación SQL)
- Rate limiting: 10 req/min en rutas de autenticación
- CORS restringido al dominio del frontend
- Middleware de suscripción activa en todas las rutas protegidas
