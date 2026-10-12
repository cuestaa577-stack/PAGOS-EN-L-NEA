# Pasarela de pagos — Chile 🇨🇱 + Colombia 🇨🇴 (con App instalable)

Web de servicios donde tus clientes pagan de la forma que les resulte más fácil,
de forma **legal, real y segura**, y el dinero llega a tu cuenta. Funciona además
como **app web instalable (PWA)**: se puede "Instalar" en el teléfono y quedar
como una app normal en la pantalla de inicio.

## ¿Qué puede hacer?

La web muestra **exactamente dos flujos**, uno por país:

| País | Único medio de pago | Cómo funciona |
|------|---------------------|---------------|
| 🇨🇱 **Chile** | **Efectivo con código** | Se genera un *cupón de pago* con un **código alfanumérico**. El cliente va a **Servipag / Servipag Express / Sencillito** y paga en efectivo mostrando el código. **No se pide RUT en la web.** |
| 🇨🇴 **Colombia** | **Tarjeta (crédito / débito)** | El cliente paga con tarjeta (**Mastercard**, Visa, etc.) en el **Web Checkout seguro de Wompi** (grupo Bancolombia). El dinero se **dispersa a tu cuenta Nequi**. |

> 🔒 **Seguridad (PCI-DSS):** la web **nunca** captura ni almacena datos de tarjeta.
> Los datos se ingresan **solo** en la página segura de la pasarela (Flow o Wompi).

## Novedades de esta versión

- **Inicio de sesión de usuarios** (registro/login) con contraseñas cifradas
  (bcrypt) y sesiones firmadas (JWT en cookie `httpOnly`). Cada quien ve **"Mis pagos"**.
- **Panel del comercio** (`/admin.html`): estadísticas, órdenes, usuarios y una
  **billetera** con el **saldo real** recaudado en Colombia, con un botón para
  **transferir ese saldo a tu cuenta Nequi**.
- **Interfaz simplificada:** Chile = solo efectivo con código; Colombia = solo tarjeta.
  Ya no aparecen medios que no corresponden.
- **Sin simulaciones:** si no hay llaves de cobro y `DEMO_MODE=false`, el sistema
  **no genera pagos** (responde *"cobro no configurado"*). Nada de pagos falsos.
- **El saldo queda en tu cuenta:** el dinero lo **custodia la pasarela** (Wompi/Flow)
  y se abona a la cuenta del comercio; desde el panel lo pasas a tu **Nequi**.

## Modos de operación

| Modo | Cuándo | Qué hace |
|------|--------|----------|
| **REAL** | Hay llaves de Flow/Wompi | **Cobra de verdad.** |
| **DEMO** | `DEMO_MODE=true` | Solo para **probar** el sistema (simula el pago). |
| **NO_CONFIG** | Sin llaves y `DEMO_MODE=false` | **No cobra** (nada de simulación). |

## Estructura del proyecto

```
.
├── server.js                 # Servidor Express: API + auth + webhooks + PWA
├── lib/
│   ├── flow.js               # Cliente de la API de Flow (Chile) — firma HMAC-SHA256
│   ├── wompi.js              # Cliente de Wompi (Colombia) — checkout, eventos, payouts
│   ├── settlement.js         # Liquidación/dispersión automática a Nequi
│   ├── wallet.js             # Billetera del comercio (saldo real + transferencia a Nequi)
│   ├── users.js              # Registro de usuarios (JSON, hash bcrypt)
│   ├── auth.js               # Sesiones (JWT en cookie httpOnly) + middlewares
│   └── store.js              # Persistencia de órdenes (JSON con escritura atómica)
├── public/
│   ├── index.html            # Interfaz (país + medio de pago + login + "Mis pagos")
│   ├── app.js                # Lógica del frontend + sesión + Service Worker
│   ├── admin.html / admin.js # Panel del comercio (billetera, órdenes, usuarios)
│   ├── styles.css            # Estilos
│   ├── manifest.json         # Manifiesto de la PWA
│   ├── sw.js                 # Service Worker (caché offline del app shell)
│   ├── icons/                # Iconos de la app
│   └── demo-*.html           # Páginas que SIMULAN el checkout (solo en modo demo)
├── tools/make-icons.py       # Genera los iconos de la PWA
├── test-wompi.js             # Pruebas de la integración con Wompi
├── test-api.sh               # Prueba integral de la API (auth, pagos, billetera)
└── .env.example              # Plantilla de credenciales
```

## Puesta en marcha

```bash
npm install
cp .env.example .env      # edita tus credenciales
npm start
# Abre http://localhost:3000
```

### Para probar sin llaves (modo demo)

En `.env` pon `DEMO_MODE=true`. Así puedes recorrer todo el flujo (crear el código,
"pagar", ver el estado y la liquidación simulada a Nequi) **sin dinero real**.

### Para cobrar de verdad

Pon `DEMO_MODE=false` y completa las llaves reales (ver más abajo). Si no hay
llaves, la web avisará que el cobro aún no está configurado y **no** generará pagos.

## 🔐 Cuentas y panel del comercio

- Los usuarios se **registran** desde la web (botón *"Crear cuenta"*).
- El **administrador** se crea solo al arrancar el servidor, usando `ADMIN_EMAIL`
  y `ADMIN_PASSWORD` del `.env`. Con esa cuenta entras a **`/admin.html`**.
- Si quieres **obligar** a iniciar sesión para pagar, pon `REQUIRE_LOGIN_TO_PAY=true`.

## 📲 Cómo instalar la app (PWA)

La app se instala desde el navegador. Requiere **HTTPS** (o `localhost`).

- **Android (Chrome/Edge):** aparece un banner **"Instala la app"**, o menú **⋮ → "Instalar aplicación"**.
- **iPhone/iPad (Safari):** **Compartir** (⬆️) → **"Añadir a pantalla de inicio"**.
- **Escritorio (Chrome/Edge):** icono de **instalar** (⊕) en la barra de direcciones.

## Cómo activar los cobros REALES

### Paso 1 — Chile (Flow)
1. Crea una cuenta de comercio en [flow.cl](https://www.flow.cl). Necesitas
   **RUT** e **inicio de actividades** en el SII, y una cuenta bancaria a tu nombre.
2. Obtén tu **API Key** y **Secret Key**.
3. Pega las llaves en `.env` (`FLOW_API_KEY`, `FLOW_SECRET_KEY`) y pon
   `FLOW_ENV=production`.
4. Habilita el medio **Cupón de pago** (efectivo: Servipag/Sencillito).

### Paso 2 — Colombia (Wompi)
1. Crea una cuenta de comercio en [wompi.co](https://wompi.co) (KYC con cédula).
2. Obtén tus llaves (`pub_prod_...`, `prv_prod_...`), el **secreto de integridad**
   y el **secreto de eventos**.
3. Pega todo en `.env` y pon `WOMPI_ENV=production`.
4. Configura la **URL de eventos (webhook)**: `https://tudominio.com/api/webhook/wompi`

### Paso 3 — Recibir el dinero en tu Nequi
1. Activa **"Pagos a Terceros" (dispersiones)** en Wompi y obtén las credenciales
   (`WOMPI_PAYOUTS_API_KEY`, `WOMPI_PAYOUTS_USER_PRINCIPAL_ID`, `WOMPI_PAYOUTS_ACCOUNT_ID`).
2. Completa tus datos de Nequi en `.env` (`NEQUI_PHONE`, `NEQUI_LEGAL_ID`, etc.).
3. Deja `SETTLE_TO_NEQUI=true`. Al confirmarse cada pago en Colombia, el dinero
   se enviará a tu Nequi. También puedes transferirlo manualmente desde el panel.

### Paso 4 — Publicar con HTTPS
La PWA y los webhooks necesitan **HTTPS**. Publica el servidor en un hosting con
certificado (Render, Railway, Fly.io, un VPS con Nginx + Let's Encrypt, etc.) y
define `PUBLIC_URL=https://tudominio.com`.

## Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET  | `/api/config` | Config pública (países, monedas, modo, si exige login) |
| POST | `/api/auth/registro` | Crear cuenta |
| POST | `/api/auth/login` | Iniciar sesión |
| POST | `/api/auth/logout` | Cerrar sesión |
| GET  | `/api/auth/me` | Usuario de la sesión actual |
| GET  | `/api/mis-ordenes` | Órdenes del usuario (requiere sesión) |
| POST | `/api/pagar` | Crea una orden y devuelve el código + URL de checkout |
| GET  | `/api/estado/:codigo` | Consulta el estado de una orden |
| POST | `/api/webhook/flow` | Webhook de confirmación de Flow (Chile) |
| POST | `/api/webhook/wompi` | Webhook de eventos de Wompi (Colombia) |
| GET  | `/api/admin/stats` | Estadísticas (solo admin) |
| GET  | `/api/admin/wallet` | Billetera / saldo (solo admin) |
| POST | `/api/admin/transferir-nequi` | Transferir saldo a Nequi (solo admin) |
| GET  | `/api/admin/ordenes` · `/api/admin/usuarios` | Listados (solo admin) |

## Pruebas

```bash
npm test           # verifica la firma de integridad y los eventos de Wompi
bash test-api.sh   # prueba integral de la API (con el servidor corriendo)
```

## Notas legales
- Cobrar requiere ser **comercio registrado** en la pasarela (Flow en Chile,
  Wompi en Colombia) y cumplir sus requisitos de identidad (RUT/SII en Chile,
  cédula en Colombia).
- La web **no** debe pedir ni guardar datos de tarjeta: eso lo hace la pasarela.
- La **billetera** del panel no "custodia" dinero: muestra el saldo real que la
  pasarela tiene a favor del comercio y ordena su dispersión a Nequi.
- Guarda tus llaves solo en el archivo `.env` (que **no** se sube al repositorio).
