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
 * @param {boolean} [startFromMonthOne=true] Si es true, el primer abono es el mes 1 y luego cada `monthsBetween`.
 *   Si es false, el primer abono cae en el primer múltiplo de la frecuencia (p. ej. mes 6 si es semestral).
 * @returns {number}
 */
export function maxScheduledAbonoCount(totalMonths, monthsBetween, startFromMonthOne = true) {
  const n = Math.max(1, Math.floor(totalMonths));
  const step = Math.max(1, Math.floor(monthsBetween));
  if (startFromMonthOne) {
    return Math.max(0, Math.floor((n - 1) / step) + 1);
  }
  return Math.max(0, Math.floor(n / step));
}

/**
 * Meses en los que cae cada abono (1-based).
 * @param {number} totalMonths
 * @param {number} monthsBetween
 * @param {number} count
 * @param {boolean} [startFromMonthOne=true] Misma semántica que {@link maxScheduledAbonoCount}.
 * @returns {number[]}
 */
export function buildScheduledAbonoMonths(totalMonths, monthsBetween, count, startFromMonthOne = true) {
  const n = Math.max(1, Math.floor(totalMonths));
  const step = Math.max(1, Math.floor(monthsBetween));
  const maxCount = maxScheduledAbonoCount(n, step, startFromMonthOne);
  const k = Math.min(Math.max(0, Math.floor(count)), maxCount);
  const months = [];
  for (let i = 0; i < k; i++) {
    const m = startFromMonthOne ? 1 + i * step : (i + 1) * step;
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

/**
 * Abono uniforme mínimo en los meses dados por frecuencia (hasta `targetMonths`)
 * para que la simulación termine en a lo sumo `targetMonths` meses.
 *
 * @param {object} p
 * @param {number} p.principal
 * @param {number} p.annualRate
 * @param {number} p.years
 * @param {number} p.targetMonths Objetivo de meses hasta liquidar (1..plazo total)
 * @param {ExtraFrequencyId} p.frequencyId
 * @param {boolean} [p.startFromMonthOne]
 * @param {string} [p.strategy]
 * @returns {null | { amount: number, scheduledMonths: number[], strategy: string, targetMonths: number, totalMonths: number }}
 */
export function computeUniformExtraForTargetPayoff({
  principal,
  annualRate,
  years,
  targetMonths,
  frequencyId,
  startFromMonthOne = true,
  strategy = 'reduce_term'
}) {
  const totalMonths = Math.max(1, Math.floor(years * 12));
  if (principal <= 0 || !Number.isFinite(principal)) return null;

  const T = Math.floor(Number(targetMonths));
  if (!Number.isFinite(T) || T <= 0 || T > totalMonths) return null;

  if (T >= totalMonths) {
    return { amount: 0, scheduledMonths: [], strategy, targetMonths: T, totalMonths };
  }

  const monthsBetween = getMonthsBetweenAbonos(
    /** @type {'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual'} */ (frequencyId)
  );
  const maxCount = maxScheduledAbonoCount(T, monthsBetween, startFromMonthOne);
  if (maxCount === 0) return null;

  const scheduledMonths = buildScheduledAbonoMonths(T, monthsBetween, maxCount, startFromMonthOne);
  if (!scheduledMonths.length) return null;

  const extrasForAmount = (amount) =>
    scheduledMonths.map((month) => ({ month, amount, strategy }));

  /** @param {number} amount */
  const monthsUsed = (amount) =>
    simulateLoan({ principal, annualRate, years, extras: extrasForAmount(amount) }).totalMonthsUsed;

  if (monthsUsed(0) <= T) {
    return { amount: 0, scheduledMonths, strategy, targetMonths: T, totalMonths };
  }

  let hi = 1;
  let guard = 0;
  while (monthsUsed(hi) > T && guard < 90) {
    hi *= 2;
    guard++;
    if (!Number.isFinite(hi) || hi > 1e25) return null;
  }
  if (monthsUsed(hi) > T) return null;

  let lo = 0;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (monthsUsed(mid) <= T) hi = mid;
    else lo = mid;
  }

  let amount = Math.max(0, hi);
  const round2 = (x) => Math.round(x * 100) / 100;
  amount = round2(amount);
  if (monthsUsed(amount) > T) {
    amount = Math.ceil(hi * 100) / 100;
    let steps = 0;
    while (monthsUsed(amount) > T && steps < 100000 && amount < 1e20) {
      amount = round2(amount + 0.01);
      steps++;
    }
    if (monthsUsed(amount) > T) return null;
  }

  return { amount, scheduledMonths, strategy, targetMonths: T, totalMonths };
}

/**
 * Con monto y frecuencia fijos, meses totales al usar los primeros K abonos.
 * @returns {number}
 */
function monthsUsedForAbonoCount(
  principal,
  annualRate,
  years,
  amountPerAbono,
  monthsBetween,
  totalMonths,
  k,
  startFromMonthOne,
  strategy
) {
  const scheduledMonths = buildScheduledAbonoMonths(totalMonths, monthsBetween, k, startFromMonthOne);
  const extras = scheduledMonths.map((month) => ({ month, amount: amountPerAbono, strategy }));
  return simulateLoan({ principal, annualRate, years, extras }).totalMonthsUsed;
}

/**
 * Simula abonos en todos los huecos del plazo y cuenta cuántas fechas de abono quedan en o antes del mes en que
 * se liquida el préstamo (las posteriores no tendrían sentido).
 *
 * @returns {number}
 */
function countAbonoSlotsUntilPayoff({
  principal,
  annualRate,
  years,
  amountPerAbono,
  monthsBetween,
  totalMonths,
  startFromMonthOne,
  strategy
}) {
  const slotCount = maxScheduledAbonoCount(totalMonths, monthsBetween, startFromMonthOne);
  if (slotCount === 0) return 0;
  const scheduledMonths = buildScheduledAbonoMonths(totalMonths, monthsBetween, slotCount, startFromMonthOne);
  const extras = scheduledMonths.map((month) => ({ month, amount: amountPerAbono, strategy }));
  const sim = simulateLoan({ principal, annualRate, years, extras });
  const payoffMonth = sim.totalMonthsUsed;
  let n = 0;
  for (const m of scheduledMonths) {
    if (m <= payoffMonth) n++;
    else break;
  }
  return n;
}

/**
 * Límites para el tab de monto fijo:
 * - maxK: abonos que aún aplican antes de liquidar (≤ huecos del plazo según frecuencia e inicio).
 * - minK: menor K con el mismo tiempo total que usar los maxK abonos (referencia UX; el selector va de 1 a maxK).
 *
 * @param {object} p
 * @param {number} p.principal
 * @param {number} p.annualRate
 * @param {number} p.years
 * @param {number} p.amountPerAbono
 * @param {ExtraFrequencyId} p.frequencyId
 * @param {boolean} [p.startFromMonthOne]
 * @param {string} [p.strategy]
 * @returns {null | { minK: number, maxK: number, monthsAtFull: number }}
 */
export function computeFixedAbonoCountBounds({
  principal,
  annualRate,
  years,
  amountPerAbono,
  frequencyId,
  startFromMonthOne = true,
  strategy = 'reduce_term'
}) {
  const totalMonths = Math.max(1, Math.floor(years * 12));
  const monthsBetween = getMonthsBetweenAbonos(
    /** @type {'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual'} */ (frequencyId)
  );
  const slotsInTerm = maxScheduledAbonoCount(totalMonths, monthsBetween, startFromMonthOne);
  if (slotsInTerm === 0 || amountPerAbono <= 0 || !Number.isFinite(amountPerAbono)) {
    return null;
  }

  const maxK = countAbonoSlotsUntilPayoff({
    principal,
    annualRate,
    years,
    amountPerAbono,
    monthsBetween,
    totalMonths,
    startFromMonthOne,
    strategy
  });
  if (maxK < 1) {
    return null;
  }

  const mu = (k) =>
    monthsUsedForAbonoCount(
      principal,
      annualRate,
      years,
      amountPerAbono,
      monthsBetween,
      totalMonths,
      k,
      startFromMonthOne,
      strategy
    );

  const monthsAtFull = mu(maxK);

  let lo = 1;
  let hi = maxK;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (mu(mid) > monthsAtFull) lo = mid + 1;
    else hi = mid;
  }
  const minK = Math.min(lo, maxK);

  return { minK, maxK, monthsAtFull };
}

/**
 * Vista previa para tab «monto fijo»: meses programados, escenario y ahorros vs línea base.
 *
 * @param {object} p
 * @param {number} p.abonoCount
 * @returns {null | {
 *   scheduledMonths: number[],
 *   scenario: ReturnType<typeof simulateLoan>,
 *   baseline: ReturnType<typeof simulateLoan>,
 *   monthsSaved: number,
 *   interestSaved: number,
 *   bounds: { minK: number, maxK: number, monthsAtFull: number }
 * }}
 */
export function previewFixedAmountAbonoPlan({
  principal,
  annualRate,
  years,
  amountPerAbono,
  frequencyId,
  startFromMonthOne = true,
  strategy = 'reduce_term',
  abonoCount
}) {
  const bounds = computeFixedAbonoCountBounds({
    principal,
    annualRate,
    years,
    amountPerAbono,
    frequencyId,
    startFromMonthOne,
    strategy
  });
  if (!bounds) return null;

  const kRaw = Math.floor(Number(abonoCount));
  const k = Math.min(Math.max(1, kRaw), bounds.maxK);
  const totalMonths = Math.max(1, Math.floor(years * 12));
  const monthsBetween = getMonthsBetweenAbonos(
    /** @type {'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual'} */ (frequencyId)
  );
  const scheduledMonths = buildScheduledAbonoMonths(totalMonths, monthsBetween, k, startFromMonthOne);
  const extras = scheduledMonths.map((month) => ({ month, amount: amountPerAbono, strategy }));
  const scenario = simulateLoan({ principal, annualRate, years, extras });
  const baseline = simulateLoan({ principal, annualRate, years, extras: [] });

  return {
    scheduledMonths,
    scenario,
    baseline,
    monthsSaved: Math.max(0, baseline.totalMonthsUsed - scenario.totalMonthsUsed),
    interestSaved: Math.max(0, baseline.totalInterest - scenario.totalInterest),
    bounds,
    abonoCountUsed: k
  };
}
