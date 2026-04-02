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

let extraSequence = 0;

const currencyFormatter = new Intl.NumberFormat('es-DO', {
  style: 'currency',
  currency: 'DOP',
  maximumFractionDigits: 0
});

/**
 * Formats a currency value
 *
 * @param {*} value
 * @return {*} 
 */
function formatCurrency(value) {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}

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
function addExtraRow(data = {}) {
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
  render();
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

loanAmountInput.addEventListener('input', render);
annualRateInput.addEventListener('input', render);
termYearsInput.addEventListener('input', render);

//ADD DEFAULT EXTRA ROWS HERE IF NEEDED
//addExtraRow({ month: 1, amount: 70000, strategy: 'reduce_term' });
render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js');
}