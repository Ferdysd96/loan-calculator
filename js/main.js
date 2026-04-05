import { ALLOWED_CURRENCY_IDS, getCurrencyById, getCurrencyFormatter, initCurrencySelect } from './lib/currency.js';
import { formatNumber, toNumber } from './lib/format.js';
import { buildLoanDataPayload, validateLoanImportPayload } from './lib/loan-data.js';
import {
  buildExportScenarioFromInputs,
  simulateLoan,
  getMonthsBetweenAbonos,
  maxScheduledAbonoCount,
  computeUniformExtraForTargetPayoff,
  computeFixedAbonoCountBounds,
  previewFixedAmountAbonoPlan
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
const scheduledTabBtnTarget = document.getElementById('scheduledTabBtnTarget');
const scheduledTabBtnFixed = document.getElementById('scheduledTabBtnFixed');
const scheduledPanelTarget = document.getElementById('scheduledPanelTarget');
const scheduledPanelFixed = document.getElementById('scheduledPanelFixed');
const scheduledFrequency = document.getElementById('scheduledFrequency');
const scheduledTargetMonths = document.getElementById('scheduledTargetMonths');
const scheduledStrategy = document.getElementById('scheduledStrategy');
const scheduledStartFromMonthOne = document.getElementById('scheduledStartFromMonthOne');
const fixedAbonoAmount = document.getElementById('fixedAbonoAmount');
const fixedAbonoFrequency = document.getElementById('fixedAbonoFrequency');
const fixedAbonoStartFromMonthOne = document.getElementById('fixedAbonoStartFromMonthOne');
const fixedAbonoCount = document.getElementById('fixedAbonoCount');
const fixedAbonoStrategy = document.getElementById('fixedAbonoStrategy');
const scheduledPreview = document.getElementById('scheduledPreview');
const closeScheduledAbonosBtn = document.getElementById('closeScheduledAbonosBtn');
const cancelScheduledAbonosBtn = document.getElementById('cancelScheduledAbonosBtn');
const confirmScheduledAbonosBtn = document.getElementById('confirmScheduledAbonosBtn');
const resetScheduledAbonosBtn = document.getElementById('resetScheduledAbonosBtn');
const scheduledReplaceConfirmBackdrop = document.getElementById('scheduledReplaceConfirmBackdrop');
const scheduledReplaceConfirmModal = document.getElementById('scheduledReplaceConfirmModal');
const closeScheduledReplaceConfirmBtn = document.getElementById('closeScheduledReplaceConfirmBtn');
const cancelScheduledReplaceConfirmBtn = document.getElementById('cancelScheduledReplaceConfirmBtn');
const applyScheduledReplaceConfirmBtn = document.getElementById('applyScheduledReplaceConfirmBtn');

let extraSequence = 0;
let scheduledModalLastFocus = null;
let scheduledReplaceConfirmLastFocus = null;
/** @type {number | null} Último maxK válido del tab «monto fijo», para detectar cambios de rango. */
let lastScheduledFixedMaxK = null;

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
    const totalMonthsOpen = Math.max(1, Math.floor(toNumber(termYearsInput.value))) * 12;
    if (!String(scheduledTargetMonths.value || '').trim()) {
      const def = Math.min(Math.max(1, totalMonthsOpen - 12), totalMonthsOpen);
      scheduledTargetMonths.value = String(def);
    }
    fixedAbonoAmount.max = String(Math.max(0, toNumber(loanAmountInput.value)));
    refreshScheduledModal();
    window.setTimeout(() => {
      if (getActiveScheduledTab() === 'fixed') fixedAbonoAmount.focus();
      else scheduledTargetMonths.focus();
    }, 0);
  } else {
    if (scheduledReplaceConfirmModal.classList.contains('is-open')) {
      scheduledReplaceConfirmBackdrop.classList.remove('is-open');
      scheduledReplaceConfirmBackdrop.setAttribute('aria-hidden', 'true');
      scheduledReplaceConfirmModal.classList.remove('is-open');
      scheduledReplaceConfirmModal.setAttribute('aria-hidden', 'true');
      scheduledReplaceConfirmLastFocus = null;
    }
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

function getActiveScheduledTab() {
  return scheduledPanelFixed.classList.contains('is-active') ? 'fixed' : 'target';
}

/**
 * @param {'target' | 'fixed'} tab
 */
function setScheduledTab(tab) {
  const isTarget = tab === 'target';
  scheduledTabBtnTarget.classList.toggle('is-active', isTarget);
  scheduledTabBtnTarget.setAttribute('aria-selected', String(isTarget));
  scheduledTabBtnFixed.classList.toggle('is-active', !isTarget);
  scheduledTabBtnFixed.setAttribute('aria-selected', String(!isTarget));
  scheduledPanelTarget.classList.toggle('is-active', isTarget);
  scheduledPanelFixed.classList.toggle('is-active', !isTarget);
  scheduledPanelTarget.setAttribute('aria-hidden', String(!isTarget));
  scheduledPanelFixed.setAttribute('aria-hidden', String(isTarget));
  refreshScheduledModal();
}

function refreshScheduledModal() {
  if (getActiveScheduledTab() === 'fixed') refreshScheduledModalFixed();
  else refreshScheduledModalTarget();
}

function refreshScheduledModalTarget() {
  const principal = Math.max(0, toNumber(loanAmountInput.value));
  const annualRate = Math.max(0, toNumber(annualRateInput.value));
  const years = Math.max(1, Math.floor(toNumber(termYearsInput.value)));
  const totalMonths = years * 12;
  scheduledTargetMonths.min = '1';
  scheduledTargetMonths.max = String(totalMonths);

  const rawStr = String(scheduledTargetMonths.value ?? '').trim();
  if (!rawStr) {
    scheduledPreview.textContent = 'Indica en cuántos meses deseas terminar el préstamo.';
    confirmScheduledAbonosBtn.disabled = true;
    return;
  }

  const rawTarget = parseInt(rawStr, 10);
  const startFromMonthOne = scheduledStartFromMonthOne.checked;
  const monthsBetween = getMonthsBetweenAbonos(
    /** @type {'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual'} */ (scheduledFrequency.value)
  );
  const stratLabel = scheduledStrategy.value === 'reduce_payment' ? 'Reducir cuota' : 'Reducir plazo';

  if (principal <= 0) {
    scheduledPreview.textContent =
      'Completa los datos del préstamo para ver la vista previa y el monto calculado.';
    confirmScheduledAbonosBtn.disabled = true;
    return;
  }

  if (!Number.isFinite(rawTarget) || rawTarget <= 0) {
    scheduledPreview.textContent = 'Indica un objetivo de meses mayor que cero.';
    confirmScheduledAbonosBtn.disabled = true;
    return;
  }

  if (rawTarget > totalMonths) {
    scheduledPreview.textContent = `El objetivo no puede superar el plazo (${totalMonths} meses).`;
    confirmScheduledAbonosBtn.disabled = true;
    return;
  }

  const maxAbonosByTarget =
    rawTarget > 0 ? maxScheduledAbonoCount(rawTarget, monthsBetween, startFromMonthOne) : 0;

  if (rawTarget < totalMonths && maxAbonosByTarget === 0) {
    scheduledPreview.textContent =
      'Con esta frecuencia no cabe ningún abono dentro del objetivo de meses. Elige otra frecuencia, marca «Comenzar desde el mes 1» o aumenta el objetivo de meses.';
    confirmScheduledAbonosBtn.disabled = true;
    return;
  }

  const result = computeUniformExtraForTargetPayoff({
    principal,
    annualRate,
    years,
    targetMonths: rawTarget,
    frequencyId: /** @type {'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual'} */ (
      scheduledFrequency.value
    ),
    startFromMonthOne,
    strategy: scheduledStrategy.value
  });

  if (!result) {
    scheduledPreview.textContent =
      'No se pudo calcular un plan uniforme con estos datos. Prueba otro objetivo de meses o otra frecuencia.';
    confirmScheduledAbonosBtn.disabled = true;
    return;
  }

  const { amount, scheduledMonths } = result;

  if (rawTarget < totalMonths && scheduledMonths.length > 0 && amount <= 0) {
    scheduledPreview.textContent =
      'No se obtuvo un monto de abono válido con esta estrategia. Prueba «Reducir plazo» u otra combinación de meses y frecuencia.';
    confirmScheduledAbonosBtn.disabled = true;
    return;
  }

  if (rawTarget === totalMonths) {
    scheduledPreview.textContent = `Sin abonos extraordinarios: liquidación en el plazo original (${totalMonths} meses). Al confirmar se limpiarán los abonos actuales.`;
    confirmScheduledAbonosBtn.disabled = false;
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
    `Objetivo: terminar en ${rawTarget} meses (plazo original ${totalMonths} meses).`,
    `Meses de abono: ${monthsText}.`,
    `Monto aproximado por abono: ${formatCurrency(amount)}.`,
    `Total abonos extraordinarios: ${formatCurrency(amount * scheduledMonths.length)}.`,
    `Estrategia: ${stratLabel}.`
  ].join(' ');
}

/**
 * @param {number} minK
 * @param {number} maxK
 * @param {number} [preferred]
 */
function populateFixedAbonoCountOptions(minK, maxK, preferred) {
  fixedAbonoCount.innerHTML = '';
  for (let k = minK; k <= maxK; k++) {
    const opt = document.createElement('option');
    opt.value = String(k);
    opt.textContent = `${k} abono${k === 1 ? '' : 's'}`;
    fixedAbonoCount.appendChild(opt);
  }
  let use = maxK;
  if (Number.isFinite(preferred) && preferred >= minK && preferred <= maxK) use = preferred;
  fixedAbonoCount.value = String(use);
}

function refreshScheduledModalFixed() {
  const principal = Math.max(0, toNumber(loanAmountInput.value));
  const annualRate = Math.max(0, toNumber(annualRateInput.value));
  const years = Math.max(1, Math.floor(toNumber(termYearsInput.value)));
  const totalMonths = years * 12;
  fixedAbonoAmount.max = principal > 0 ? String(principal) : '';

  const freq = /** @type {'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual'} */ (
    fixedAbonoFrequency.value
  );
  const startFixed = fixedAbonoStartFromMonthOne.checked;
  const stratFixed = fixedAbonoStrategy.value;
  const stratLabelFixed = stratFixed === 'reduce_payment' ? 'Reducir cuota' : 'Reducir plazo';
  const amt = Math.max(0, toNumber(fixedAbonoAmount.value));

  if (principal <= 0) {
    scheduledPreview.textContent =
      'Completa los datos del préstamo para ver la vista previa, el rango de abonos y el tiempo estimado.';
    confirmScheduledAbonosBtn.disabled = true;
    fixedAbonoCount.innerHTML = '';
    fixedAbonoCount.disabled = true;
    lastScheduledFixedMaxK = null;
    return;
  }

  if (amt <= 0) {
    scheduledPreview.textContent = 'Indica un monto de abono mayor que cero.';
    confirmScheduledAbonosBtn.disabled = true;
    fixedAbonoCount.innerHTML = '';
    fixedAbonoCount.disabled = true;
    lastScheduledFixedMaxK = null;
    return;
  }

  if (amt > principal) {
    scheduledPreview.textContent = 'El abono no puede superar el capital del préstamo.';
    confirmScheduledAbonosBtn.disabled = true;
    fixedAbonoCount.innerHTML = '';
    fixedAbonoCount.disabled = true;
    lastScheduledFixedMaxK = null;
    return;
  }

  const bounds = computeFixedAbonoCountBounds({
    principal,
    annualRate,
    years,
    amountPerAbono: amt,
    frequencyId: freq,
    startFromMonthOne: startFixed,
    strategy: stratFixed
  });

  if (!bounds) {
    scheduledPreview.textContent =
      'Con esta frecuencia no cabe ningún abono en el plazo o el monto no es válido. Revisa frecuencia y casilla de inicio.';
    confirmScheduledAbonosBtn.disabled = true;
    fixedAbonoCount.innerHTML = '';
    fixedAbonoCount.disabled = true;
    lastScheduledFixedMaxK = null;
    return;
  }

  const prevK = parseInt(fixedAbonoCount.value, 10);
  const maxKChanged = lastScheduledFixedMaxK !== bounds.maxK;
  lastScheduledFixedMaxK = bounds.maxK;

  let preferred = bounds.maxK;
  if (Number.isFinite(prevK) && prevK >= 1 && prevK <= bounds.maxK && !maxKChanged) {
    preferred = prevK;
  }

  populateFixedAbonoCountOptions(1, bounds.maxK, preferred);
  fixedAbonoCount.disabled = false;

  const k = parseInt(fixedAbonoCount.value, 10);
  const preview = previewFixedAmountAbonoPlan({
    principal,
    annualRate,
    years,
    amountPerAbono: amt,
    frequencyId: freq,
    startFromMonthOne: startFixed,
    strategy: stratFixed,
    abonoCount: k
  });

  if (!preview) {
    scheduledPreview.textContent = 'No se pudo calcular la vista previa.';
    confirmScheduledAbonosBtn.disabled = true;
    return;
  }

  const { scheduledMonths, scenario, baseline, monthsSaved, interestSaved } = preview;
  const monthsToPay = scenario.totalMonthsUsed;
  let monthsText;
  if (scheduledMonths.length <= 12) {
    monthsText = scheduledMonths.join(', ');
  } else {
    monthsText = `${scheduledMonths.slice(0, 12).join(', ')}… (${scheduledMonths.length} en total)`;
  }

  const lines = [
    `Meses de aplicación del abono: ${monthsText}.`,
    `Tiempo total estimado: ${formatNumber(monthsToPay)} meses (plazo original ${formatNumber(baseline.totalMonthsUsed)}).`,
    `Ahorro estimado en intereses: ${formatCurrency(interestSaved)}.`,
    `Estrategia: ${stratLabelFixed}.`
  ];

  if (monthsSaved > 0) {
    lines.unshift(`✅ Reducirás el préstamo en ${formatNumber(monthsSaved)} meses respecto al plan sin abonos extra.`);
  }

  const lowImpact =
    monthsSaved < 3 && interestSaved < baseline.totalInterest * 0.01 && monthsSaved >= 0;
  if (lowImpact && amt > 0) {
    lines.push(
      '⚠️ El monto es muy bajo para generar un impacto significativo en intereses; prueba subir el abono o la frecuencia.'
    );
  }

  if (k > bounds.minK) {
    lines.push(
      `Con ${formatNumber(bounds.minK)} abono${bounds.minK === 1 ? '' : 's'} ya alcanzas el mismo tiempo mínimo (${formatNumber(bounds.monthsAtFull)} meses); abonar más veces puede no cambiar la fecha de salida.`
    );
  }

  if (k < bounds.minK) {
    lines.push(
      `⚠️ Con menos de ${formatNumber(bounds.minK)} abono${bounds.minK === 1 ? '' : 's'} el préstamo tarda más en liquidarse que usando todos los huecos posibles con este monto (${formatNumber(bounds.monthsAtFull)} meses).`
    );
  }

  scheduledPreview.textContent = lines.join(' ');
  confirmScheduledAbonosBtn.disabled = false;
}

function resetScheduledModalDefaults() {
  scheduledFrequency.value = 'monthly';
  scheduledStrategy.value = 'reduce_term';
  scheduledStartFromMonthOne.checked = true;
  fixedAbonoFrequency.value = 'monthly';
  fixedAbonoStartFromMonthOne.checked = true;
  fixedAbonoStrategy.value = 'reduce_term';
  fixedAbonoAmount.value = '';
  lastScheduledFixedMaxK = null;
  const totalMonths = Math.max(1, Math.floor(toNumber(termYearsInput.value))) * 12;
  scheduledTargetMonths.value = String(Math.min(Math.max(1, totalMonths - 12), totalMonths));
  setScheduledTab('target');
}

/**
 * @returns {{ scheduledMonths: number[], amount: number, strategy: string } | null}
 */
function getFixedAbonoApplyPayload(principal, annualRate, years) {
  const amt = Math.max(0, toNumber(fixedAbonoAmount.value));
  if (amt <= 0) {
    showToast('Indica un monto de abono mayor que cero.', { title: 'Monto requerido', variant: 'error' });
    return null;
  }
  if (amt > principal) {
    showToast('El abono no puede superar el capital del préstamo.', { title: 'Monto inválido', variant: 'error' });
    return null;
  }

  const freq = /** @type {'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual'} */ (
    fixedAbonoFrequency.value
  );
  const startFixed = fixedAbonoStartFromMonthOne.checked;
  const stratFixed = fixedAbonoStrategy.value;

  const bounds = computeFixedAbonoCountBounds({
    principal,
    annualRate,
    years,
    amountPerAbono: amt,
    frequencyId: freq,
    startFromMonthOne: startFixed,
    strategy: stratFixed
  });
  if (!bounds) {
    showToast('No hay un rango válido de abonos con esta frecuencia y monto.', {
      title: 'No se puede aplicar',
      variant: 'error'
    });
    return null;
  }

  const k = parseInt(fixedAbonoCount.value, 10);
  if (!Number.isFinite(k) || k < 1 || k > bounds.maxK) {
    showToast(
      `Elige entre 1 y ${bounds.maxK} abono${bounds.maxK === 1 ? '' : 's'} (máximo de huecos con esta frecuencia y plazo).`,
      {
        title: 'Cantidad inválida',
        variant: 'error'
      }
    );
    return null;
  }

  const preview = previewFixedAmountAbonoPlan({
    principal,
    annualRate,
    years,
    amountPerAbono: amt,
    frequencyId: freq,
    startFromMonthOne: startFixed,
    strategy: stratFixed,
    abonoCount: k
  });

  if (!preview || preview.scheduledMonths.length === 0) {
    showToast('No se pudo generar el plan de abonos.', { title: 'No se puede aplicar', variant: 'error' });
    return null;
  }

  return {
    scheduledMonths: preview.scheduledMonths,
    amount: amt,
    strategy: stratFixed
  };
}

/**
 * Valida y devuelve datos para aplicar abonos programados, o null si hay error (toast ya mostrado).
 * @returns {{ scheduledMonths: number[], amount: number, strategy: string } | null}
 */
function getScheduledApplyPayload() {
  const principal = Math.max(0, toNumber(loanAmountInput.value));
  const annualRate = Math.max(0, toNumber(annualRateInput.value));
  const years = Math.max(1, Math.floor(toNumber(termYearsInput.value)));
  if (principal <= 0) {
    showToast('Indica un monto de préstamo mayor que cero.', { title: 'Datos incompletos', variant: 'error' });
    return null;
  }

  if (getActiveScheduledTab() === 'fixed') {
    return getFixedAbonoApplyPayload(principal, annualRate, years);
  }

  const totalMonths = years * 12;
  const rawTarget = parseInt(String(scheduledTargetMonths.value ?? '').trim(), 10);
  if (!Number.isFinite(rawTarget) || rawTarget <= 0) {
    showToast('Indica un objetivo de meses mayor que cero.', { title: 'Objetivo inválido', variant: 'error' });
    return null;
  }
  if (rawTarget > totalMonths) {
    showToast(`El objetivo no puede ser mayor que el plazo (${totalMonths} meses).`, {
      title: 'Objetivo inválido',
      variant: 'error'
    });
    return null;
  }

  const monthsBetween = getMonthsBetweenAbonos(
    /** @type {'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual'} */ (scheduledFrequency.value)
  );
  const startFromMonthOne = scheduledStartFromMonthOne.checked;

  if (rawTarget < totalMonths && maxScheduledAbonoCount(rawTarget, monthsBetween, startFromMonthOne) === 0) {
    showToast('Con esta frecuencia no cabe al menos un abono dentro del objetivo de meses.', {
      title: 'Frecuencia insuficiente',
      variant: 'error'
    });
    return null;
  }

  const result = computeUniformExtraForTargetPayoff({
    principal,
    annualRate,
    years,
    targetMonths: rawTarget,
    frequencyId: /** @type {'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual'} */ (
      scheduledFrequency.value
    ),
    startFromMonthOne,
    strategy: scheduledStrategy.value
  });

  if (!result) {
    showToast('No se pudo calcular el plan de abonos. Ajusta objetivo o frecuencia.', {
      title: 'No se puede aplicar',
      variant: 'error'
    });
    return null;
  }

  const { amount, scheduledMonths, strategy } = result;

  if (rawTarget < totalMonths && scheduledMonths.length > 0 && amount <= 0) {
    showToast(
      'Con la estrategia elegida no se obtiene un monto positivo. Prueba «Reducir plazo» u otra combinación.',
      { title: 'No se puede aplicar', variant: 'error' }
    );
    return null;
  }

  return {
    scheduledMonths,
    amount,
    strategy
  };
}

/**
 * @param {{ scheduledMonths: number[], amount: number, strategy: string }} payload
 */
function executeScheduledApply(payload) {
  const { scheduledMonths, amount, strategy } = payload;
  extrasList.innerHTML = '';
  if (scheduledMonths.length === 0) {
    setScheduledReplaceConfirmOpen(false);
    setScheduledModalOpen(false);
    showToast('Se eliminaron los abonos extraordinarios.', { title: 'Abonos programados' });
    render();
    return;
  }
  scheduledMonths.forEach((month, i) => {
    addExtraRow({ month, amount, strategy }, { skipRender: i < scheduledMonths.length - 1 });
  });

  setScheduledReplaceConfirmOpen(false);
  setScheduledModalOpen(false);
  showToast('Se aplicaron los abonos programados y se actualizó la tabla.', { title: 'Abonos programados' });
}

function setScheduledReplaceConfirmOpen(open) {
  if (open) {
    scheduledReplaceConfirmLastFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    scheduledAbonosModal.setAttribute('aria-hidden', 'true');
    scheduledReplaceConfirmBackdrop.classList.add('is-open');
    scheduledReplaceConfirmBackdrop.setAttribute('aria-hidden', 'false');
    scheduledReplaceConfirmModal.classList.add('is-open');
    scheduledReplaceConfirmModal.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => {
      cancelScheduledReplaceConfirmBtn.focus();
    }, 0);
  } else {
    scheduledReplaceConfirmBackdrop.classList.remove('is-open');
    scheduledReplaceConfirmBackdrop.setAttribute('aria-hidden', 'true');
    scheduledReplaceConfirmModal.classList.remove('is-open');
    scheduledReplaceConfirmModal.setAttribute('aria-hidden', 'true');
    if (scheduledAbonosModal.classList.contains('is-open')) {
      scheduledAbonosModal.setAttribute('aria-hidden', 'false');
    }
    if (scheduledReplaceConfirmLastFocus && typeof scheduledReplaceConfirmLastFocus.focus === 'function') {
      scheduledReplaceConfirmLastFocus.focus();
    }
    scheduledReplaceConfirmLastFocus = null;
  }
}

function confirmScheduledAbonos() {
  const payload = getScheduledApplyPayload();
  if (!payload) return;

  if (hasExistingExtras()) {
    setScheduledReplaceConfirmOpen(true);
    return;
  }

  executeScheduledApply(payload);
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

closeScheduledReplaceConfirmBtn.addEventListener('click', () => setScheduledReplaceConfirmOpen(false));
cancelScheduledReplaceConfirmBtn.addEventListener('click', () => setScheduledReplaceConfirmOpen(false));
applyScheduledReplaceConfirmBtn.addEventListener('click', () => {
  const payload = getScheduledApplyPayload();
  if (!payload) {
    setScheduledReplaceConfirmOpen(false);
    return;
  }
  executeScheduledApply(payload);
});
scheduledReplaceConfirmBackdrop.addEventListener('click', () => setScheduledReplaceConfirmOpen(false));

scheduledTabBtnTarget.addEventListener('click', () => setScheduledTab('target'));
scheduledTabBtnFixed.addEventListener('click', () => setScheduledTab('fixed'));

scheduledFrequency.addEventListener('change', refreshScheduledModal);
scheduledTargetMonths.addEventListener('input', refreshScheduledModal);
scheduledTargetMonths.addEventListener('change', refreshScheduledModal);
scheduledStrategy.addEventListener('change', refreshScheduledModal);
scheduledStartFromMonthOne.addEventListener('change', refreshScheduledModal);

fixedAbonoAmount.addEventListener('input', refreshScheduledModal);
fixedAbonoAmount.addEventListener('change', refreshScheduledModal);
fixedAbonoFrequency.addEventListener('change', refreshScheduledModal);
fixedAbonoStartFromMonthOne.addEventListener('change', refreshScheduledModal);
fixedAbonoCount.addEventListener('change', refreshScheduledModal);
fixedAbonoStrategy.addEventListener('change', refreshScheduledModal);

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (scheduledReplaceConfirmModal.classList.contains('is-open')) {
    e.preventDefault();
    setScheduledReplaceConfirmOpen(false);
    return;
  }
  if (scheduledAbonosModal.classList.contains('is-open')) {
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
