import { ALLOWED_CURRENCY_IDS, getCurrencyById, getCurrencyFormatter, initCurrencySelect } from './lib/currency.js';
import { formatNumber, toNumber } from './lib/format.js';
import { buildLoanDataPayload, validateLoanImportPayload } from './lib/loan-data.js';
import { buildExportScenarioFromInputs, simulateLoan } from './lib/loan-math.js';
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

let extraSequence = 0;

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

loanAmountInput.addEventListener('input', render);
annualRateInput.addEventListener('input', render);
termYearsInput.addEventListener('input', render);
currencySelect.addEventListener('change', render);

render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js');
}
