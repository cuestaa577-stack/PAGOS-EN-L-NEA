# Publicar la web REAL (con cobros de verdad)

> Importante: tener el código en GitHub **no** hace que la web cobre. GitHub solo
> guarda el código. Para cobrar de verdad hacen falta **dos cosas**:
>
> 1. **Publicar el backend** en un servidor con **HTTPS** (para que tus clientes entren y para que Flow/Wompi puedan avisar del pago).
> 2. **Conectar tus llaves** de comercio de **Flow** (Chile) y **Wompi** (Colombia).
>
> Mientras no pongas tus llaves, la web corre en **modo demo** (simula el pago, no cobra).

---

## Paso 0 — Cuentas de comercio (obligatorio y legal)

### Chile — Flow
1. Crea tu cuenta en **https://www.flow.cl** (o sandbox para pruebas: https://sandbox.flow.cl).
2. Requisito legal: **RUT + inicio de actividades ante el SII** al día.
3. Registra tu **cuenta bancaria chilena** (ahí te depositan, el siguiente día hábil).
4. En el panel: **Integraciones → Integración por API** → copia **apiKey** y **secretKey**.

### Colombia — Wompi
1. Crea tu cuenta de comercio en **https://comercios.wompi.co**.
2. Registra tu **cuenta de recaudo** (puede ser tu **Nequi**, Daviplata o banco, a tu nombre).
3. En el panel: **Desarrolladores → Llaves** → copia **public key**, **private key**,
   **integrity secret** y **events secret**.

---

## Paso 1 — Elegir dónde publicar (opciones)

| Opción | Dificultad | Costo | Notas |
|---|---|---|---|
| **Render.com** | Fácil | Gratis (con límites) | Usa el `render.yaml` incluido. El disco gratis es efímero (ver nota abajo). |
| **Railway.app** | Fácil | Pago por uso | Detecta el `Procfile`/Dockerfile. |
| **Fly.io** | Media | Pago por uso | Usa el `Dockerfile`. |
| **VPS propio** (DigitalOcean, etc.) | Media | ~5 USD/mes | Control total; usa el `Dockerfile`. |

> **Nota sobre datos:** las órdenes se guardan en `data/orders.json`. En planes
> gratuitos el disco se borra al reiniciar. Para producción real, monta un **volumen
> persistente** (Render Disks, Railway Volume, etc.) o migra a una base de datos.

---

## Paso 2 — Desplegar en Render (la vía más simple)

1. Sube este proyecto a tu GitHub (ya está en `cuestaa577-stack/PAGOS-EN-L-NEA`).
2. Entra a **https://render.com** → **New** → **Blueprint** → elige tu repositorio.
3. Render leerá `render.yaml` y creará el servicio.
4. Rellena las variables de entorno (tus llaves reales de Flow y Wompi).
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

## Paso 4 — Probar

1. Primero en **sandbox** (Flow sandbox / Wompi test) para no cobrar de verdad.
2. Luego cambia `FLOW_ENV=production` y `WOMPI_ENV=production`.
3. Haz una compra pequeña real y verifica que el dinero llegue a tu cuenta.

---

## Variables de entorno (resumen)

Copia `.env.example` a `.env` y rellena:

```
PUBLIC_URL=https://tu-dominio.com
COMMERCE_NAME=Tu Negocio

FLOW_API_KEY=...
FLOW_SECRET_KEY=...
FLOW_ENV=production

WOMPI_PUBLIC_KEY=...
WOMPI_PRIVATE_KEY=...
WOMPI_INTEGRITY_SECRET=...
WOMPI_EVENTS_SECRET=...
WOMPI_ENV=production

SETTLE_TO_NEQUI=true
NEQUI_PHONE=...
NEQUI_NAME=...
NEQUI_LEGAL_ID=...
NEQUI_EMAIL=...
```

---

## Ejecutar en local (para probar)

```bash
npm install
cp .env.example .env   # rellena tus llaves (o déjalo vacío para modo demo)
npm start
# abre http://localhost:3000
```

## Con Docker

```bash
docker build -t pagos-cl-co .
docker run -p 3000:3000 --env-file .env pagos-cl-co
```
