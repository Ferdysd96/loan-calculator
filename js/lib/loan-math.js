/**
 * Motor de simulación de préstamo (sin DOM).
 */

/**
 * @param {number} balance
 * @param {number} monthlyRate
 * @param {number} months
 * @returns {number}
 */
export function computePayment(balance, monthlyRate, months) {
  if (balance <= 0) return 0;
  if (months <= 0) return balance;
  if (monthlyRate === 0) return balance / months;
  return (balance * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
}

/**
 * @param {number} balance
 * @param {number} monthlyRate
 * @param {number} payment
 * @returns {number}
 */
export function computeMonthsNeeded(balance, monthlyRate, payment) {
  if (balance <= 0) return 0;
  if (payment <= 0) return Infinity;
  if (monthlyRate === 0) return Math.ceil(balance / payment);
  if (payment <= balance * monthlyRate) return Infinity;
  const exactMonths = -Math.log(1 - (balance * monthlyRate) / payment) / Math.log(1 + monthlyRate);
  return Math.max(0, Math.ceil(exactMonths - 1e-10));
}

/**
 * @param {object} params
 * @param {number} params.principal
 * @param {number} params.annualRate
 * @param {number} params.years
 * @param {Array<{ month: number, amount: number, strategy: string }>} params.extras
 */
export function simulateLoan({ principal, annualRate, years, extras }) {
  const totalMonths = Math.max(1, Math.floor(years * 12));
  const monthlyRate = annualRate / 100 / 12;
  const standardPayment = computePayment(principal, monthlyRate, totalMonths);

  let balance = principal;
  let currentPayment = standardPayment;
  let remainingMonths = totalMonths;
  let month = 1;
  let totalInterest = 0;
  let totalPaid = 0;
  let extraIndex = 0;
  const rows = [];
  const ignoredExtras = [];

  while (balance > 0.000001 && month <= 5000) {
    const startingBalance = balance;
    const interest = startingBalance * monthlyRate;
    let regularPayment = currentPayment;

    if (regularPayment <= 0 && remainingMonths > 0) {
      regularPayment = computePayment(balance, monthlyRate, remainingMonths);
    }

    regularPayment = Math.min(regularPayment, startingBalance + interest);
    const regularPrincipal = Math.max(0, regularPayment - interest);
    balance = Math.max(0, startingBalance - regularPrincipal);

    let monthExtraApplied = 0;
    let futureMonths = Math.max(0, remainingMonths - 1);
    let nextPayment = currentPayment;

    while (extraIndex < extras.length && extras[extraIndex].month === month) {
      const item = extras[extraIndex];
      const applied = Math.min(item.amount, balance);
      monthExtraApplied += applied;
      balance = Math.max(0, balance - applied);

      if (balance <= 0.000001) {
        balance = 0;
        futureMonths = 0;
        nextPayment = 0;
        extraIndex++;
        continue;
      }

      if (item.strategy === 'reduce_payment') {
        nextPayment = computePayment(balance, monthlyRate, futureMonths);
      } else {
        futureMonths = computeMonthsNeeded(balance, monthlyRate, nextPayment);
      }

      extraIndex++;
    }

    totalInterest += interest;
    totalPaid += regularPayment + monthExtraApplied;

    rows.push({
      month,
      payment: regularPayment + monthExtraApplied,
      interest,
      principal: regularPrincipal + monthExtraApplied,
      balance,
      hasExtra: monthExtraApplied > 0,
      extraApplied: monthExtraApplied,
      scheduledNextRegular: balance <= 0.000001 ? 0 : nextPayment,
      scheduleMonthsRemaining: balance <= 0.000001 ? 0 : futureMonths
    });

    currentPayment = nextPayment;
    remainingMonths = futureMonths;
    month += 1;
  }

  while (extraIndex < extras.length) {
    ignoredExtras.push(extras[extraIndex]);
    extraIndex++;
  }

  return {
    rows,
    totalInterest,
    totalPaid,
    totalMonthsUsed: rows.length,
    standardPayment,
    ignoredExtras,
    monthlyRate,
    totalMonths
  };
}

/**
 * Escenario baseline + con extras para exportaciones. null si el formulario no es válido.
 *
 * @param {object} p
 * @param {number} p.principal
 * @param {number} p.annualRate
 * @param {number} p.years
 * @param {Array} p.extras
 * @returns {null | { principal: number, annualRate: number, years: number, extras: Array, baseline: object, scenario: object }}
 */
export function buildExportScenarioFromInputs({ principal, annualRate, years, extras }) {
  if (principal <= 0 || years <= 0) return null;
  const baseline = simulateLoan({ principal, annualRate, years, extras: [] });
  const scenario = simulateLoan({ principal, annualRate, years, extras });
  return { principal, annualRate, years, extras, baseline, scenario };
}

/** @typedef {'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual'} ExtraFrequencyId */

/**
 * @param {ExtraFrequencyId} frequencyId
 * @returns {number} meses entre abonos (1–12)
 */
export function getMonthsBetweenAbonos(frequencyId) {
  switch (frequencyId) {
    case 'monthly':
      return 1;
    case 'bimonthly':
      return 2;
    case 'quarterly':
      return 3;
    case 'semiannual':
      return 6;
    case 'annual':
      return 12;
    default:
      return 1;
  }
}

/**
 * Máximo de abonos posibles según cuotas totales y espaciado.
 * @param {number} totalMonths
 * @param {number} monthsBetween
 * @returns {number}
 */
export function maxScheduledAbonoCount(totalMonths, monthsBetween) {
  const n = Math.max(1, Math.floor(totalMonths));
  const step = Math.max(1, Math.floor(monthsBetween));
  return Math.max(0, Math.floor(n / step));
}

/**
 * Meses en los que cae cada abono (1-based), empezando en el mes 1.
 * @param {number} totalMonths
 * @param {number} monthsBetween
 * @param {number} count
 * @returns {number[]}
 */
export function buildScheduledAbonoMonths(totalMonths, monthsBetween, count) {
  const n = Math.max(1, Math.floor(totalMonths));
  const step = Math.max(1, Math.floor(monthsBetween));
  const maxCount = maxScheduledAbonoCount(n, step);
  const k = Math.min(Math.max(0, Math.floor(count)), maxCount);
  const months = [];
  for (let i = 0; i < k; i++) {
    const m = 1 + i * step;
    if (m <= n) months.push(m);
  }
  return months;
}

/**
 * Saldo pendiente justo después del pago regular y antes de abonos extra (simulación base sin extras).
 * Clave: número de mes (1..n). Si el préstamo se liquida antes, los meses posteriores no aparecen.
 *
 * @param {object} p
 * @param {number} p.principal
 * @param {number} p.annualRate
 * @param {number} p.years
 * @returns {Map<number, number>}
 */
export function computeBaselineBalanceBeforeExtrasByMonth({ principal, annualRate, years }) {
  const totalMonths = Math.max(1, Math.floor(years * 12));
  const monthlyRate = annualRate / 100 / 12;
  const standardPayment = computePayment(principal, monthlyRate, totalMonths);

  let balance = principal;
  let currentPayment = standardPayment;
  let remainingMonths = totalMonths;
  let month = 1;
  const map = new Map();

  while (balance > 0.000001 && month <= 5000) {
    const startingBalance = balance;
    const interest = startingBalance * monthlyRate;
    let regularPayment = currentPayment;

    if (regularPayment <= 0 && remainingMonths > 0) {
      regularPayment = computePayment(balance, monthlyRate, remainingMonths);
    }

    regularPayment = Math.min(regularPayment, startingBalance + interest);
    const regularPrincipal = Math.max(0, regularPayment - interest);
    balance = Math.max(0, startingBalance - regularPrincipal);

    map.set(month, balance);

    const futureMonths = Math.max(0, remainingMonths - 1);
    const nextPayment = currentPayment;

    currentPayment = nextPayment;
    remainingMonths = futureMonths;
    month += 1;
  }

  return map;
}

/**
 * Monto máximo uniforme por abono (mismo monto en todos los meses indicados) sin superar
 * el saldo aplicable en cada mes en la línea base (sin extras).
 *
 * @param {object} p
 * @param {number} p.principal
 * @param {number} p.annualRate
 * @param {number} p.years
 * @param {number[]} scheduledMonths
 * @returns {number}
 */
export function computeMaxUniformExtraAmount({ principal, annualRate, years, scheduledMonths }) {
  if (!scheduledMonths.length) return 0;
  const map = computeBaselineBalanceBeforeExtrasByMonth({ principal, annualRate, years });
  let min = Infinity;
  for (const mo of scheduledMonths) {
    const v = map.get(mo);
    if (v === undefined || !Number.isFinite(v)) {
      return 0;
    }
    min = Math.min(min, v);
  }
  return Number.isFinite(min) && min > 0 ? min : 0;
}
