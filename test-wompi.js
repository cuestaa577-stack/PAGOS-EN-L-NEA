/* =============================================================================
   test-wompi.js — Pruebas de la integracion con Wompi (sin llaves reales)
   Verifica:
     1. Firma de integridad contra el ejemplo OFICIAL de la documentacion.
     2. Generacion de la URL del Web Checkout.
     3. Verificacion del checksum de un evento (webhook) valido.
     4. Rechazo de un evento con checksum manipulado.
   Ejecuta:  node test-wompi.js
   ============================================================================= */

const crypto = require('crypto');
const Wompi = require('./lib/wompi');

let pass = 0, fail = 0;
function check(nombre, condicion) {
  if (condicion) { console.log('  PASS  ' + nombre); pass++; }
  else { console.log('  FAIL  ' + nombre); fail++; }
}

// ---------------------------------------------------------------------------
console.log('\n1) Firma de integridad (ejemplo oficial de Wompi)');
// Ejemplo publicado por Wompi (docs.wompi.co):
//   referencia: sk8-438k4-xmxm392-sn2m
//   monto: 2490000 centavos
//   moneda: COP
//   secreto: prod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6
//   firma esperada: 37c8407747e595535433ef8f6a811d853cd943046624a0ec04662b17bbf33bf5
const w = new Wompi({
  publicKey: 'pub_prod_x',
  integritySecret: 'prod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6',
  env: 'production',
});
const firma = w.integritySignature('sk8-438k4-xmxm392-sn2m', 2490000, 'COP');
check('firma coincide con el ejemplo oficial',
  firma === '37c8407747e595535433ef8f6a811d853cd943046624a0ec04662b17bbf33bf5');
console.log('        firma calculada:', firma);

// ---------------------------------------------------------------------------
console.log('\n2) URL del Web Checkout');
const url = w.buildCheckoutUrl({
  reference: 'CO-TEST01',
  amountInCents: 5000000,
  redirectUrl: 'https://midominio.com/api/retorno-wompi',
  customerData: { email: 'cliente@ejemplo.com', fullName: 'Juan Perez' },
});
check('contiene public-key', url.includes('public-key='));
check('contiene currency=COP', url.includes('currency=COP'));
check('contiene amount-in-cents', url.includes('amount-in-cents=5000000'));
check('contiene signature:integrity', url.includes('signature%3Aintegrity=') || url.includes('signature:integrity='));
check('apunta a checkout.wompi.co', url.startsWith('https://checkout.wompi.co/p/'));

// ---------------------------------------------------------------------------
console.log('\n3) Verificacion del checksum de un evento (webhook)');
const eventsSecret = 'prod_events_ABC123';
const we = new Wompi({ publicKey: 'pub_prod_x', eventsSecret, env: 'production' });

const evento = {
  event: 'transaction.updated',
  data: {
    transaction: {
      id: '1234-5678-9012',
      status: 'APPROVED',
      amount_in_cents: 5000000,
      reference: 'CO-TEST01',
    },
  },
  timestamp: 1700000000,
  signature: {
    properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'],
    checksum: '',
  },
};
// Calcula el checksum REAL con el algoritmo documentado (para el test).
const valores = evento.signature.properties.map((r) =>
  r.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), evento.data)
);
evento.signature.checksum = crypto
  .createHash('sha256')
  .update(valores.join('') + evento.timestamp + eventsSecret)
  .digest('hex')
  .toUpperCase();

check('acepta un evento valido', we.verifyEvent(evento) === true);

// ---------------------------------------------------------------------------
console.log('\n4) Rechazo de un evento manipulado');
const manipulado = JSON.parse(JSON.stringify(evento));
manipulado.data.transaction.amount_in_cents = 1; // alterado
check('rechaza un evento con datos alterados', we.verifyEvent(manipulado) === false);

const sinFirma = JSON.parse(JSON.stringify(evento));
sinFirma.signature = {};
check('rechaza un evento sin firma', we.verifyEvent(sinFirma) === false);

// ---------------------------------------------------------------------------
console.log(`\nRESULTADO: ${pass} PASS / ${fail} FAIL\n`);
process.exit(fail === 0 ? 0 : 1);
