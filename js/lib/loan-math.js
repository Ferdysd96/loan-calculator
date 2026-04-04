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
