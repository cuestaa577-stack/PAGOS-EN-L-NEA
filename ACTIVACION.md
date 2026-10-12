# 🔑 Cómo ACTIVAR los cobros reales (Chile + Colombia)

> **Resumen en una frase:** la web ya está terminada y funciona; lo único que falta
> es pegar **tus llaves de comercio** (Flow para Chile y Wompi para Colombia) en las
> **variables de entorno** de Render. Mientras no las pegues, la web avisa
> *"faltan las credenciales de Wompi y de Flow Chile"* y **no cobra** (ni simula).

---

## 1. ¿Por qué dice "faltan las credenciales de Wompi y de Flow Chile"?

Porque el sistema tiene **3 modos** y ahora mismo está en el modo más seguro:

| Modo | Cuándo ocurre | Qué hace |
|------|----------------|----------|
| **REAL** | Hay llaves de Flow y/o Wompi puestas | **Cobra de verdad** y mueve el dinero real. |
| **DEMO** | No hay llaves y `DEMO_MODE=true` | Simula el pago (solo para probar). |
| **NO_CONFIG** | No hay llaves y `DEMO_MODE=false` | **No cobra nada** (responde error 503). Es el modo "honesto": no inventa pagos. |

El aviso que viste es **correcto y esperado**: significa que todavía **no** has pegado
las llaves reales. La billetera muestra **$0** porque, al no haber cobros reales, no
hay dinero recaudado. En cuanto conectes las llaves y hagas un cobro real, el saldo
aparecerá solo en la billetera.

> ⚠️ **Importante (legal):** una web **no puede** guardar ni custodiar el dinero de
> otras personas. El dinero lo custodia la **pasarela** (Flow en Chile, Wompi en
> Colombia, que es del grupo Bancolombia). La "billetera" de la web es solo una
> **vista** de ese dinero y sirve para **ordenar la transferencia a tu Nequi**.

---

## 2. Chile 🇨🇱 — Pasarela Flow (pago con código alfanumérico)

En Chile el cliente paga **en efectivo con un código** (Servipag / Sencillito). Eso
lo da **Flow**.

### 2.1. Regístrate como comercio en Flow
1. Entra a **https://www.flow.cl** y crea una cuenta de comercio.
2. Necesitas **RUT** y tener el **inicio de actividades al día en el SII**
   (Flow lo exige para habilitar cobros). Si eres persona natural, tu RUT sirve.
3. Completa la validación (Flow te pide datos del negocio y tu cuenta bancaria
   para depositarte el dinero recaudado).

### 2.2. Copia tus llaves
1. Dentro de Flow, ve a **Mis datos → API** (o "Integración").
2. Copia estos dos valores:
   - **API Key** → se guarda como `FLOW_API_KEY`
   - **Secret Key** → se guarda como `FLOW_SECRET_KEY`
3. Si estás probando, usa el entorno **sandbox** (`https://sandbox.flow.cl`).
   Para cobrar de verdad, pon `FLOW_ENV=production`.

> El "código alfanumérico" que le das al cliente en Chile **es el que genera Flow**
> al crear el pago. El cliente **no necesita RUT** en la web; solo presenta el
> código donde paga (Servipag/Sencillito).

---

## 3. Colombia 🇨🇴 — Pasarela Wompi (tarjeta → Nequi)

En Colombia el cliente paga con **tarjeta débito/crédito Mastercard** y el dinero
llega a tu **Nequi**. Eso lo hace **Wompi** (grupo Bancolombia).

### 3.1. Regístrate como comercio en Wompi
1. Entra a **https://comercios.wompi.co** y crea tu cuenta de comercio.
2. Necesitas **cédula colombiana** y hacer el **KYC** (validación de identidad).
3. Conecta tu **cuenta de recaudo**: aquí eliges tu **Nequi** para que el dinero
   caiga en tu cuenta.

### 3.2. Copia tus llaves
En el panel de Wompi (Desarrolladores / Configuración) copia:
   - **Llave pública** → `WOMPI_PUBLIC_KEY` (empieza por `pub_prod_`)
   - **Llave privada** → `WOMPI_PRIVATE_KEY` (empieza por `prv_prod_`)
   - **Secreto de integridad** → `WOMPI_INTEGRITY_SECRET`
   - **Secreto de eventos** → `WOMPI_EVENTS_SECRET` (valida el webhook)

> Para pruebas usa las llaves `pub_test_` / `prv_test_` y `WOMPI_ENV=sandbox`.
> Para cobrar de verdad, `WOMPI_ENV=production` y llaves `_prod_`.

---

## 4. 💜 Pasar el saldo a Nequi (Wompi "Pagos a Terceros")

Para que la web pueda **dispersar** (enviar) el dinero recaudado a tu Nequi
automáticamente, Wompi te da acceso a **"Pagos a Terceros" / Dispersiones**.
Esto se **solicita al equipo de Wompi** (no es automático).

Cuando te lo habiliten, te entregan:
   - **API Key de dispersiones** → `WOMPI_PAYOUTS_API_KEY`
   - **User Principal ID** → `WOMPI_PAYOUTS_USER_PRINCIPAL_ID`
   - **Account ID** → `WOMPI_PAYOUTS_ACCOUNT_ID`

Y pones los datos de **tu cuenta Nequi** (destino del dinero):
   - `NEQUI_PHONE` → tu celular Nequi (ej. 3001234567)
   - `NEQUI_LEGAL_ID` → tu cédula
   - `NEQUI_NAME` → tu nombre
   - `NEQUI_EMAIL` → tu correo

> Si aún no tienes "Pagos a Terceros", la billetera **igual muestra el saldo**,
> pero al dar "Transferir a Nequi" dirá *"modo pendiente: faltan las credenciales"*.
> Eso es normal hasta que Wompi te habilite las dispersiones.

---

## 5. ⚙️ Pegar las llaves en Render (paso final)

Tu web está publicada en **Render** (`pagos-en-l-nea.onrender.com`). Ahí se ponen
las llaves, **nunca en el código**.

1. Entra a **https://dashboard.render.com** y abre tu servicio **pagos-en-l-nea**.
2. Ve a la pestaña **Environment** (Variables de entorno).
3. Añade cada variable con su valor (botón **Add Environment Variable**):

| Variable | Valor (ejemplo) | Para qué |
|----------|-----------------|----------|
| `DEMO_MODE` | `false` | Apagar el modo de pruebas |
| `AUTH_SECRET` | *(cadena larga aleatoria)* | Firmar las sesiones del login |
| `FLOW_API_KEY` | *(de Flow)* | Cobros Chile |
| `FLOW_SECRET_KEY` | *(de Flow)* | Cobros Chile |
| `FLOW_ENV` | `production` | Cobrar de verdad en Chile |
| `WOMPI_PUBLIC_KEY` | `pub_prod_...` | Cobros Colombia |
| `WOMPI_PRIVATE_KEY` | `prv_prod_...` | Cobros Colombia |
| `WOMPI_INTEGRITY_SECRET` | *(de Wompi)* | Firmar el pago |
| `WOMPI_EVENTS_SECRET` | *(de Wompi)* | Validar el webhook |
| `WOMPI_ENV` | `production` | Cobrar de verdad en Colombia |
| `WOMPI_PAYOUTS_API_KEY` | *(de Wompi)* | Dispersar a Nequi |
| `WOMPI_PAYOUTS_USER_PRINCIPAL_ID` | *(de Wompi)* | Dispersar a Nequi |
| `WOMPI_PAYOUTS_ACCOUNT_ID` | *(de Wompi)* | Dispersar a Nequi |
| `SETTLE_TO_NEQUI` | `true` | Enviar el saldo a Nequi |
| `NEQUI_PHONE` | `3001234567` | Tu Nequi (destino) |
| `NEQUI_LEGAL_ID` | `1234567890` | Tu cédula |
| `NEQUI_NAME` | `Tu Nombre` | Titular Nequi |
| `NEQUI_EMAIL` | `tucorreo@ejemplo.com` | Correo Nequi |

> Para generar una `AUTH_SECRET` segura, corre en tu computador:
> `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

4. Pulsa **Save Changes**. Render **reinicia la web sola**.
5. Abre tu web → entra al **panel del comercio** (`/admin.html`). El aviso rojo
   desaparece y la sección **🔑 Activación de cobros reales** se pone en verde. ✅

---

## 6. ✅ Cómo comprobar que quedó bien

1. En el **panel del comercio** ya **no** aparece el aviso de "cobros sin activar".
2. En **🔑 Activación de cobros reales** todo sale con **✅**.
3. Haz una **prueba de cobro**:
   - **Chile:** genera un pago y verás el **código** para pagar en Servipag/Sencillito.
   - **Colombia:** prueba con una tarjeta de **prueba** de Wompi; el pago debe
     aparecer como **PAGADO** en "Órdenes recientes".
4. Cuando un cobro colombiano quede **PAGADO**, el saldo sube en la **billetera**
   y podrás pulsar **"Transferir a Nequi"**.

---

## 7. ❓ Preguntas frecuentes

**¿Tengo que poner RUT a los clientes de Chile en la web?**
No. El cliente chileno paga con el **código** que le da la web/el comercio. El RUT
solo lo necesitas **tú** para abrir la cuenta de comercio en Flow.

**¿La web guarda el dinero?**
No. Lo custodia la pasarela (Flow/Wompi). La web solo muestra el saldo y ordena la
transferencia a tu Nequi. Así es como debe ser legalmente.

**¿Puedo probar sin llaves reales?**
Sí: con `DEMO_MODE=true` la web **simula** el pago para que pruebes la pantalla.
Pero para cobrar de verdad hay que poner las llaves y `DEMO_MODE=false`.

**¿Qué pasa si solo tengo Flow (Chile) y todavía no Wompi (Colombia)?**
La web funciona igual: Chile cobra de verdad y Colombia queda en "sin activar"
hasta que pegues las llaves de Wompi. Cada país se activa por separado.

---

## 8. 📌 Resumen de variables de entorno

```
# Modo
DEMO_MODE=false

# Seguridad (login)
AUTH_SECRET=<cadena larga y aleatoria>

# Chile — Flow
FLOW_API_KEY=<de Flow>
FLOW_SECRET_KEY=<de Flow>
FLOW_ENV=production

# Colombia — Wompi
WOMPI_PUBLIC_KEY=pub_prod_...
WOMPI_PRIVATE_KEY=prv_prod_...
WOMPI_INTEGRITY_SECRET=<de Wompi>
WOMPI_EVENTS_SECRET=<de Wompi>
WOMPI_ENV=production

# Dispersión a Nequi (Wompi Pagos a Terceros)
WOMPI_PAYOUTS_API_KEY=<de Wompi>
WOMPI_PAYOUTS_USER_PRINCIPAL_ID=<de Wompi>
WOMPI_PAYOUTS_ACCOUNT_ID=<de Wompi>
SETTLE_TO_NEQUI=true
NEQUI_PHONE=<tu celular Nequi>
NEQUI_LEGAL_ID=<tu cédula>
NEQUI_NAME=<tu nombre>
NEQUI_EMAIL=<tu correo>
```
