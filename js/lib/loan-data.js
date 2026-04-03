/**
 * Formato de archivo JSON y validación de importación.
 */

import { ALLOWED_CURRENCY_IDS } from './currency.js';

export const LOAN_DATA_FORMAT = 'loan-calculator-scenario';
export const LOAN_DATA_VERSION = 1;

export const ALLOWED_STRATEGIES = new Set(['reduce_term', 'reduce_payment']);

/**
 * @param {object} params
 * @param {number} params.principal
 * @param {number} params.annualRate
 * @param {number} params.years
 * @param {Array<{ month: number, amount: number, strategy: string }>} params.extras
 * @param {string} params.currencyId
 * @returns {object|null}
 */
export function buildLoanDataPayload({ principal, annualRate, years, extras, currencyId }) {
  if (principal <= 0 || years <= 0) return null;
  return {
    format: LOAN_DATA_FORMAT,
    version: LOAN_DATA_VERSION,
    exportedAt: new Date().toISOString(),
    loan: {
      principal,
      annualRatePercent: annualRate,
      termYears: years,
      currencyId
    },
    extras: extras.map((e) => ({
      month: e.month,
      amount: e.amount,
      strategy: e.strategy
    }))
  };
}

/**
 * @param {*} raw
 * @returns {{ ok: true, loan: object, extras: Array } | { ok: false, errors: string[] }}
 */
export function validateLoanImportPayload(raw) {
  const errors = [];
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['El archivo no contiene un objeto JSON válido.'] };
  }

  if (raw.format !== LOAN_DATA_FORMAT) {
    errors.push(`Formato no reconocido (se esperaba "${LOAN_DATA_FORMAT}").`);
  }
  if (raw.version !== LOAN_DATA_VERSION) {
    errors.push(`Versión no soportada (se esperaba ${LOAN_DATA_VERSION}).`);
  }

  const loan = raw.loan;
  if (!loan || typeof loan !== 'object') {
    errors.push('Falta el objeto "loan" con monto, tasa y plazo.');
    return { ok: false, errors };
  }

  const principal = Number(loan.principal);
  const annualRatePercent = Number(loan.annualRatePercent);
  const termYears = Number(loan.termYears);

  if (!Number.isFinite(principal) || principal <= 0) {
    errors.push('El monto del préstamo debe ser un número mayor que cero.');
  }
  if (!Number.isFinite(annualRatePercent) || annualRatePercent < 0) {
    errors.push('La tasa de interés debe ser un número mayor o igual a cero.');
  }
  if (!Number.isFinite(termYears) || termYears < 1 || Math.floor(termYears) !== termYears) {
    errors.push('El plazo en años debe ser un entero mayor o igual a 1.');
  }

  let currencyId = 'DOP';
  if (loan.currencyId !== undefined && loan.currencyId !== null) {
    if (typeof loan.currencyId !== 'string' || !ALLOWED_CURRENCY_IDS.has(loan.currencyId)) {
      errors.push('La moneda debe ser DOP, USD, UF o CLP.');
    } else {
      currencyId = loan.currencyId;
    }
  }

  if (errors.length) return { ok: false, errors };

  const totalMonths = Math.max(1, Math.floor(termYears) * 12);
  const extrasIn = Array.isArray(raw.extras) ? raw.extras : [];

  const normalizedExtras = [];
  extrasIn.forEach((item, index) => {
    const row = index + 1;
    if (!item || typeof item !== 'object') {
      errors.push(`Abono ${row}: entrada inválida.`);
      return;
    }
    const month = Number(item.month);
    const amount = Number(item.amount);
    const strategy = item.strategy;

    if (!Number.isFinite(month) || month !== Math.floor(month) || month < 1 || month > totalMonths) {
      errors.push(`Abono ${row}: la cuota debe ser un entero entre 1 y ${totalMonths}.`);
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push(`Abono ${row}: el monto debe ser un número mayor que cero.`);
    }
    if (typeof strategy !== 'string' || !ALLOWED_STRATEGIES.has(strategy)) {
      errors.push(`Abono ${row}: la estrategia debe ser "reduce_term" o "reduce_payment".`);
    }

    if (
      Number.isFinite(month) &&
      month === Math.floor(month) &&
      month >= 1 &&
      month <= totalMonths &&
      Number.isFinite(amount) &&
      amount > 0 &&
      typeof strategy === 'string' &&
      ALLOWED_STRATEGIES.has(strategy)
    ) {
      normalizedExtras.push({ month, amount, strategy });
    }
  });

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    loan: {
      principal,
      annualRatePercent,
      termYears: Math.floor(termYears),
      currencyId
    },
    extras: normalizedExtras
  };
}
