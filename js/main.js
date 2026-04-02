const loanAmountInput = document.getElementById('loanAmount');
const annualRateInput = document.getElementById('annualRate');
const termYearsInput = document.getElementById('termYears');
const extrasList = document.getElementById('extrasList');
const addExtraBtn = document.getElementById('addExtraBtn');
const clearExtrasBtn = document.getElementById('clearExtrasBtn');
const template = document.getElementById('extraRowTemplate');

const standardPaymentEl = document.getElementById('standardPayment');
const interestSavedEl = document.getElementById('interestSaved');
const estimatedMonthsEl = document.getElementById('estimatedMonths');
const monthsSavedEl = document.getElementById('monthsSaved');
const totalInterestEl = document.getElementById('totalInterest');
const totalPaidEl = document.getElementById('totalPaid');
const warningBox = document.getElementById('warningBox');
const amortizationBody = document.getElementById('amortizationBody');
const emptyState = document.getElementById('emptyState');
const tableSummary = document.getElementById('tableSummary');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const exportExcelBtn = document.getElementById('exportExcelBtn');
const exportDataBtn = document.getElementById('exportDataBtn');
const importDataBtn = document.getElementById('importDataBtn');
const importDataFile = document.getElementById('importDataFile');
const currencySelect = document.getElementById('currencySelect');

let extraSequence = 0;

/**
 * Monedas disponibles. UF usa código ISO CLF (Unidad de Fomento, Chile) para Intl.
 * @type {ReadonlyArray<{ id: string, code: string, label: string, locale: string }>}
 */
const CURRENCIES = Object.freeze([
  { id: 'DOP', code: 'DOP', label: 'DOP — Peso dominicano', locale: 'es-DO' },
  { id: 'USD', code: 'USD', label: 'USD — Dólar estadounidense', locale: 'en-US' },
  { id: 'UF', code: 'CLF', label: 'UF — Unidad de fomento (Chile)', locale: 'es-CL' },
  { id: 'CLP', code: 'CLP', label: 'CLP — Peso chileno', locale: 'es-CL' }
]);

const ALLOWED_CURRENCY_IDS = new Set(CURRENCIES.map((c) => c.id));

/** @type {Record<string, Intl.NumberFormat>} */
const currencyFormatterCache = {};

/**
 * @param {string} currencyId
 * @return {typeof CURRENCIES[number]}
 */
function getCurrencyById(currencyId) {
  return CURRENCIES.find((c) => c.id === currencyId) || CURRENCIES[0];
}

/**
 * @param {typeof CURRENCIES[number]} currency
 * @return {Intl.NumberFormat}
 */
function getCurrencyFormatter(currency) {
  const key = currency.id;
  if (!currencyFormatterCache[key]) {
    const isUf = currency.code === 'CLF';
    currencyFormatterCache[key] = new Intl.NumberFormat(currency.locale, {
      style: 'currency',
      currency: currency.code,
      minimumFractionDigits: isUf ? 2 : 0,
      maximumFractionDigits: isUf ? 4 : 0
    });
  }
  return currencyFormatterCache[key];
}

/**
 * Formats a currency value
 *
 * @param {*} value
 * @return {*} 
 */
function formatCurrency(value) {
  const cur = getCurrencyById(currencySelect.value);
  return getCurrencyFormatter(cur).format(Number.isFinite(value) ? value : 0);
}

CURRENCIES.forEach((c) => {
  const opt = document.createElement('option');
  opt.value = c.id;
  opt.textContent = c.label;
  currencySelect.appendChild(opt);
});
currencySelect.value = 'DOP';

/**
 * Formats a number
 *
 * @param {*} value
 * @return {*} 
 */
function formatNumber(value) {
  return new Intl.NumberFormat('es-DO').format(Number.isFinite(value) ? Math.round(value) : 0);
}

/**
 * Converts a value to a number
 *
 * @param {*} value
 * @return {*} 
 */
function toNumber(value) {
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Computes the payment
 *
 * @param {*} balance
 * @param {*} monthlyRate
 * @param {*} months
 * @return {*} 
 */
function computePayment(balance, monthlyRate, months) {
  if (balance <= 0) return 0;
  if (months <= 0) return balance;
  if (monthlyRate === 0) return balance / months;
  return balance * monthlyRate / (1 - Math.pow(1 + monthlyRate, -months));
}

/**
 * Computes the months needed
 *
 * @param {*} balance
 * @param {*} monthlyRate
 * @param {*} payment
 * @return {*} 
 */
function computeMonthsNeeded(balance, monthlyRate, payment) {
  if (balance <= 0) return 0;
  if (payment <= 0) return Infinity;
  if (monthlyRate === 0) return Math.ceil(balance / payment);
  if (payment <= balance * monthlyRate) return Infinity;
  const exactMonths = -Math.log(1 - (balance * monthlyRate) / payment) / Math.log(1 + monthlyRate);
  return Math.max(0, Math.ceil(exactMonths - 1e-10));
}

/**
 * Gets the total months
 *
 * @return {*} 
 */
function getTotalMonths() {
  const years = Math.max(1, Math.floor(toNumber(termYearsInput.value)));
  return years * 12;
}

/**
 * Fills the month options
 *
 * @param {*} select
 * @param {*} selectedValue
 * @return {*} 
 */
function fillMonthOptions(select, selectedValue) {
  const totalMonths = getTotalMonths();
  const current = Math.min(selectedValue || 1, totalMonths);
  select.innerHTML = '';
  for (let month = 1; month <= totalMonths; month++) {
    const option = document.createElement('option');
    option.value = String(month);
    option.textContent = `Mes ${month}`;
    if (month === current) option.selected = true;
    select.appendChild(option);
  }
}

/**
 * Finds the next available month
 *
 * @return {*} 
 */
function findNextAvailableMonth() {
  const months = [...extrasList.querySelectorAll('.extra-month')].map((select) => parseInt(select.value || '1', 10));
  return Math.max(...months) + 1;
}
  
/**
 * Adds an extra row
 *
 * @param {*} data
 * @return {*} 
 */
/**
 * @param {object} data
 * @param {{ skipRender?: boolean }} [options]
 */
function addExtraRow(data = {}, options = {}) {
  const clone = template.content.firstElementChild.cloneNode(true);
  let nextAvailableMonth = 1;
  clone.dataset.id = String(++extraSequence);

  const monthSelect = clone.querySelector('.extra-month');
  const amountInput = clone.querySelector('.extra-amount');
  const strategySelect = clone.querySelector('.extra-strategy');
  const removeBtn = clone.querySelector('.remove-extra');

  if(!data?.month) {
    nextAvailableMonth = findNextAvailableMonth();
  }

  fillMonthOptions(monthSelect, data.month || nextAvailableMonth);
  amountInput.value = data.amount ?? '';
  strategySelect.value = data.strategy || 'reduce_term';

  monthSelect.addEventListener('change', render);
  amountInput.addEventListener('input', render);
  strategySelect.addEventListener('change', render);
  removeBtn.addEventListener('click', () => {
    clone.remove();
    render();
  });

  extrasList.appendChild(clone);
  if (!options.skipRender) render();
}

/**
 * Syncs the month selectors
 *
 * @return {*} 
 */
function syncMonthSelectors() {
  const totalMonths = getTotalMonths();
  extrasList.querySelectorAll('.extra-month').forEach((select) => {
    const selected = Math.min(parseInt(select.value || '1', 10), totalMonths);
    fillMonthOptions(select, selected);
  });
}

/**
 * Collects the extras
 *
 * @return {*} 
 */
function collectExtras() {
  return [...extrasList.querySelectorAll('.extra-row')]
    .map((row, index) => ({
      order: index,
      month: parseInt(row.querySelector('.extra-month').value || '1', 10),
      amount: Math.max(0, toNumber(row.querySelector('.extra-amount').value)),
      strategy: row.querySelector('.extra-strategy').value
    }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => a.month - b.month || a.order - b.order);
}

/**
 * Simulates the loan
 *
 * @param {*} principal
 * @param {*} annualRate
 * @param {*} years
 * @param {*} extras
 * @return {*} 
 */
function simulateLoan({ principal, annualRate, years, extras }) {
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
      extraApplied: monthExtraApplied
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
 * Renders the amortization table
 *
 * @param {*} rows
 * @return {*} 
 */
function renderTable(rows) {
  amortizationBody.innerHTML = '';

  if (!rows.length) {
    emptyState.style.display = 'block';
    tableSummary.textContent = '0 filas';
    return;
  }

  emptyState.style.display = 'none';
  tableSummary.textContent = `${formatNumber(rows.length)} filas`;

  const fragment = document.createDocumentFragment();
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    if (row.hasExtra) tr.classList.add('has-extra');

    const monthCell = document.createElement('td');
    monthCell.textContent = row.month;
    if (row.hasExtra) {
      const chip = document.createElement('span');
      chip.className = 'extra-chip';
      chip.textContent = `+ ${formatCurrency(row.extraApplied)}`;
      monthCell.appendChild(chip);
    }

    const paymentCell = document.createElement('td');
    paymentCell.textContent = formatCurrency(row.payment);

    const interestCell = document.createElement('td');
    interestCell.textContent = formatCurrency(row.interest);

    const principalCell = document.createElement('td');
    principalCell.textContent = formatCurrency(row.principal);

    const balanceCell = document.createElement('td');
    balanceCell.textContent = formatCurrency(row.balance);

    tr.append(monthCell, paymentCell, interestCell, principalCell, balanceCell);
    fragment.appendChild(tr);
  });

  amortizationBody.appendChild(fragment);
}

/**
 * Shared loan + scenario for exports. Returns null if inputs are invalid.
 *
 * @return {null|{ principal: number, annualRate: number, years: number, extras: Array, baseline: object, scenario: object }}
 */
function buildExportScenario() {
  const principal = Math.max(0, toNumber(loanAmountInput.value));
  const annualRate = Math.max(0, toNumber(annualRateInput.value));
  const years = Math.max(1, Math.floor(toNumber(termYearsInput.value)));
  const extras = collectExtras();
  if (principal <= 0 || years <= 0) return null;
  const baseline = simulateLoan({ principal, annualRate, years, extras: [] });
  const scenario = simulateLoan({ principal, annualRate, years, extras });
  return { principal, annualRate, years, extras, baseline, scenario };
}

const LOAN_DATA_FORMAT = 'loan-calculator-scenario';
const LOAN_DATA_VERSION = 1;
const ALLOWED_STRATEGIES = new Set(['reduce_term', 'reduce_payment']);

/**
 * Serializa el escenario actual para archivo JSON (importación posterior).
 *
 * @return {object|null}
 */
function buildLoanDataPayload() {
  const principal = Math.max(0, toNumber(loanAmountInput.value));
  const annualRate = Math.max(0, toNumber(annualRateInput.value));
  const years = Math.max(1, Math.floor(toNumber(termYearsInput.value)));
  const extras = collectExtras();
  if (principal <= 0 || years <= 0) return null;
  return {
    format: LOAN_DATA_FORMAT,
    version: LOAN_DATA_VERSION,
    exportedAt: new Date().toISOString(),
    loan: {
      principal,
      annualRatePercent: annualRate,
      termYears: years,
      currencyId: getCurrencyById(currencySelect.value).id
    },
    extras: extras.map((e) => ({
      month: e.month,
      amount: e.amount,
      strategy: e.strategy
    }))
  };
}

/**
 * Valida un objeto importado y devuelve datos listos para aplicar al formulario.
 *
 * @param {*} raw
 * @return {{ ok: true, loan: object, extras: Array } | { ok: false, errors: string[] }}
 */
function validateLoanImportPayload(raw) {
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

function exportLoanDataJson() {
  const payload = buildLoanDataPayload();
  if (!payload) {
    alert('Completa los datos del préstamo (monto y plazo válidos) para guardar el escenario.');
    return;
  }

  const text = JSON.stringify(payload, null, 2);
  const fname = `prestamo-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fname;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * @param {object} loan
 * @param {Array<{ month: number, amount: number, strategy: string }>} extras
 */
function applyImportedLoan(loan, extras) {
  loanAmountInput.value = String(loan.principal);
  annualRateInput.value = String(loan.annualRatePercent);
  termYearsInput.value = String(loan.termYears);
  if (loan.currencyId && ALLOWED_CURRENCY_IDS.has(loan.currencyId)) {
    currencySelect.value = loan.currencyId;
  }
  extrasList.innerHTML = '';
  extras.forEach((e) => {
    addExtraRow(
      { month: e.month, amount: e.amount, strategy: e.strategy },
      { skipRender: true }
    );
  });
  render();
}

function handleImportFileChange(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(String(reader.result || ''));
    } catch {
      alert('No se pudo leer el archivo. Comprueba que sea JSON válido.');
      return;
    }

    const result = validateLoanImportPayload(parsed);
    if (!result.ok) {
      alert(`No se pudo cargar el escenario:\n\n${result.errors.join('\n')}`);
      return;
    }

    applyImportedLoan(result.loan, result.extras);
  };
  reader.onerror = () => {
    alert('Error al leer el archivo.');
  };
  reader.readAsText(file, 'UTF-8');
}

/**
 * @param {string} text
 * @return {string}
 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Excel via HTML table (opens in Excel with row background colors, sin dependencias).
 */
function exportExcel() {
  const ctx = buildExportScenario();
  if (!ctx) {
    alert('Completa los datos del préstamo para exportar.');
    return;
  }

  const { principal, annualRate, years, baseline, scenario } = ctx;
  const headerBg = '#11213F';
  const headerFg = '#FFFFFF';
  const rowExtraBg = '#EEF4FF';
  const rowNormalBg = '#FFFFFF';
  const border = '#DBE3F0';

  const summaryRows = [
    ['Monto del préstamo', formatCurrency(principal)],
    ['Tasa de interés anual', `${annualRate}%`],
    ['Plazo', `${years} año(s)`],
    ['Cuota mensual base', formatCurrency(baseline.standardPayment)],
    ['Meses estimados', formatNumber(scenario.totalMonthsUsed)],
    ['Meses ahorrados', formatNumber(Math.max(0, baseline.totalMonthsUsed - scenario.totalMonthsUsed))],
    ['Intereses totales', formatCurrency(scenario.totalInterest)],
    ['Total pagado', formatCurrency(scenario.totalPaid)],
    ['Ahorro estimado en intereses', formatCurrency(Math.max(0, baseline.totalInterest - scenario.totalInterest))]
  ];

  let summaryHtml = summaryRows
    .map(
      ([k, v]) =>
        `<tr><td style="border:1px solid ${border};padding:6px 10px;font-weight:700;">${escapeHtml(k)}</td>` +
        `<td style="border:1px solid ${border};padding:6px 10px;">${escapeHtml(v)}</td></tr>`
    )
    .join('');

  if (scenario.ignoredExtras.length) {
    summaryHtml += `<tr><td colspan="2" style="border:1px solid ${border};padding:8px 10px;color:#8d2d2d;background:#fff5f5;">${escapeHtml(
      `Aviso: se ignoraron ${scenario.ignoredExtras.length} abono(s) programados tras liquidar el préstamo.`
    )}</td></tr>`;
  }

  const thead = `<tr>${['Mes', 'Cuota', 'Interés', 'Capital', 'Saldo pendiente', 'Abono extra']
    .map(
      (h) =>
        `<th style="background-color:${headerBg};color:${headerFg};border:1px solid ${headerBg};padding:8px 10px;text-align:left;">${escapeHtml(
          h
        )}</th>`
    )
    .join('')}</tr>`;

  const tbody = scenario.rows
    .map((row) => {
      const bg = row.hasExtra ? rowExtraBg : rowNormalBg;
      const abono = row.hasExtra ? formatCurrency(row.extraApplied) : '—';
      const mes = row.hasExtra ? `${row.month} (abono)` : String(row.month);
      return (
        `<tr style="background-color:${bg};">` +
        `<td style="border:1px solid ${border};padding:6px 10px;">${escapeHtml(mes)}</td>` +
        `<td style="border:1px solid ${border};padding:6px 10px;">${escapeHtml(formatCurrency(row.payment))}</td>` +
        `<td style="border:1px solid ${border};padding:6px 10px;">${escapeHtml(formatCurrency(row.interest))}</td>` +
        `<td style="border:1px solid ${border};padding:6px 10px;">${escapeHtml(formatCurrency(row.principal))}</td>` +
        `<td style="border:1px solid ${border};padding:6px 10px;">${escapeHtml(formatCurrency(row.balance))}</td>` +
        `<td style="border:1px solid ${border};padding:6px 10px;">${escapeHtml(abono)}</td>` +
        `</tr>`
      );
    })
    .join('');

  const footnote = scenario.rows.some((r) => r.hasExtra)
    ? `<p style="font-size:11px;color:#6f8196;margin-top:10px;">Filas con fondo azul claro: mes con abono extraordinario. La columna Abono extra muestra el monto aplicado a capital.</p>`
    : '';

  const html =
    '<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
    'xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8">' +
    '<meta name="ExcelCreated" content="loan-calculator"></head><body>' +
    `<h2 style="font-family:Segoe UI,Arial,sans-serif;color:${headerBg};">Tabla de amortización</h2>` +
    `<p style="font-family:Segoe UI,Arial,sans-serif;color:#6f8196;font-size:12px;">Generado: ${escapeHtml(
      new Date().toLocaleString('es-DO')
    )}</p>` +
    `<table style="border-collapse:collapse;font-family:Segoe UI,Arial,sans-serif;font-size:12px;margin-bottom:16px;">${summaryHtml}</table>` +
    `<table style="border-collapse:collapse;font-family:Segoe UI,Arial,sans-serif;font-size:12px;">` +
    `<thead>${thead}</thead><tbody>${tbody}</tbody></table>${footnote}</body></html>`;

  const fname = `amortizacion-${new Date().toISOString().slice(0, 10)}.xls`;
  const blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fname;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Builds a PDF with summary and amortization table (requires jsPDF + autotable from CDN).
 */
function exportPdf() {
  const ctx = buildExportScenario();
  if (!ctx) {
    alert('Completa los datos del préstamo para exportar.');
    return;
  }

  if (!window.jspdf || typeof window.jspdf.jsPDF !== 'function') {
    alert('No se pudo cargar la librería de PDF. Comprueba tu conexión e inténtalo de nuevo.');
    return;
  }

  const { principal, annualRate, years, baseline, scenario } = ctx;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  let y = 14;
  doc.setFontSize(16);
  doc.setTextColor(22, 48, 74);
  doc.text('Tabla de amortización', 14, y);
  y += 8;
  doc.setFontSize(10);
  doc.setTextColor(80, 90, 110);
  doc.text(`Generado: ${new Date().toLocaleString('es-DO')}`, 14, y);
  y += 7;
  doc.setTextColor(22, 48, 74);

  const summaryLines = [
    `Monto del préstamo: ${formatCurrency(principal)}`,
    `Tasa de interés anual: ${annualRate}%`,
    `Plazo: ${years} año(s)`,
    `Cuota mensual base: ${formatCurrency(baseline.standardPayment)}`,
    `Meses estimados: ${formatNumber(scenario.totalMonthsUsed)}`,
    `Meses ahorrados: ${formatNumber(Math.max(0, baseline.totalMonthsUsed - scenario.totalMonthsUsed))}`,
    `Intereses totales: ${formatCurrency(scenario.totalInterest)}`,
    `Total pagado: ${formatCurrency(scenario.totalPaid)}`,
    `Ahorro estimado en intereses: ${formatCurrency(Math.max(0, baseline.totalInterest - scenario.totalInterest))}`
  ];
  summaryLines.forEach((line) => {
    doc.text(line, 14, y);
    y += 5;
  });
  y += 3;

  if (scenario.ignoredExtras.length) {
    doc.setFontSize(9);
    doc.setTextColor(180, 60, 60);
    doc.text(
      `Aviso: se ignoraron ${scenario.ignoredExtras.length} abono(s) programados tras liquidar el préstamo.`,
      14,
      y
    );
    y += 6;
    doc.setTextColor(22, 48, 74);
  }

  const body = scenario.rows.map((row) => [
    String(row.month) + (row.hasExtra ? ' *' : ''),
    formatCurrency(row.payment),
    formatCurrency(row.interest),
    formatCurrency(row.principal),
    formatCurrency(row.balance)
  ]);

  const abonoRowFill = [238, 244, 255];

  doc.autoTable({
    startY: y,
    head: [['Mes', 'Cuota', 'Interés', 'Capital', 'Saldo pendiente']],
    body,
    styles: { fontSize: 8, cellPadding: 1.8, textColor: [22, 48, 74] },
    headStyles: { fillColor: [17, 33, 63], textColor: 255 },
    margin: { left: 14, right: 14 },
    tableWidth: 'auto',
    didParseCell(data) {
      if (data.section === 'body') {
        const src = scenario.rows[data.row.index];
        if (src && src.hasExtra) {
          data.cell.styles.fillColor = abonoRowFill;
        }
      }
    }
  });

  const finalY = doc.lastAutoTable?.finalY ?? y;
  if (scenario.rows.some((r) => r.hasExtra)) {
    doc.setFontSize(8);
    doc.setTextColor(100, 110, 120);
    doc.text('* Mes con abono extraordinario.', 14, finalY + 6);
  }

  const fname = `amortizacion-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fname);
}

/**
 * Renders the amortization table
 *
 * @return {*} 
 */
function render() {
  syncMonthSelectors();

  const principal = Math.max(0, toNumber(loanAmountInput.value));
  const annualRate = Math.max(0, toNumber(annualRateInput.value));
  const years = Math.max(1, Math.floor(toNumber(termYearsInput.value)));
  const extras = collectExtras();

  if (principal <= 0 || years <= 0) {
    standardPaymentEl.textContent = formatCurrency(0);
    interestSavedEl.textContent = formatCurrency(0);
    estimatedMonthsEl.textContent = '0';
    monthsSavedEl.textContent = '0';
    totalInterestEl.textContent = formatCurrency(0);
    totalPaidEl.textContent = formatCurrency(0);
    warningBox.style.display = 'none';
    renderTable([]);
    return;
  }

  const baseline = simulateLoan({ principal, annualRate, years, extras: [] });
  const scenario = simulateLoan({ principal, annualRate, years, extras });

  standardPaymentEl.textContent = formatCurrency(baseline.standardPayment);
  interestSavedEl.textContent = formatCurrency(Math.max(0, baseline.totalInterest - scenario.totalInterest));
  estimatedMonthsEl.textContent = formatNumber(scenario.totalMonthsUsed);
  monthsSavedEl.textContent = formatNumber(Math.max(0, baseline.totalMonthsUsed - scenario.totalMonthsUsed));
  totalInterestEl.textContent = formatCurrency(scenario.totalInterest);
  totalPaidEl.textContent = formatCurrency(scenario.totalPaid);

  if (scenario.ignoredExtras.length) {
    warningBox.style.display = 'block';
    warningBox.textContent = `Se ignoraron ${scenario.ignoredExtras.length} abono(s) porque el préstamo ya se había liquidado antes de esos meses programados.`;
  } else {
    warningBox.style.display = 'none';
  }

  renderTable(scenario.rows);
}

addExtraBtn.addEventListener('click', () => addExtraRow());
clearExtrasBtn.addEventListener('click', () => {
  extrasList.innerHTML = '';
  render();
});

exportPdfBtn.addEventListener('click', exportPdf);
exportExcelBtn.addEventListener('click', exportExcel);
exportDataBtn.addEventListener('click', exportLoanDataJson);
importDataBtn.addEventListener('click', () => importDataFile.click());
importDataFile.addEventListener('change', handleImportFileChange);

loanAmountInput.addEventListener('input', render);
annualRateInput.addEventListener('input', render);
termYearsInput.addEventListener('input', render);
currencySelect.addEventListener('change', render);

//ADD DEFAULT EXTRA ROWS HERE IF NEEDED
//addExtraRow({ month: 1, amount: 70000, strategy: 'reduce_term' });
render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js');
}