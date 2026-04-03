/**
 * Utilidades de formato numérico y texto seguro para HTML.
 */

/**
 * @param {*} value
 * @returns {number}
 */
export function toNumber(value) {
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : 0;
}

/**
 * @param {*} value
 * @returns {string}
 */
export function formatNumber(value) {
  return new Intl.NumberFormat('es-DO').format(Number.isFinite(value) ? Math.round(value) : 0);
}

/**
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
