/**
 * Definición de monedas y formateo con Intl.
 */

/**
 * @type {ReadonlyArray<{ id: string, code: string, label: string, locale: string }>}
 */
export const CURRENCIES = Object.freeze([
  { id: 'DOP', code: 'DOP', label: 'DOP — Peso dominicano', locale: 'es-DO' },
  { id: 'USD', code: 'USD', label: 'USD — Dólar estadounidense', locale: 'en-US' },
  { id: 'UF', code: 'CLF', label: 'UF — Unidad de fomento (Chile)', locale: 'es-CL' },
  { id: 'CLP', code: 'CLP', label: 'CLP — Peso chileno', locale: 'es-CL' }
]);

export const ALLOWED_CURRENCY_IDS = new Set(CURRENCIES.map((c) => c.id));

/** @type {Record<string, Intl.NumberFormat>} */
const currencyFormatterCache = {};

/**
 * @param {string} currencyId
 * @returns {typeof CURRENCIES[number]}
 */
export function getCurrencyById(currencyId) {
  return CURRENCIES.find((c) => c.id === currencyId) || CURRENCIES[0];
}

/**
 * @param {typeof CURRENCIES[number]} currency
 * @returns {Intl.NumberFormat}
 */
export function getCurrencyFormatter(currency) {
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
 * Rellena el desplegable de monedas y deja una opción seleccionada.
 *
 * @param {HTMLSelectElement} selectEl
 * @param {string} [defaultId='DOP']
 */
export function initCurrencySelect(selectEl, defaultId = 'DOP') {
  CURRENCIES.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.label;
    selectEl.appendChild(opt);
  });
  selectEl.value = defaultId;
}
