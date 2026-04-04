import { ALLOWED_CURRENCY_IDS, getCurrencyById, getCurrencyFormatter, initCurrencySelect } from './lib/currency.js';
import { formatNumber, toNumber } from './lib/format.js';
import { buildLoanDataPayload, validateLoanImportPayload } from './lib/loan-data.js';
import {
  buildExportScenarioFromInputs,
  simulateLoan,
  getMonthsBetweenAbonos,
  maxScheduledAbonoCount,
  buildScheduledAbonoMonths,
  computeMaxUniformExtraAmount
} from './lib/loan-math.js';
import { exportExcel, exportLoanDataJson, exportPdf } from './ui/exports.js';
import { createShowToast } from './ui/toast.js';

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
const toastRegion = document.getElementById('toastRegion');

const openScheduledAbonosBtn = document.getElementById('openScheduledAbonosBtn');
const scheduledAbonosBackdrop = document.getElementById('scheduledAbonosBackdrop');
const scheduledAbonosModal = document.getElementById('scheduledAbonosModal');
const scheduledFrequency = document.getElementById('scheduledFrequency');
const scheduledCount = document.getElementById('scheduledCount');
const scheduledAmount = document.getElementById('scheduledAmount');
const scheduledAmountHint = document.getElementById('scheduledAmountHint');
const scheduledStrategy = document.getElementById('scheduledStrategy');
const scheduledPreview = document.getElementById('scheduledPreview');
const closeScheduledAbonosBtn = document.getElementById('closeScheduledAbonosBtn');
const cancelScheduledAbonosBtn = document.getElementById('cancelScheduledAbonosBtn');
const confirmScheduledAbonosBtn = document.getElementById('confirmScheduledAbonosBtn');
const resetScheduledAbonosBtn = document.getElementById('resetScheduledAbonosBtn');

let extraSequence = 0;
let scheduledModalLastFocus = null;

initCurrencySelect(currencySelect);

const showToast = createShowToast(toastRegion);

function formatCurrency(value) {
  const cur = getCurrencyById(currencySelect.value);
  return getCurrencyFormatter(cur).format(Number.isFinite(value) ? value : 0);
}

function getTotalMonths() {
  const years = Math.max(1, Math.floor(toNumber(termYearsInput.value)));
  return years * 12;
}

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

function findNextAvailableMonth() {
  const months = [...extrasList.querySelectorAll('.extra-month')].map((select) => parseInt(select.value || '1', 10));
  return Math.max(...months) + 1;
}

function findNextAvailableAmount() {
  const extras = collectExtras();
  const lastExtra = extras[extras.length - 1];
  return lastExtra ? lastExtra.amount : 0;
}

/**
 * @param {object} data
 * @param {{ skipRender?: boolean }} [options]
 */
function addExtraRow(data = {}, options = {}) {
  const clone = template.content.firstElementChild.cloneNode(true);
  let nextAvailableMonth = 1;
  let nextAvailableAmount = 0;
  clone.dataset.id = String(++extraSequence);

  const monthSelect = clone.querySelector('.extra-month');
  const amountInput = clone.querySelector('.extra-amount');
  const strategySelect = clone.querySelector('.extra-strategy');
  const removeBtn = clone.querySelector('.remove-extra');

  if (!data?.month) {
    nextAvailableMonth = findNextAvailableMonth();
  }

  if (!data.amount) {
    nextAvailableAmount = findNextAvailableAmount();
  }

  fillMonthOptions(monthSelect, data.month || nextAvailableMonth);
  amountInput.value = data.amount ?? nextAvailableAmount;
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

function syncMonthSelectors() {
  const totalMonths = getTotalMonths();
  extrasList.querySelectorAll('.extra-month').forEach((select) => {
    const selected = Math.min(parseInt(select.value || '1', 10), totalMonths);
    fillMonthOptions(select, selected);
  });
}

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

function hasExistingExtras() {
  return collectExtras().length > 0;
}

function setScheduledModalOpen(open) {
  if (open) {
    scheduledModalLastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    scheduledAbonosBackdrop.classList.add('is-open');
    scheduledAbonosBackdrop.setAttribute('aria-hidden', 'false');
    scheduledAbonosModal.classList.add('is-open');
    scheduledAbonosModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    refreshScheduledModal();
    window.setTimeout(() => {
      scheduledAmount.focus();
    }, 0);
  } else {
    scheduledAbonosBackdrop.classList.remove('is-open');
    scheduledAbonosBackdrop.setAttribute('aria-hidden', 'true');
    scheduledAbonosModal.classList.remove('is-open');
    scheduledAbonosModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (scheduledModalLastFocus && typeof scheduledModalLastFocus.focus === 'function') {
      scheduledModalLastFocus.focus();
    }
    scheduledModalLastFocus = null;
  }
}

function refreshScheduledModal() {
  const principal = Math.max(0, toNumber(loanAmountInput.value));
  const annualRate = Math.max(0, toNumber(annualRateInput.value));
  const years = Math.max(1, Math.floor(toNumber(termYearsInput.value)));
  const totalMonths = years * 12;
  const monthsBetween = getMonthsBetweenAbonos(
    /** @type {'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual'} */ (scheduledFrequency.value)
  );
  const maxCount = maxScheduledAbonoCount(totalMonths, monthsBetween);

  const prevCount = parseInt(scheduledCount.value, 10);
  scheduledCount.innerHTML = '';
  scheduledCount.disabled = false;
  if (maxCount === 0) {
    const opt = document.createElement('option');
    opt.value = '0';
    opt.textContent = 'Ninguno';
    scheduledCount.appendChild(opt);
    scheduledCount.value = '0';
    scheduledCount.disabled = true;
  } else {
    for (let c = 1; c <= maxCount; c++) {
      const opt = document.createElement('option');
      opt.value = String(c);
      opt.textContent = String(c);
      scheduledCount.appendChild(opt);
    }
    const nextCount = Number.isFinite(prevCount) ? Math.min(Math.max(1, prevCount), maxCount) : maxCount;
    scheduledCount.value = String(nextCount);
  }

  const rawCount = parseInt(scheduledCount.value, 10);
  const count = maxCount === 0 ? 0 : Number.isFinite(rawCount) ? rawCount : 1;
  const scheduledMonths = maxCount === 0 ? [] : buildScheduledAbonoMonths(totalMonths, monthsBetween, count);
  const maxExtra =
    principal > 0 && scheduledMonths.length
      ? computeMaxUniformExtraAmount({ principal, annualRate, years, scheduledMonths })
      : 0;

  if (maxExtra > 0) {
    scheduledAmount.max = maxExtra;
    scheduledAmount.setAttribute('max', String(maxExtra));
    scheduledAmountHint.textContent = `Máximo por abono (saldo aplicable en la línea base, sin otros extras): ${formatCurrency(maxExtra)}.`;
  } else {
    scheduledAmount.removeAttribute('max');
    scheduledAmountHint.textContent =
      principal <= 0
        ? 'Ingresa un monto de préstamo válido para calcular el máximo.'
        : 'No hay saldo aplicable en los meses seleccionados; revisa el plazo o la frecuencia.';
  }

  const amt = Math.max(0, toNumber(scheduledAmount.value));
  const capped = maxExtra > 0 ? Math.min(amt, maxExtra) : amt;
  const stratLabel = scheduledStrategy.value === 'reduce_payment' ? 'Reducir cuota' : 'Reducir plazo';

  if (principal <= 0) {
    scheduledPreview.textContent =
      'Completa los datos del préstamo para ver la vista previa y los límites de monto.';
    confirmScheduledAbonosBtn.disabled = true;
    return;
  }

  if (maxCount === 0 || !scheduledMonths.length || maxExtra <= 0) {
    scheduledPreview.textContent =
      maxCount === 0
        ? 'Con el plazo actual no cabe ningún abono a esta frecuencia. Elige otra frecuencia o amplía el plazo.'
        : 'No se pueden colocar abonos con la frecuencia y plazo actuales. Ajusta el préstamo o elige otra frecuencia.';
    confirmScheduledAbonosBtn.disabled = true;
    return;
  }

  confirmScheduledAbonosBtn.disabled = false;

  let monthsText;
  if (scheduledMonths.length <= 10) {
    monthsText = scheduledMonths.join(', ');
  } else {
    monthsText = `${scheduledMonths.slice(0, 10).join(', ')}… (${scheduledMonths.length} meses)`;
  }

  scheduledPreview.textContent = [
    `Meses del abono: ${monthsText}.`,
    `Monto por abono: ${formatCurrency(capped)}${amt > capped ? ` (ajustado al máximo ${formatCurrency(maxExtra)})` : ''}.`,
    `Total programado: ${formatCurrency(capped * scheduledMonths.length)}.`,
    `Estrategia: ${stratLabel}.`
  ].join(' ');
}

function resetScheduledModalDefaults() {
  scheduledFrequency.value = 'monthly';
  scheduledAmount.value = '';
  scheduledStrategy.value = 'reduce_term';
  refreshScheduledModal();
  const totalMonths = Math.max(1, Math.floor(toNumber(termYearsInput.value))) * 12;
  const maxCount = maxScheduledAbonoCount(totalMonths, getMonthsBetweenAbonos('monthly'));
  if (maxCount > 0 && !scheduledCount.disabled) {
    scheduledCount.value = String(maxCount);
    refreshScheduledModal();
  }
}

function confirmScheduledAbonos() {
  const principal = Math.max(0, toNumber(loanAmountInput.value));
  const annualRate = Math.max(0, toNumber(annualRateInput.value));
  const years = Math.max(1, Math.floor(toNumber(termYearsInput.value)));
  if (principal <= 0) {
    showToast('Indica un monto de préstamo mayor que cero.', { title: 'Datos incompletos', variant: 'error' });
    return;
  }

  const totalMonths = years * 12;
  const monthsBetween = getMonthsBetweenAbonos(
    /** @type {'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual'} */ (scheduledFrequency.value)
  );
  const maxCount = maxScheduledAbonoCount(totalMonths, monthsBetween);
  const rawCount = parseInt(scheduledCount.value, 10);
  const count = maxCount === 0 ? 0 : Number.isFinite(rawCount) ? rawCount : 1;
  const scheduledMonths = maxCount === 0 ? [] : buildScheduledAbonoMonths(totalMonths, monthsBetween, count);
  const maxExtra = computeMaxUniformExtraAmount({ principal, annualRate, years, scheduledMonths });
  let amount = Math.max(0, toNumber(scheduledAmount.value));
  if (maxExtra > 0) amount = Math.min(amount, maxExtra);

  if (!scheduledMonths.length || maxExtra <= 0) {
    showToast('No hay meses válidos o saldo aplicable para estos abonos.', { title: 'No se puede aplicar', variant: 'error' });
    return;
  }
  if (amount <= 0) {
    showToast('Indica un monto mayor que cero.', { title: 'Monto requerido', variant: 'error' });
    return;
  }

  if (hasExistingExtras()) {
    const ok = window.confirm(
      'Se eliminarán todos los abonos extraordinarios actuales y se generarán los abonos programados. ¿Deseas continuar?'
    );
    if (!ok) return;
  }

  const strategy = scheduledStrategy.value;
  extrasList.innerHTML = '';
  scheduledMonths.forEach((month, i) => {
    addExtraRow({ month, amount, strategy }, { skipRender: i < scheduledMonths.length - 1 });
  });

  setScheduledModalOpen(false);
  showToast('Se aplicaron los abonos programados y se actualizó la tabla.', { title: 'Abonos programados' });
}

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

    const nextRegularCell = document.createElement('td');
    nextRegularCell.textContent =
      row.scheduledNextRegular !== undefined ? formatCurrency(row.scheduledNextRegular) : formatCurrency(0);

    const monthsLeftCell = document.createElement('td');
    monthsLeftCell.textContent =
      row.scheduleMonthsRemaining !== undefined ? formatNumber(row.scheduleMonthsRemaining) : '0';

    tr.append(monthCell, paymentCell, interestCell, principalCell, balanceCell, nextRegularCell);
    fragment.appendChild(tr);
  });

  amortizationBody.appendChild(fragment);
}

function getFormExportInputs() {
  const principal = Math.max(0, toNumber(loanAmountInput.value));
  const annualRate = Math.max(0, toNumber(annualRateInput.value));
  const years = Math.max(1, Math.floor(toNumber(termYearsInput.value)));
  const extras = collectExtras();
  return { principal, annualRate, years, extras };
}

function getExportScenario() {
  const { principal, annualRate, years, extras } = getFormExportInputs();
  return buildExportScenarioFromInputs({ principal, annualRate, years, extras });
}

function getLoanPayload() {
  const { principal, annualRate, years, extras } = getFormExportInputs();
  const currencyId = getCurrencyById(currencySelect.value).id;
  return buildLoanDataPayload({ principal, annualRate, years, extras, currencyId });
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
    showToast('Los datos del archivo se aplicaron a la calculadora.', { title: 'Simulación cargada' });
  };
  reader.onerror = () => {
    alert('Error al leer el archivo.');
  };
  reader.readAsText(file, 'UTF-8');
}

const exportDeps = {
  getExportScenario,
  getLoanPayload,
  formatCurrency,
  formatNumber,
  showToast
};

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

exportPdfBtn.addEventListener('click', () => exportPdf(exportDeps));
exportExcelBtn.addEventListener('click', () => exportExcel(exportDeps));
exportDataBtn.addEventListener('click', () => exportLoanDataJson(exportDeps));
importDataBtn.addEventListener('click', () => importDataFile.click());
importDataFile.addEventListener('change', handleImportFileChange);

openScheduledAbonosBtn.addEventListener('click', () => setScheduledModalOpen(true));
closeScheduledAbonosBtn.addEventListener('click', () => setScheduledModalOpen(false));
cancelScheduledAbonosBtn.addEventListener('click', () => setScheduledModalOpen(false));
confirmScheduledAbonosBtn.addEventListener('click', confirmScheduledAbonos);
resetScheduledAbonosBtn.addEventListener('click', resetScheduledModalDefaults);

scheduledFrequency.addEventListener('change', refreshScheduledModal);
scheduledCount.addEventListener('change', refreshScheduledModal);
scheduledAmount.addEventListener('input', refreshScheduledModal);
scheduledStrategy.addEventListener('change', refreshScheduledModal);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && scheduledAbonosModal.classList.contains('is-open')) {
    e.preventDefault();
    setScheduledModalOpen(false);
  }
});

function refreshScheduledModalIfOpen() {
  if (scheduledAbonosModal.classList.contains('is-open')) refreshScheduledModal();
}

loanAmountInput.addEventListener('input', () => {
  render();
  refreshScheduledModalIfOpen();
});
annualRateInput.addEventListener('input', () => {
  render();
  refreshScheduledModalIfOpen();
});
termYearsInput.addEventListener('input', () => {
  render();
  refreshScheduledModalIfOpen();
});
currencySelect.addEventListener('change', () => {
  render();
  refreshScheduledModalIfOpen();
});

render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js');
}
