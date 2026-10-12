/* =============================================================================
   lib/flow.js — Cliente de la API de Flow.cl (Chile)
   -----------------------------------------------------------------------------
   Flow es una pasarela de pagos chilena certificada PCI-DSS. Permite cobrar con
   TARJETA (credito/debito) y en EFECTIVO mediante "cupon de pago presencial"
   (red Servipag / Servipag Express / Sencillito).

   La web del comercio NUNCA captura los datos de la tarjeta: redirige al
   checkout seguro de Flow. Aqui solo se crea la orden y se consulta su estado.

   Autenticacion: firma HMAC-SHA256.
     1. Se toman todos los parametros (excepto "s").
     2. Se ordenan alfabeticamente por nombre.
     3. Se concatenan "nombre+valor" de cada uno.
     4. Se firma ese string con la secretKey usando HMAC-SHA256 (hex).
     5. El resultado se envia en el parametro "s".

   Documentacion: https://www.flow.cl/docs/api.html
   ============================================================================= */

const crypto = require('crypto');
const axios = require('axios');

class Flow {
  /**
   * @param {Object} opts
   * @param {string} opts.apiKey      API Key del comercio (Flow)
   * @param {string} opts.secretKey   Secret Key del comercio (Flow)
   * @param {string} [opts.baseUrl]   URL base de la API
   */
  constructor({ apiKey, secretKey, baseUrl } = {}) {
    this.apiKey = apiKey;
    this.secretKey = secretKey;
    this.baseUrl = (baseUrl || 'https://www.flow.cl/api').replace(/\/+$/, '');
  }

  /**
   * Firma HMAC-SHA256 de un conjunto de parametros.
   * @param {Object} params
   * @returns {string} firma en hex
   */
  sign(params) {
    const keys = Object.keys(params)
      .filter((k) => k !== 's' && params[k] !== undefined && params[k] !== null)
      .sort();
    const toSign = keys.map((k) => k + params[k]).join('');
    return crypto.createHmac('sha256', this.secretKey).update(toSign).digest('hex');
  }

  /** Realiza un POST form-urlencoded firmado. */
  async post(path, params = {}) {
    const payload = Object.assign({ apiKey: this.apiKey }, params);
    payload.s = this.sign(payload);
    const body = new URLSearchParams(payload).toString();
    const { data } = await axios.post(`${this.baseUrl}${path}`, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 20000,
    });
    return data;
  }

  /** Realiza un GET firmado. */
  async get(path, params = {}) {
    const payload = Object.assign({ apiKey: this.apiKey }, params);
    payload.s = this.sign(payload);
    const { data } = await axios.get(`${this.baseUrl}${path}`, {
      params: payload,
      timeout: 20000,
    });
    return data;
  }

  /**
   * Crea una orden de pago.
   * @param {Object} p
   * @param {string} p.commerceOrder  Identificador de la orden en el comercio
   * @param {string} p.subject        Descripcion del cobro
   * @param {number} p.amount         Monto en CLP (entero)
   * @param {string} p.email          Email del pagador
   * @param {string} p.urlConfirmation URL webhook (POST) de confirmacion
   * @param {string} p.urlReturn       URL de retorno del pagador
   * @param {number} [p.paymentMethod] 1=tarjeta, 9=cupon (efectivo)
   * @param {string} [p.optional]      Datos extra (JSON string)
   * @returns {Promise<{url:string, token:string, flowOrder:number}>}
   */
  async createPayment(p) {
    return this.post('/payment/create', {
      commerceOrder: p.commerceOrder,
      subject: p.subject,
      currency: p.currency || 'CLP',
      amount: p.amount,
      email: p.email,
      urlConfirmation: p.urlConfirmation,
      urlReturn: p.urlReturn,
      paymentMethod: p.paymentMethod,
      optional: p.optional,
      timeout: p.timeout,
    });
  }

  /** Consulta el estado de una orden por su token. */
  async getStatus(token) {
    return this.get('/payment/getStatus', { token });
  }

  /** Consulta el estado extendido (incluye datos del pagador y del pago). */
  async getStatusExtended(token) {
    return this.get('/payment/getStatusExtended', { token });
  }

  /** Reembolsa una orden pagada. */
  async refund({ token, amount, urlCallBack }) {
    return this.post('/refund/create', { token, amount, urlCallBack });
  }
}

module.exports = Flow;
