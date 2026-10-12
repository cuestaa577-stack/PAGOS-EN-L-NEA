/* =============================================================================
   lib/settlement.js — Liquidacion / dispersion automatica a la cuenta Nequi
   -----------------------------------------------------------------------------
   Cuando una orden colombiana (COP) queda PAGADA, se dispersa el dinero a la
   cuenta Nequi del comercio usando Wompi "Pagos a Terceros".

   - Si la orden no es COP -> NO_APLICA (Chile se liquida via Flow).
   - Si la liquidacion esta desactivada o faltan llaves -> SIMULADO (modo demo).
   - Si esta activa y hay llaves -> ENVIADO (llama a la API real) o ERROR.
   ============================================================================= */

function maskPhone(phone) {
  const p = String(phone || '');
  if (p.length < 6) return '****';
  return p.slice(0, 3) + '****' + p.slice(-2);
}

/**
 * @param {Object} opts
 * @param {import('./wompi')} opts.wompi
 * @param {Object} opts.payoutsCfg  { apiKey, userPrincipalId, accountId, baseUrl }
 * @param {Object} opts.nequi       { phone, legalId, legalIdType, name, email }
 * @param {boolean} opts.enabled
 */
function createSettlement({ wompi, payoutsCfg, nequi, enabled }) {
  const activo = Boolean(enabled && payoutsCfg && payoutsCfg.apiKey && payoutsCfg.userPrincipalId && nequi && nequi.phone);

  async function liquidar(orden) {
    // Solo aplica a cobros en pesos colombianos.
    if (orden.currency !== 'COP') {
      return { estado: 'NO_APLICA', motivo: 'La liquidacion a Nequi aplica a cobros en COP (Colombia).' };
    }

    const montoCentavos = Math.round(Number(orden.amount) * 100);
    const referencia = `LIQ-${orden.id}`;

    if (!activo) {
      return {
        estado: 'SIMULADO',
        destino: 'NEQUI',
        nequiPhone: maskPhone(nequi && nequi.phone),
        montoCentavos,
        referencia,
        fecha: Date.now(),
      };
    }

    try {
      const resp = await wompi.disperseToNequi(payoutsCfg, {
        reference: referencia,
        amountInCents: montoCentavos,
        nequi,
      });
      return {
        estado: 'ENVIADO',
        destino: 'NEQUI',
        nequiPhone: maskPhone(nequi.phone),
        montoCentavos,
        referencia,
        fecha: Date.now(),
        respuesta: resp,
      };
    } catch (e) {
      const detalle = e && e.response && e.response.data ? e.response.data : (e && e.message);
      return {
        estado: 'ERROR',
        destino: 'NEQUI',
        montoCentavos,
        referencia,
        fecha: Date.now(),
        detalle,
      };
    }
  }

  return { liquidar, activo };
}

module.exports = { createSettlement, maskPhone };
