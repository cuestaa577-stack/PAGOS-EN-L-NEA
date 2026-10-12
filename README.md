# Pasarela de pagos — Chile 🇨🇱 + Colombia 🇨🇴 (con App instalable)

Web de servicios donde tus clientes pagan de la forma que les resulte más fácil,
de forma **legal, real y segura**, y el dinero llega a tu cuenta. Funciona además
como **app web instalable (PWA)**: se puede "Instalar" en el teléfono y quedar
como una app normal en la pantalla de inicio.

## ¿Qué puede hacer?

| País | Medio de pago | Cómo funciona |
|------|---------------|---------------|
| 🇨🇱 Chile | **Efectivo con código** | Se genera un *cupón de pago* con un **código alfanumérico**. El cliente va a **Servipag / Servipag Express / Sencillito** y paga en efectivo mostrando el código. |
| 🇨🇱 Chile | **Tarjeta** | El cliente paga con tarjeta de crédito/débito en la **página segura de Flow** (la web nunca ve la tarjeta). |
| 🇨🇴 Colombia | **Tarjeta / Nequi / PSE** | El cliente paga en el **Web Checkout de Wompi** (grupo Bancolombia). |
| 🇨🇴 Colombia | **→ Tu Nequi** | Al confirmarse el pago, el dinero se **dispersa automáticamente a tu cuenta Nequi** (Wompi "Pagos a Terceros"). |

> 🔒 **Seguridad (PCI-DSS):** la web **nunca** captura ni almacena datos de tarjeta.
> Los datos de tarjeta se ingresan **solo** en la página segura de la pasarela
> (Flow o Wompi). Esto es obligatorio para que el cobro sea legal.

## ¿Por qué la web original "no pasaba de la interfaz"?

El repositorio original tenía dos problemas: el `index.html` estaba truncado
(faltaba la lógica) y el `server.js` **solo simulaba** los estados, sin conectar
con ninguna pasarela real. Este proyecto reemplaza todo por una integración real.

## Estructura del proyecto

```
.
├── server.js                 # Servidor Express: API + rutas + webhooks + PWA
├── lib/
│   ├── flow.js               # Cliente de la API de Flow (Chile) — firma HMAC-SHA256
│   ├── wompi.js              # Cliente de Wompi (Colombia) — checkout, eventos, payouts
│   ├── settlement.js         # Liquidación/dispersión automática a Nequi
│   └── store.js              # Persistencia de órdenes (JSON con escritura atómica)
├── public/
│   ├── index.html            # Interfaz (selector de país/método)
│   ├── app.js                # Lógica del frontend + registro del Service Worker
│   ├── styles.css            # Estilos
│   ├── manifest.json         # Manifiesto de la PWA (nombre, iconos, colores)
│   ├── sw.js                 # Service Worker (caché offline del app shell)
│   ├── icons/                # Iconos de la app (192, 512, maskable, apple-touch)
│   └── demo-*.html           # Páginas que SIMULAN el checkout seguro (modo demo)
├── tools/make-icons.py       # Genera los iconos de la PWA
├── test-wompi.js             # Pruebas de la integración con Wompi
└── .env.example              # Plantilla de credenciales
```

## Puesta en marcha (modo demo, sin llaves)

```bash
npm install
npm start
# Abre http://localhost:3000
```

Sin credenciales, la app funciona en **modo DEMO**: se puede recorrer todo el
flujo (crear el código, "pagar", ver el estado y la liquidación simulada a Nequi)
para verificar que todo funciona antes de conectar dinero real.

## 📲 Cómo instalar la app (PWA)

La app se instala desde el navegador. Requiere **HTTPS** (o `localhost`).

- **Android (Chrome/Edge):** aparece un banner **"Instala la app"** en la parte
  superior, o usa el menú **⋮ → "Instalar aplicación" / "Añadir a pantalla de inicio"**.
- **iPhone/iPad (Safari):** toca **Compartir** (⬆️) → **"Añadir a pantalla de inicio"**.
- **Escritorio (Chrome/Edge):** icono de **instalar** (⊕) en la barra de direcciones.

Una vez instalada, se abre a pantalla completa como una app normal y, gracias al
Service Worker, la interfaz carga incluso con conexión débil.

## Cómo activar los cobros REALES

### Paso 1 — Chile (Flow)
1. Crea una cuenta de comercio en [flow.cl](https://www.flow.cl). Necesitas
   **RUT** e **inicio de actividades** en el SII, y una cuenta bancaria a tu nombre.
2. En el panel de Flow obtén tu **API Key** y **Secret Key**.
3. Pega las llaves en `.env` (`FLOW_API_KEY`, `FLOW_SECRET_KEY`) y pon
   `FLOW_ENV=production`.
4. Habilita los medios: **Cupón de pago** (efectivo: Servipag/Sencillito) y
   **Tarjeta**.

### Paso 2 — Colombia (Wompi)
1. Crea una cuenta de comercio en [wompi.co](https://wompi.co) (KYC con cédula
   colombiana).
2. Obtén tus llaves (`pub_prod_...`, `prv_prod_...`), el **secreto de integridad**
   y el **secreto de eventos**.
3. Pega todo en `.env` y pon `WOMPI_ENV=production`.
4. Configura la **URL de eventos (webhook)** en Wompi:
   `https://tudominio.com/api/webhook/wompi`

### Paso 3 — Recibir el dinero en tu Nequi
1. Activa **"Pagos a Terceros" (dispersiones)** en Wompi y obtén las credenciales
   (`WOMPI_PAYOUTS_API_KEY`, `WOMPI_PAYOUTS_USER_PRINCIPAL_ID`,
   `WOMPI_PAYOUTS_ACCOUNT_ID`).
2. Completa tus datos de Nequi en `.env` (`NEQUI_PHONE`, `NEQUI_LEGAL_ID`, etc.).
3. Deja `SETTLE_TO_NEQUI=true`. Al confirmarse cada pago en Colombia, el dinero
   se enviará a tu Nequi.

### Paso 4 — Publicar con HTTPS
La PWA y los webhooks necesitan **HTTPS**. Publica el servidor en un hosting con
certificado (Render, Railway, Fly.io, un VPS con Nginx + Let's Encrypt, etc.) y
define `PUBLIC_URL=https://tudominio.com`.

## Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET  | `/api/config` | Config pública (países, monedas, modo demo/real) |
| POST | `/api/pagar` | Crea una orden de pago y devuelve el código + URL de checkout |
| GET  | `/api/estado/:codigo` | Consulta el estado de una orden |
| POST | `/api/webhook/flow` | Webhook de confirmación de Flow (Chile) |
| POST | `/api/webhook/wompi` | Webhook de eventos de Wompi (Colombia) |
| GET  | `/api/retorno` | Retorno del pagador (Flow) |
| GET  | `/api/retorno-wompi` | Retorno del pagador (Wompi) |

## Pruebas

```bash
npm test        # verifica la firma de integridad y los eventos de Wompi
```

## Notas legales
- Cobrar requiere ser **comercio registrado** en la pasarela (Flow en Chile,
  Wompi en Colombia) y cumplir sus requisitos de identidad (RUT/SII en Chile,
  cédula en Colombia).
- La web **no** debe pedir ni guardar datos de tarjeta: eso lo hace la pasarela.
- Guarda tus llaves solo en el archivo `.env` (que **no** se sube al repositorio).
