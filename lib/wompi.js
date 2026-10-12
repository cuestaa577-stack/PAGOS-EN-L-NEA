/* =============================================================================
   lib/wompi.js — Cliente de Wompi (Colombia, grupo Bancolombia)
   -----------------------------------------------------------------------------
   Permite cobrar en Colombia con TARJETA, NEQUI y PSE mediante el "Web Checkout"
   (pagina segura de Wompi). La web del comercio NUNCA ve los datos de la tarjeta.

   - Checkout:  https://checkout.wompi.co/p/  (con firma de integridad)
   - API:       https://production.wompi.co/v1  |  https://sandbox.wompi.co/v1
   - Firma de integridad: SHA256("<reference><amountInCents><currency><secret>")
   - Webhook (event transaction.updated): checksum =
        SHA256( concat(valores de signature.properties, en orden) + timestamp + eventsSecret )
        (en MAYUSCULAS) y tambien llega en el header X-Event-Checksum.

   Ademas incluye "Pagos a Terceros" (dispersiones/payouts) para enviar el dinero
   a la cuenta Nequi del comercio (bankId NEQUI = 1507).
   ============================================================================= */

const crypto = require('crypto');
const axios = require('axios');

const NEQUI_BANK_ID = '1507'; // Nequi (Wompi pagos a terceros)

class Wompi {
  /**
   * @param {Object} opts
   * @param {string} opts.publicKey        Llave publica (pub_test_ / pub_prod_)
   * @param {string} opts.privateKey       Llave privada (prv_test_ / prv_prod_)
   * @param {string} opts.integritySecret  Secreto de integridad (test_/prod_integrity_)
   * @param {string} opts.eventsSecret     Secreto de eventos (test_/prod_events_)
   * @param {string} [opts.env]            'production' | 'sandbox'
   */
  constructor({ publicKey, privateKey, integritySecret, eventsSecret, env } = {}) {
    this.publicKey = publicKey;
    this.privateKey = privateKey;
    this.integritySecret = integritySecret;
    this.eventsSecret = eventsSecret;
    const prod = (env || 'production') !== 'sandbox';
    this.baseUrl = prod ? 'https://production.wompi.co/v1' : 'https://sandbox.wompi.co/v1';
    this.checkoutUrl = 'https://checkout.wompi.co/p/';
  }

  /**
   * Firma de integridad para el checkout.
   * SHA256( reference + amountInCents + currency + integritySecret ) en hex minuscula.
   */
  integritySignature(reference, amountInCents, currency = 'COP') {
    const s = `${reference}${amountInCents}${currency}${this.integritySecret}`;
    return crypto.createHash('sha256').update(s).digest('hex');
  }

  /**
   * Construye la URL del Web Checkout con la firma de integridad.
   * @param {Object} p
   * @param {string} p.reference
   * @param {number} p.amountInCents
   * @param {string} [p.redirectUrl]
   * @param {Object} [p.customerData] { email, fullName, phoneNumber }
   * @param {string} [p.currency]
   */
  buildCheckoutUrl({ reference, amountInCents, redirectUrl, customerData = {}, currency = 'COP' }) {
    const params = new URLSearchParams();
    params.set('public-key', this.publicKey);
    params.set('currency', currency);
    params.set('amount-in-cents', String(amountInCents));
    params.set('reference', reference);
    params.set('signature:integrity', this.integritySignature(reference, amountInCents, currency));
    if (redirectUrl) params.set('redirect-url', redirectUrl);
    if (customerData.email) params.set('customer-data:email', customerData.email);
    if (customerData.fullName) params.set('customer-data:full-name', customerData.fullName);
    if (customerData.phoneNumber) params.set('customer-data:phone-number', customerData.phoneNumber);
    return `${this.checkoutUrl}?${params.toString()}`;
  }

  /** Consulta una transaccion por su id. */
  async getTransaction(id) {
    const { data } = await axios.get(`${this.baseUrl}/transactions/${id}`, {
      headers: { Authorization: `Bearer ${this.publicKey}` },
      timeout: 20000,
    });
    return data;
  }

  /**
   * Verifica el checksum de un evento (webhook) de Wompi.
   * @param {Object} body  Cuerpo JSON del evento
   * @returns {boolean}
   */
  verifyEvent(body) {
    try {
      const props = body && body.signature && body.signature.properties;
      if (!Array.isArray(props)) return false;
      // Extrae el valor de cada ruta (ej. "transaction.id") desde body.data
      const valores = props.map((ruta) =>
        ruta.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), body.data)
      );
      const concat = valores.join('') + body.timestamp + this.eventsSecret;
      const checksum = crypto.createHash('sha256').update(concat).digest('hex').toUpperCase();
      return checksum === String(body.signature.checksum).toUpperCase();
    } catch (e) {
      return false;
    }
  }

  // ------------------------- Pagos a Terceros (payouts) ----------------------

  _payoutHeaders(cfg) {
    return {
      'x-api-key': cfg.apiKey,
      'user-principal-id': cfg.userPrincipalId,
      'Content-Type': 'application/json',
    };
  }

  /** Lista los bancos disponibles para dispersiones. */
  async getBanks(payoutsCfg) {
    const base = (payoutsCfg.baseUrl || 'https://api.payouts.wompi.co/v1').replace(/\/+$/, '');
    const { data } = await axios.get(`${base}/banks`, { headers: this._payoutHeaders(payoutsCfg), timeout: 20000 });
    return data;
  }

  /** Consulta cuentas destino registradas. */
  async getAccounts(payoutsCfg) {
    const base = (payoutsCfg.baseUrl || 'https://api.payouts.wompi.co/v1').replace(/\/+$/, '');
    const { data } = await axios.get(`${base}/accounts`, { headers: this._payoutHeaders(payoutsCfg), timeout: 20000 });
    return data;
  }

  /**
   * Crea un lote de dispersion (payout).
   * @param {Object} payoutsCfg { apiKey, userPrincipalId, accountId, baseUrl }
   * @param {Object} lote       Cuerpo del payout (transactions[])
   * @param {string} [idempotencyKey]
   */
  async createPayout(payoutsCfg, lote, idempotencyKey) {
    const base = (payoutsCfg.baseUrl || 'https://api.payouts.wompi.co/v1').replace(/\/+$/, '');
    const headers = this._payoutHeaders(payoutsCfg);
    if (idempotencyKey) headers['idempotency-key'] = String(idempotencyKey).slice(0, 64);
    const { data } = await axios.post(`${base}/payouts`, lote, { headers, timeout: 25000 });
    return data;
  }

  /**
   * Dispersa un monto a una cuenta Nequi.
   * @param {Object} payoutsCfg { apiKey, userPrincipalId, accountId, baseUrl }
   * @param {Object} p { reference, amountInCents, nequi:{ phone, legalId, legalIdType, name, email } }
   */
  async disperseToNequi(payoutsCfg, { reference, amountInCents, nequi }) {
    const lote = {
      accountId: payoutsCfg.accountId,
      transactions: [
        {
          reference,
          amount: amountInCents, // centavos
          bankId: NEQUI_BANK_ID,
          accountType: 'AHORROS',
          accountNumber: nequi.phone,
          paymentType: 'PROVIDERS',
          name: nequi.name,
          email: nequi.email,
          legalIdType: nequi.legalIdType || 'CC',
          legalId: nequi.legalId,
        },
      ],
    };
    return this.createPayout(payoutsCfg, lote, reference);
  }
}

module.exports = Wompi;
module.exports.NEQUI_BANK_ID = NEQUI_BANK_ID;
