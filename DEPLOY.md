# Publicar la web REAL (con cobros de verdad)

> Importante: tener el código en GitHub **no** hace que la web cobre. GitHub solo
> guarda el código. Para cobrar de verdad hacen falta **dos cosas**:
>
> 1. **Publicar el backend** en un servidor con **HTTPS** (para que tus clientes entren y para que Flow/Wompi puedan avisar del pago).
> 2. **Conectar tus llaves** de comercio de **Flow** (Chile) y **Wompi** (Colombia).
>
> Mientras no pongas tus llaves, la web **no cobra** (responde *"cobro no configurado"*).
> Si quieres **probar** el sistema sin dinero real, activa `DEMO_MODE=true` (solo para
> pruebas; simula el pago). En producción déjalo en `DEMO_MODE=false`.

---

## Paso 0 — Cuentas de comercio (obligatorio y legal)

### Chile — Flow
1. Crea tu cuenta en **https://www.flow.cl** (o sandbox para pruebas: https://sandbox.flow.cl).
2. Requisito legal: **RUT + inicio de actividades ante el SII** al día.
3. Registra tu **cuenta bancaria chilena** (ahí te depositan, el siguiente día hábil).
4. En el panel: **Integraciones → Integración por API** → copia **apiKey** y **secretKey**.

> En Chile el único medio es **efectivo con código** (cupón de pago en Servipag /
> Servipag Express / Sencillito). El cliente **no** ingresa RUT en la web: paga
> mostrando el **código alfanumérico** que le genera el sistema.

### Colombia — Wompi
1. Crea tu cuenta de comercio en **https://comercios.wompi.co**.
2. Registra tu **cuenta de recaudo** (puede ser tu **Nequi**, Daviplata o banco, a tu nombre).
3. En el panel: **Desarrolladores → Llaves** → copia **public key**, **private key**,
   **integrity secret** y **events secret**.
4. Para pasar el saldo a tu Nequi desde el panel, activa **"Pagos a Terceros"
   (Dispersiones)** en Wompi y copia su **API key**, **User Principal Id** y **Account Id**.

> En Colombia el único medio es **tarjeta (crédito/débito)** vía el **Web Checkout
> seguro de Wompi** (grupo Bancolombia). La web **nunca** ve los datos de la tarjeta.

---

## Paso 1 — Elegir dónde publicar (opciones)

| Opción | Dificultad | Costo | Notas |
|---|---|---|---|
| **Render.com** | Fácil | Gratis (con límites) | Usa el `render.yaml` incluido. El disco gratis es efímero (ver nota abajo). |
| **Railway.app** | Fácil | Pago por uso | Detecta el `Procfile`/Dockerfile. |
| **Fly.io** | Media | Pago por uso | Usa el `Dockerfile`. |
| **VPS propio** (DigitalOcean, etc.) | Media | ~5 USD/mes | Control total; usa el `Dockerfile`. |

> **Nota sobre datos:** las órdenes y los usuarios se guardan en `data/orders.json`
> y `data/users.json`. En planes gratuitos el disco se borra al reiniciar. Para
> producción real, monta un **volumen persistente** (Render Disks, Railway Volume,
> etc.) o migra a una base de datos.

---

## Paso 2 — Desplegar en Render (la vía más simple)

1. Sube este proyecto a tu GitHub (ya está en `cuestaa577-stack/PAGOS-EN-L-NEA`).
2. Entra a **https://render.com** → **New** → **Blueprint** → elige tu repositorio.
3. Render leerá `render.yaml` y creará el servicio.
4. Rellena las variables de entorno (tus llaves reales de Flow y Wompi, tu `AUTH_SECRET`
   y el usuario/clave del administrador).
   - En `PUBLIC_URL` pon la URL que Render te asigne (ej. `https://pagos-cl-co.onrender.com`).
5. Pulsa **Deploy**. Cuando termine, abre la URL: ya es tu web **real** con HTTPS.

---

## Paso 3 — Configurar las URLs de retorno en las pasarelas

En **Flow** y **Wompi**, la URL de confirmación/webhook debe apuntar a tu dominio:

- Flow (webhook): `https://TU-DOMINIO/api/webhook/flow`
- Flow (retorno): `https://TU-DOMINIO/api/retorno`
- Wompi (eventos): `https://TU-DOMINIO/api/webhook/wompi`
- Wompi (retorno): `https://TU-DOMINIO/api/retorno-wompi`

---

## Paso 4 — Entrar al panel del comercio (`/admin.html`)

Con el **usuario y la clave de administrador** (`ADMIN_EMAIL` / `ADMIN_PASSWORD`) entra a:

```
https://TU-DOMINIO/admin.html
```

Ahí verás:
- **Estadísticas** de pagos (recaudado en CLP y COP, órdenes pagadas, etc.).
- La **billetera**: cuánto se ha recaudado en Colombia, cuánto se ha transferido y el
  **saldo disponible** en COP.
- Un botón **"Transferir a Nequi"** para pasar ese saldo a tu cuenta Nequi (vía Wompi
  "Pagos a Terceros").
- Las tablas de **órdenes** y **usuarios** registrados.

> El dinero **no** lo custodia esta web: lo custodia la pasarela (Wompi/Flow) a tu
> nombre de comercio. La "billetera" es una **vista** del saldo que la pasarela tiene
> a tu favor; desde el panel lo pasas a tu **Nequi**.

---

## Paso 5 — Probar

1. Primero en **sandbox** (Flow sandbox / Wompi test) para no cobrar de verdad.
2. Luego cambia `FLOW_ENV=production` y `WOMPI_ENV=production`.
3. Haz una compra pequeña real y verifica que el dinero llegue a tu cuenta.

---

## Variables de entorno (resumen)

Copia `.env.example` a `.env` y rellena:

```
# --- Servidor ---
PORT=3000
PUBLIC_URL=https://tu-dominio.com
COMMERCE_NAME=Tu Negocio

# --- Modo y seguridad ---
DEMO_MODE=false                 # true = solo pruebas (simula); false = real / no cobra
AUTH_SECRET=...                 # cadena larga y aleatoria (firma las sesiones)
REQUIRE_LOGIN_TO_PAY=false      # true = hay que iniciar sesion para pagar
ADMIN_EMAIL=admin@tudominio.com
ADMIN_PASSWORD=UnaClaveSeguraDe8+
ADMIN_NAME=Administrador

# --- Chile: Flow ---
FLOW_API_KEY=...
FLOW_SECRET_KEY=...
FLOW_ENV=production

# --- Colombia: Wompi ---
WOMPI_PUBLIC_KEY=...
WOMPI_PRIVATE_KEY=...
WOMPI_INTEGRITY_SECRET=...
WOMPI_EVENTS_SECRET=...
WOMPI_ENV=production

# --- Liquidacion / Nequi (Wompi "Pagos a Terceros") ---
SETTLE_TO_NEQUI=true
WOMPI_PAYOUTS_API_KEY=...
WOMPI_PAYOUTS_USER_PRINCIPAL_ID=...
WOMPI_PAYOUTS_ACCOUNT_ID=...
NEQUI_PHONE=...
NEQUI_NAME=...
NEQUI_LEGAL_ID=...
NEQUI_EMAIL=...
```

---

## Ejecutar en local (para probar)

```bash
npm install
cp .env.example .env   # rellena tus llaves. Sin llaves y DEMO_MODE=false: no cobra.
                       # Para PROBAR sin dinero real, pon DEMO_MODE=true.
npm start
# abre http://localhost:3000
# panel del comercio: http://localhost:3000/admin.html
```

## Con Docker

```bash
docker build -t pagos-cl-co .
docker run -p 3000:3000 --env-file .env pagos-cl-co
```
